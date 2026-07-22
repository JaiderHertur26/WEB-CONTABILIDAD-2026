import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, FileText, Search, BookMarked, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';

const TaxReports = () => {
    const [transactions, , isTransactionsLoaded] = useCompanyData('transactions');
    const [contacts, , isContactsLoaded] = useCompanyData('contacts');
    const [accounts, , isAccountsLoaded] = useCompanyData('accounts');
    const [fixedAssets, , isFixedAssetsLoaded] = useCompanyData('fixedAssets');
    const [realEstates, , isRealEstatesLoaded] = useCompanyData('realEstates');
    const [accountsReceivable, , isARLoaded] = useCompanyData('accountsReceivable');
    const [accountsPayable, , isAPLoaded] = useCompanyData('accountsPayable');
    const [bankAccounts, , isBankAccountsLoaded] = useCompanyData('bankAccounts');
    const [initialBalance, , isInitialBalanceLoaded] = useCompanyData('initialBalance');
    const [cashAccounts, , isCashAccountsLoaded] = useCompanyData('cash_accounts');
    const [inventory, , isInventoryLoaded] = useCompanyData('inventory');

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const { toast } = useToast();

    // HELPER PARA EVITAR EL BUG DE ZONA HORARIA (UTC vs Hora Colombia)
    const getSafeYear = (dateStr) => {
        if (!dateStr) return 0;
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            return parseInt(dateStr.split('-')[0], 10);
        }
        return new Date(dateStr).getFullYear();
    };

    const areAllDataLoaded = useMemo(() => 
        isTransactionsLoaded && 
        isContactsLoaded && 
        isAccountsLoaded && 
        isFixedAssetsLoaded && 
        isRealEstatesLoaded && 
        isARLoaded && 
        isAPLoaded && 
        isBankAccountsLoaded && 
        isInitialBalanceLoaded && 
        isCashAccountsLoaded &&
        isInventoryLoaded, 
    [isTransactionsLoaded, isContactsLoaded, isAccountsLoaded, isFixedAssetsLoaded, isRealEstatesLoaded, isARLoaded, isAPLoaded, isBankAccountsLoaded, isInitialBalanceLoaded, isCashAccountsLoaded, isInventoryLoaded]);

    const availableYears = useMemo(() => {
        const validTransactions = (transactions || []).filter(t => 
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        const years = new Set(validTransactions.map(t => getSafeYear(t.date)));
        const currentYear = new Date().getFullYear();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions]);
    
    const safeParseFloat = (value) => { const parsed = parseFloat(value); return isNaN(parsed) ? 0 : parsed; };

    const generateExogenaData = useMemo(() => {
        if (!areAllDataLoaded) return [];
        const paymentsByContact = {};
        const yearTransactions = (transactions || []).filter(t => 
            getSafeYear(t.date).toString() === selectedYear &&
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        
        yearTransactions.forEach(t => {
            if (t.type === 'expense' && t.contactId) {
                const contactId = t.contactId;
                if (!paymentsByContact[contactId]) {
                    const contactInfo = (contacts || []).find(c => c.id === contactId);
                    if (contactInfo) paymentsByContact[contactId] = { ...contactInfo, total: 0 };
                }
                if (paymentsByContact[contactId]) paymentsByContact[contactId].total += safeParseFloat(t.amount);
            }
        });
        return Object.values(paymentsByContact).map(contact => ({
            'Tipo Doc.': contact.docType,
            'Número Doc.': contact.docNumber,
            'Nombre o Razón Social': contact.name,
            'Dirección': contact.address || '',
            'Teléfono': contact.phone,
            'Email': contact.email,
            'Tipo Contacto': contact.type,
            'Pago o Abono en Cuenta': contact.total
        }));
    }, [transactions, contacts, selectedYear, areAllDataLoaded]);

    const handleExportExogena = () => {
        const data = generateExogenaData;
        if (data.length === 0) { toast({ variant: 'destructive', title: "No hay datos para exportar" }); return; }
        const total = data.reduce((sum, item) => sum + item['Pago o Abono en Cuenta'], 0);
        const footer = { 'Pago o Abono en Cuenta': total };
        exportToExcel(data, `Reporte_Exogena_${selectedYear}`, footer);
        toast({ title: "¡Exportado!", description: `El Reporte de Exógena para ${selectedYear} ha sido generado.` });
    };

    const generateRentaData = useMemo(() => {
        if (!areAllDataLoaded) return [];

        const allTransactions = (transactions || []);
        const validTransactions = allTransactions.filter(t => 
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );

        // Uso de getSafeYear en vez de Date()
        const pnlTransactions = validTransactions.filter(t => getSafeYear(t.date).toString() === selectedYear);
        const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(selectedYear));

        const allAccounts = accounts || [];
        
        const isAssetAccount = (categoryName) => { const account = allAccounts.find(a => a.name === categoryName); return account && String(account.number).startsWith('1'); };
        const isLiabilityAccount = (categoryName) => { const account = allAccounts.find(a => a.name === categoryName); return account && String(account.number).startsWith('2'); };
        const isEquityAccount = (categoryName) => { const account = allAccounts.find(a => a.name === categoryName); return account && String(account.number).startsWith('3'); };

        // Excluimos las cuentas de patrimonio (clase 3) para no ensuciar los ingresos y gastos de la Renta
        const totalIncomes = pnlTransactions.filter(t => t.type === 'income' && !t.isInternalTransfer && t.category !== 'Cuentas por Cobrar' && !isLiabilityAccount(t.category) && !isAssetAccount(t.category) && !isEquityAccount(t.category)).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);
        const totalCostsAndExpenses = pnlTransactions.filter(t => t.type === 'expense' && !t.isInternalTransfer && !t.isFixedAsset && t.category !== 'Cuentas por Pagar' && !isLiabilityAccount(t.category) && !isAssetAccount(t.category) && !isEquityAccount(t.category)).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);
        
        const netProfit = totalIncomes - totalCostsAndExpenses;

        const cashAccountIds = new Set();
        cashAccountIds.add('caja_principal');
        if (allAccounts) { 
            allAccounts.forEach(acc => { 
                if (acc.number === '11050501' || acc.name.toUpperCase() === 'CAJA PRINCIPAL') { 
                    cashAccountIds.add(acc.id); 
                } 
            }); 
        }

        const isAccountMatch = (targetId, accountIdOrString) => {
            if (!accountIdOrString) return false;
            if (accountIdOrString === targetId) return true;
            if (accountIdOrString.startsWith(`${targetId}|`)) return true;
            if (targetId === 'caja_principal' && accountIdOrString.toLowerCase().includes('caja principal')) return true;
            return false;
        };

        // CORRECCIÓN: Filtrar saldo inicial de caja principal por año
        const initialCash = (initialBalance || []).filter(item => {
            if (!item.date) return true; 
            return getSafeYear(item.date) <= parseInt(selectedYear);
        }).reduce((sum, item) => sum + safeParseFloat(item.balance), 0);
        
        let cashIncomes = 0, cashExpenses = 0;
        
        bsTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);
            if (t.debitAccount && t.creditAccount) {
                const drCode = t.debitAccount.code;
                const crCode = t.creditAccount.code;
                const drName = t.debitAccount.name ? t.debitAccount.name.toUpperCase() : '';
                const crName = t.creditAccount.name ? t.creditAccount.name.toUpperCase() : '';
                
                const isDrCaja = drCode === '11050501' || drName.includes('CAJA PRINCIPAL');
                const isCrCaja = crCode === '11050501' || crName.includes('CAJA PRINCIPAL');
                
                if (isDrCaja) cashIncomes += amount;  
                if (isCrCaja) cashExpenses += amount; 
                return; 
            }

            if (t.type === 'income' || t.type === 'expense') {
                if (t.destination && (cashAccountIds.has(t.destination) || t.destination.startsWith('caja_principal'))) {
                    if (t.type === 'income') cashIncomes += amount; else cashExpenses += amount;
                }
            }
            if (t.type === 'transfer') {
                 if (t.fromAccount && (cashAccountIds.has(t.fromAccount) || t.fromAccount.startsWith('caja_principal'))) cashExpenses += amount;
                 if (t.toAccount && (cashAccountIds.has(t.toAccount) || t.toAccount.startsWith('caja_principal'))) cashIncomes += amount;
            }
        });
        const cajaPrincipalBalance = initialCash + cashIncomes - cashExpenses;

        let customCashBalance = 0;
        if (cashAccounts) {
            customCashBalance = cashAccounts.reduce((acc, cashAcc) => {
                let currentBal = 0;
                // CORRECCIÓN: Filtrar saldos iniciales de Cajas Menores/Mayores por año
                if (!cashAcc.date || getSafeYear(cashAcc.date) <= parseInt(selectedYear)) {
                    currentBal = safeParseFloat(cashAcc.initial_balance);
                }
                
                bsTransactions.forEach(t => {
                    const amount = safeParseFloat(t.amount);
                    if (t.debitAccount && t.creditAccount) return;

                    if (t.type !== 'transfer' && t.destination && t.destination.startsWith(cashAcc.id)) {
                        if (t.type === 'income') currentBal += amount; else if (t.type === 'expense') currentBal -= amount;
                    }
                    if (t.type === 'transfer') {
                        if (isAccountMatch(cashAcc.id, t.fromAccount)) currentBal -= amount;
                        if (isAccountMatch(cashAcc.id, t.toAccount)) currentBal += amount;
                    }
                });
                return acc + currentBal;
            }, 0);
        }

        let totalBankBalances = 0, totalInvestmentBalances = 0;
        (bankAccounts || []).forEach(acc => {
            let currentBankBalance = 0;
            let currentInvestmentBalance = 0;
            
            // CORRECCIÓN: Filtrar saldos iniciales de Bancos por año
            if (!acc.date || getSafeYear(acc.date) <= parseInt(selectedYear)) {
                currentBankBalance = safeParseFloat(acc.initialBalance);
                currentInvestmentBalance = safeParseFloat(acc.initialInvestmentBalance);
            }
            
            bsTransactions.forEach(t => {
                const amount = safeParseFloat(t.amount);
                if (t.debitAccount && t.creditAccount) {
                     const drName = t.debitAccount.name || '';
                     const crName = t.creditAccount.name || '';
                     const drCode = t.debitAccount.code || '';
                     const crCode = t.creditAccount.code || '';
                     const isDrBank = drName === acc.bankName || (acc.accountingCode && drCode === acc.accountingCode);
                     const isCrBank = crName === acc.bankName || (acc.accountingCode && crCode === acc.accountingCode);
                     if (isDrBank) currentBankBalance += amount;
                     if (isCrBank) currentBankBalance -= amount;
                     return;
                }

                if (t.type !== 'transfer' && t.destination && t.destination.startsWith(acc.id)) {
                     if (t.type === 'income') { if (t.description?.includes('Aporte Ordinario')) currentInvestmentBalance += amount; else currentBankBalance += amount; } 
                     else currentBankBalance -= amount;
                }
                if (t.type === 'transfer') {
                    if (isAccountMatch(acc.id, t.fromAccount)) currentBankBalance -= amount;
                    if (isAccountMatch(acc.id, t.toAccount)) currentBankBalance += amount;
                }
            });
            totalBankBalances += currentBankBalance;
            totalInvestmentBalances += currentInvestmentBalance;
        });

        const cajaGeneral = cajaPrincipalBalance + customCashBalance + totalBankBalances + totalInvestmentBalances;

        const inventoryValue = (inventory || []).reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
        
        const manualFixedAssetsValue = (fixedAssets || []).filter(asset => {
            if (asset.year) return parseInt(asset.year) <= parseInt(selectedYear);
            if (asset.date) return getSafeYear(asset.date) <= parseInt(selectedYear);
            return false;
        }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
        
        const realEstatesValue = (realEstates || []).filter(estate => getSafeYear(estate.date) <= parseInt(selectedYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);
        const totalNonCurrentAssets = manualFixedAssetsValue + realEstatesValue + inventoryValue;

        const accountsReceivableValue = (accountsReceivable || []).filter(r => {
            const rYear = r.date ? getSafeYear(r.date) : (r.year ? parseInt(r.year) : parseInt(selectedYear));
            return r.status === 'Pendiente' && rYear <= parseInt(selectedYear);
        }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);

        const anticiposTransactions = bsTransactions.filter(t => { const account = allAccounts.find(a => a.name === t.category); return account && account.number.startsWith('1330'); });
        const anticiposValue = anticiposTransactions.reduce((sum, t) => sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

        const construccionesTransactions = bsTransactions.filter(t => { const account = allAccounts.find(a => a.name === t.category); return account && account.number.startsWith('1508'); });
        const construccionesValue = construccionesTransactions.reduce((sum, t) => sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

        const otherAssetsTransactions = bsTransactions.filter(t => { 
            const account = allAccounts.find(a => a.name === t.category); 
            return account && 
                   account.number.startsWith('1') && 
                   t.category !== 'Cuentas por Cobrar' && 
                   !account.number.startsWith('1330') && 
                   !account.number.startsWith('14') && 
                   !account.number.startsWith('15'); 
        });
        const otherAssetsValue = otherAssetsTransactions.reduce((sum, t) => sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

        const accountsPayableValue = (accountsPayable || []).filter(p => {
            const pYear = p.date ? getSafeYear(p.date) : (p.year ? parseInt(p.year) : parseInt(selectedYear));
            return p.status === 'Pendiente' && pYear <= parseInt(selectedYear);
        }).reduce((sum, p) => sum + safeParseFloat(p.amount), 0);
        
        const otherLiabilitiesTransactions = bsTransactions.filter(t => { const account = allAccounts.find(a => a.name === t.category); return account && account.number.startsWith('2') && t.category !== 'Cuentas por Pagar'; });
        const otherLiabilitiesValue = otherLiabilitiesTransactions.reduce((sum, t) => sum + (t.type === 'income' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

        const totalAssets = cajaGeneral + accountsReceivableValue + totalNonCurrentAssets + anticiposValue + construccionesValue + otherAssetsValue;
        const totalDebts = accountsPayableValue + otherLiabilitiesValue;
        const netWorth = totalAssets - totalDebts;

        const dynamicCashAccounts = getDynamicCashAccounts(cashAccounts, validTransactions, selectedYear).filter(acc => {
            const originalAcc = (cashAccounts || []).find(c => c.id === acc.id);
            return !originalAcc?.date || getSafeYear(originalAcc.date) <= parseInt(selectedYear);
        });

        const assetsSection = [
            { Concepto: 'PATRIMONIO BRUTO (Total Activos)', Valor: totalAssets },
            { Concepto: '  Efectivo y Equivalentes (Caja General)', Valor: cajaGeneral },
            { Concepto: '    Caja Principal', Valor: cajaPrincipalBalance },
            ...dynamicCashAccounts.map(acc => ({
                Concepto: `    ${acc.name}`,
                Valor: acc.balance
            })),
            { Concepto: '    Cuentas Bancarias', Valor: totalBankBalances },
            { Concepto: '    Aportes Ordinarios', Valor: totalInvestmentBalances },
            { Concepto: '  Cuentas por Cobrar', Valor: accountsReceivableValue },
            { Concepto: '  Anticipos a Proveedores', Valor: anticiposValue },
            { Concepto: '  Construcciones en Curso', Valor: construccionesValue },
            { Concepto: '  Otros Activos', Valor: otherAssetsValue },
            { Concepto: '  Activos Fijos (Inventario y Propiedades)', Valor: totalNonCurrentAssets },
        ];

        return [
            ...assetsSection,
            { Concepto: 'DEUDAS (Total Pasivos)', Valor: totalDebts },
            { Concepto: '  Cuentas por Pagar', Valor: accountsPayableValue },
            { Concepto: '  Otros Pasivos', Valor: otherLiabilitiesValue },
            { Concepto: 'PATRIMONIO LÍQUIDO (Activos - Pasivos)', Valor: netWorth }, 
            {},
            { Concepto: 'INGRESOS TOTALES (P&L del año)', Valor: totalIncomes },
            { Concepto: 'COSTOS Y GASTOS TOTALES (P&L del año)', Valor: totalCostsAndExpenses },
            { Concepto: 'RENTA LÍQUIDA (Ingresos - Gastos)', Valor: netProfit },
        ];
    }, [transactions, bankAccounts, fixedAssets, realEstates, accountsReceivable, accountsPayable, accounts, initialBalance, cashAccounts, inventory, selectedYear, areAllDataLoaded]);

    const handleExportRenta = () => {
        const data = generateRentaData;
        if (data.length === 0 || !areAllDataLoaded) { toast({ variant: 'destructive', title: "No hay datos para exportar." }); return; }
        exportToExcel(data, `Reporte_Declaracion_Renta_${selectedYear}`);
        toast({ title: "¡Exportado!", description: `El Reporte para Declaración de Renta de ${selectedYear} ha sido generado.` });
    };
    
    return (
        <>
            <Helmet><title>Reportes Tributarios - JaiderHerTur26</title></Helmet>
            <div className="space-y-8">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center"><div><h1 className="text-4xl font-bold text-slate-900">Reportes Tributarios</h1><p className="text-slate-600">Genera tus reportes fiscales.</p></div><div className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-slate-500" /><Label htmlFor="year-select">Año Fiscal:</Label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger id="year-select" className="w-[120px]"><SelectValue placeholder="Año" /></SelectTrigger><SelectContent>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent></Select></div></motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl shadow-lg border"><div className="p-6 border-b flex justify-between items-center"><div className="flex items-center"><FileText className="w-6 h-6 mr-3 text-blue-600" /><h2 className="text-xl font-bold text-slate-900">Pagos a Terceros (Exógena)</h2></div><Button onClick={handleExportExogena}><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button></div><div className="p-6">{!areAllDataLoaded ? <p>Cargando datos...</p> : generateExogenaData.length === 0 ? (<div className="text-center py-10"><Search className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No se encontraron pagos a terceros.</p></div>) : (<div className="overflow-x-auto rounded-lg border max-h-72"><table className="w-full"><thead className="bg-slate-50 sticky top-0"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Nombre o Razón Social</th><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Dirección</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Pago o Abono en Cuenta</th></tr></thead><tbody className="divide-y divide-slate-200">{generateExogenaData.map((row, index) => (<tr key={index} className="hover:bg-slate-50"><td className="px-6 py-4 text-sm font-medium text-slate-900">{row['Nombre o Razón Social']}</td><td className="px-6 py-4 text-sm text-slate-600">{row['Dirección']}</td><td className="px-6 py-4 text-sm font-mono text-right text-red-600">${row['Pago o Abono en Cuenta'].toLocaleString('es-ES', {minimumFractionDigits: 2})}</td ></tr>))}</tbody></table></div>)}</div></motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-xl shadow-lg border"><div className="p-6 border-b flex justify-between items-center"><div className="flex items-center"><BookMarked className="w-6 h-6 mr-3 text-emerald-600" /><h2 className="text-xl font-bold text-slate-900">Declaración de Renta</h2></div><Button onClick={handleExportRenta} variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button></div><div className="p-6"><div className="overflow-x-auto rounded-lg border">{!areAllDataLoaded ? <p className="p-4">Cargando...</p> : <table className="w-full"><thead className="bg-slate-50"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Concepto</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Valor</th></tr></thead><tbody className="divide-y divide-slate-200">{generateRentaData.map((row, index) => (<tr key={index} className={`${row.Concepto?.startsWith('PATRIMONIO') || row.Concepto?.startsWith('DEUDAS') || row.Concepto?.startsWith('RENTA') ? 'bg-slate-100 font-bold' : ''}`}><td className={`px-6 py-3 text-sm font-medium ${row.Concepto?.startsWith('  ') ? 'pl-10' : ''}`}>{row.Concepto}</td><td className={`px-6 py-3 text-sm font-mono text-right`}>{row.Valor != null ? `$${row.Valor.toLocaleString('es-ES', {minimumFractionDigits: 2})}` : ''}</td></tr>))}</tbody></table>}</div></div></motion.div>
            </div>
        </>
    );
};

export default TaxReports;