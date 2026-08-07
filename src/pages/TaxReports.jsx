import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, FileText, Search, BookMarked, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';

const TaxReports = () => {
    const { activeCompany, companies, isConsolidated } = useCompany();

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

    // HELPER PARA EVITAR EL BUG DE ZONA HORARIA
    const getSafeYear = (dateStr) => {
        if (!dateStr) return 0;
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            return parseInt(dateStr.split('-')[0], 10);
        }
        return new Date(dateStr).getFullYear();
    };

    const filterByCompany = useMemo(() => (items) => {
        if (!items) return [];
        return items.filter(item => {
            const cid = item.company_id || item._companyId || item.companyId;
            if (!isConsolidated) return !cid || cid === activeCompany?.id;
            const relevantIds = companies.filter(c => c.id === activeCompany?.id || c.parentId === activeCompany?.id).map(c => c.id);
            return !cid || relevantIds.includes(cid);
        });
    }, [isConsolidated, activeCompany, companies]);

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
        const validTransactions = filterByCompany(transactions || []).filter(t => 
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        const years = new Set(validTransactions.map(t => getSafeYear(t.date)));
        const currentYear = new Date().getFullYear();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions, filterByCompany]);
    
    const safeParseFloat = (value) => { const parsed = parseFloat(value); return isNaN(parsed) ? 0 : parsed; };

    // ============================================================================
    // --- LÓGICA DE EXÓGENA ---
    // ============================================================================
    const generateExogenaData = useMemo(() => {
        if (!areAllDataLoaded) return [];
        const paymentsByContact = {};
        const fContacts = filterByCompany(contacts || []);

        const yearTransactions = filterByCompany(transactions).filter(t => 
            getSafeYear(t.date).toString() === selectedYear &&
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );
        
        yearTransactions.forEach(t => {
            if (t.type === 'expense' && t.contactId) {
                const contactId = t.contactId;
                if (!paymentsByContact[contactId]) {
                    const contactInfo = fContacts.find(c => c.id === contactId);
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
    }, [transactions, contacts, selectedYear, areAllDataLoaded, filterByCompany]);

    const handleExportExogena = () => {
        const data = generateExogenaData;
        if (data.length === 0) { toast({ variant: 'destructive', title: "No hay datos para exportar" }); return; }
        const total = data.reduce((sum, item) => sum + item['Pago o Abono en Cuenta'], 0);
        const footer = { 'Pago o Abono en Cuenta': total };
        exportToExcel(data, `Reporte_Exogena_${selectedYear}`, footer);
        toast({ title: "¡Exportado!", description: `El Reporte de Exógena para ${selectedYear} ha sido generado.` });
    };

    // ============================================================================
    // --- LÓGICA DE RENTA (TAX RETURN) CLONADA AL 100% DE REPORTS.JSX ---
    // ============================================================================
    const generateRentaData = useMemo(() => {
        if (!areAllDataLoaded) return [];

        const fTransactions = filterByCompany(transactions);
        const fInitialBalance = filterByCompany(initialBalance);
        const fCashAccounts = filterByCompany(cashAccounts);
        const fBankAccounts = filterByCompany(bankAccounts);
        const fFixedAssets = filterByCompany(fixedAssets);
        const fRealEstates = filterByCompany(realEstates);
        const fAccountsReceivable = filterByCompany(accountsReceivable);
        const fAccountsPayable = filterByCompany(accountsPayable);
        const fInventory = filterByCompany(inventory);

        const uniqueAccountsMap = new Map();
        (accounts || []).forEach(acc => {
            if (!acc || !acc.name) return;
            const exactName = String(acc.name).trim().toUpperCase();
            if (!uniqueAccountsMap.has(exactName)) uniqueAccountsMap.set(exactName, acc);
        });
        const allAccounts = Array.from(uniqueAccountsMap.values());
        const currentYear = selectedYear;

        const validTransactions = fTransactions.filter(t => 
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
        );

        const pnlTransactions = validTransactions.filter(t => getSafeYear(t.date).toString() === currentYear);
        const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(currentYear));

        const getAccountCreationYear = (accountId, defaultDate) => {
            if (defaultDate) return getSafeYear(defaultDate);
            const accountTransactions = validTransactions.filter(t => 
                t.destination?.startsWith(accountId) || 
                t.fromAccount?.startsWith(accountId) || 
                t.toAccount?.startsWith(accountId) ||
                (t.debitAccount && t.debitAccount.code === accountId) ||
                (t.creditAccount && t.creditAccount.code === accountId)
            );
            if (accountTransactions.length > 0) {
                const oldestDate = accountTransactions.reduce((min, t) => t.date < min ? t.date : min, accountTransactions[0].date);
                return getSafeYear(oldestDate);
            }
            return new Date().getFullYear();
        };

        // 🚀 1. MOTOR UNIFICADO DE RESOLUCIÓN (Idéntico al Libro Mayor)
        const getAssetDetails = (destinationStr, categoryName = '') => {
            if (!destinationStr) return { code: '238095', name: 'PARTIDAS POR CLASIFICAR' };
            const [id, name] = destinationStr.split('|');
            if (id === 'pending_payable') return { code: '23050101', name: 'CUENTAS POR PAGAR' };
            if (id === 'pending_receivable') return { code: '13050505', name: 'CUENTAS POR COBRAR' };
            if (id === 'caja_principal' || (name && name.toUpperCase().includes('CAJA PRINCIPAL'))) return { code: '11050501', name: 'CAJA PRINCIPAL' };
            const cashAcc = (fCashAccounts || []).find(c => c.id === id);
            if (cashAcc) return { code: cashAcc.accounting_account || '1105', name: cashAcc.name };
            if (id === '12950501' || (name && name.toUpperCase().includes('APORTES COOPERATIVA'))) return { code: '12950501', name: 'APORTES COOPERATIVA FRATERNIDAD' };
            const bank = (fBankAccounts || []).find(b => b.id === id);
            if (bank) return { code: bank.accountingCode || '1110', name: bank.accountingConcept || bank.bankName };
            if (/^\d+$/.test(id) && id.length >= 4) return { code: id, name: name || 'CUENTA DESTINO' };
            return { code: '1120', name: name || 'BANCO DESCONOCIDO' };
        };

        const resolveAccountingRow = (t) => {
            const amount = safeParseFloat(t.amount);
            if (t.debitAccount && t.creditAccount) {
                return { debit: { ...t.debitAccount, value: amount }, credit: { ...t.creditAccount, value: amount } };
            }
            if (t.category === 'INGRESOS POR DONACIONES' || t.voucherPrefix === 'A') {
                const assetAcc = getAssetDetails(t.destination, t.category);
                const catObj = (allAccounts || []).find(a => a.name === t.category) || { number: '421004', name: t.category };
                return { debit: { code: assetAcc.code, name: assetAcc.name, value: amount }, credit: { code: catObj.number || '421004', name: catObj.name || t.category, value: amount } };
            }
            if (t.type === 'transfer' && t.fromAccount && t.toAccount) {
                const debit = getAssetDetails(t.toAccount, t.category);
                const credit = getAssetDetails(t.fromAccount, t.category);
                return { debit: { ...debit, value: amount }, credit: { ...credit, value: amount } };
            }
            const assetAcc = getAssetDetails(t.destination, t.category);
            const catObj = (allAccounts || []).find(a => a.name === t.category);
            const catAcc = { code: t._accountNumber || (catObj ? catObj.number : (t.type === 'income' ? '4105' : '5105')), name: t.category };
            if (t.type === 'income') {
                return { debit: { ...assetAcc, value: amount }, credit: { ...catAcc, value: amount } };
            } else {
                return { debit: { ...catAcc, value: amount }, credit: { ...assetAcc, value: amount } };
            }
        };

        // 🚀 2. CONSOLIDACIÓN MAESTRA POR PUC (Partida Doble Estricta igual al Mayor)
        const mayorBalances = {};

        fInitialBalance.forEach(ib => {
            const code = String(ib.accountingCode || '11050501');
            mayorBalances[code] = (mayorBalances[code] || 0) + safeParseFloat(ib.balance);
        });

        fBankAccounts.forEach(ba => {
            const code = String(ba.accountingCode || '111005');
            mayorBalances[code] = (mayorBalances[code] || 0) + safeParseFloat(ba.initialBalance);
            if (ba.initialInvestmentBalance) {
                const invCode = '12950501';
                mayorBalances[invCode] = (mayorBalances[invCode] || 0) + safeParseFloat(ba.initialInvestmentBalance);
            }
        });

        const processedIdsForReport = new Set();
        bsTransactions.forEach(t => {
            if (processedIdsForReport.has(t.id)) return;

            // Procesar transferencias internas gemelas (-exp y -inc)
            if (t.isInternalTransfer && !t.debitAccount) {
                const baseId = t.id.replace(/-exp$|-inc$/, '');
                const isExp = t.id.endsWith('-exp');
                const siblingId = baseId + (isExp ? '-inc' : '-exp');
                const sibling = bsTransactions.find(x => x.id === siblingId);

                if (sibling) {
                    processedIdsForReport.add(t.id);
                    processedIdsForReport.add(sibling.id);
                    const expensePart = isExp ? t : sibling;
                    const incomePart = isExp ? sibling : t;
                    const sourceAsset = getAssetDetails(expensePart.destination, expensePart.category);
                    const destAsset = getAssetDetails(incomePart.destination, incomePart.category);
                    const amount = safeParseFloat(expensePart.amount);

                    const debNat = ['1', '5', '6', '8'].includes(destAsset.code.charAt(0));
                    const credNat = ['1', '5', '6', '8'].includes(sourceAsset.code.charAt(0));

                    mayorBalances[destAsset.code] = (mayorBalances[destAsset.code] || 0) + (debNat ? amount : -amount);
                    mayorBalances[sourceAsset.code] = (mayorBalances[sourceAsset.code] || 0) + (credNat ? -amount : amount);
                    return;
                }
            }

            const { debit, credit } = resolveAccountingRow(t);
            if (debit?.code) {
                const isDebitNature = ['1', '5', '6', '8'].includes(debit.code.charAt(0));
                mayorBalances[debit.code] = (mayorBalances[debit.code] || 0) + (isDebitNature ? safeParseFloat(debit.value) : -safeParseFloat(debit.value));
            }
            if (credit?.code) {
                const isDebitNature = ['1', '5', '6', '8'].includes(credit.code.charAt(0));
                mayorBalances[credit.code] = (mayorBalances[credit.code] || 0) + (isDebitNature ? -safeParseFloat(credit.value) : safeParseFloat(credit.value));
            }
        });

        // 🚀 3. EXTRACCIÓN DE SALDOS FINALES PUC
        let cajaPrincipalBalance = mayorBalances['11050501'] || 0;
        let totalBankBalances = Object.keys(mayorBalances).filter(k => k.startsWith('1110') || k.startsWith('1120')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let totalInvestmentBalances = mayorBalances['12950501'] || 0;
        let accountsReceivableValue = Object.keys(mayorBalances).filter(k => k.startsWith('1305')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let anticiposValue = Object.keys(mayorBalances).filter(k => k.startsWith('1330')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let construccionesValue = Object.keys(mayorBalances).filter(k => k.startsWith('1508')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let depreciacionAcumuladaValue = -Math.abs(Object.keys(mayorBalances).filter(k => k.startsWith('1592')).reduce((sum, k) => sum + mayorBalances[k], 0));
        let intangiblesValue = Object.keys(mayorBalances).filter(k => k.startsWith('16')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let accountsPayableValue = Object.keys(mayorBalances).filter(k => k.startsWith('2305') || k.startsWith('22')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let otherLiabilitiesValue = Object.keys(mayorBalances).filter(k => k.startsWith('2') && !k.startsWith('2305') && !k.startsWith('22')).reduce((sum, k) => sum + mayorBalances[k], 0);
        let otherAssetsValue = Object.keys(mayorBalances).filter(k => k.startsWith('1') && !k.startsWith('11') && !k.startsWith('1295') && !k.startsWith('13') && !k.startsWith('14') && !k.startsWith('15') && !k.startsWith('16')).reduce((sum, k) => sum + mayorBalances[k], 0);

        const inventoryValue = fInventory.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
        const manualFixedAssetsValue = fFixedAssets.filter(asset => asset.status !== 'Dado de Baja' && getSafeYear(asset.date || '2026') <= parseInt(currentYear)).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
        const realEstatesValue = fRealEstates.filter(estate => estate.status !== 'Dado de Baja' && getSafeYear(estate.date) <= parseInt(currentYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);

        // Cálculos de P&L
        const totalIncomes = pnlTransactions.reduce((sum, t) => {
            const { credit } = resolveAccountingRow(t);
            if (credit?.code?.startsWith('4')) return sum + safeParseFloat(credit.value);
            return sum;
        }, 0);

        const totalCosts = pnlTransactions.reduce((sum, t) => {
            const { debit } = resolveAccountingRow(t);
            if (['6', '7'].includes(debit?.code?.charAt(0))) return sum + safeParseFloat(debit.value);
            return sum;
        }, 0);

        const totalExpenses = pnlTransactions.reduce((sum, t) => {
            const { debit } = resolveAccountingRow(t);
            if (debit?.code?.startsWith('5')) return sum + safeParseFloat(debit.value);
            return sum;
        }, 0);

        const totalCostsAndExpenses = totalCosts + totalExpenses;
        const netProfit = totalIncomes - totalCostsAndExpenses;

        let customCashBalance = 0;
        if (fCashAccounts.length > 0) {
            customCashBalance = fCashAccounts.reduce((acc, cashAcc) => acc + safeParseFloat(cashAcc.initial_balance), 0);
        }

        const totalCashBalance = cajaPrincipalBalance + customCashBalance;
        const cajaGeneralValue = totalCashBalance + totalBankBalances + totalInvestmentBalances;
        
        const dynamicCashAccounts = getDynamicCashAccounts(fCashAccounts, validTransactions, currentYear).filter(acc => {
            const originalAcc = (fCashAccounts || []).find(c => c.id === acc.id);
            const creationYear = originalAcc ? getAccountCreationYear(originalAcc.id, originalAcc.date) : new Date().getFullYear();
            return creationYear <= parseInt(currentYear);
        });

        const totalActivoCorriente = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue;
        const totalActivoNoCorriente = intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue;
        
        const totalAssets = totalActivoCorriente + totalActivoNoCorriente; 
        const totalDebts = accountsPayableValue + otherLiabilitiesValue; 
        const netWorth = totalAssets - totalDebts; 

        const assetsSection = [
            { Concepto: 'PATRIMONIO BRUTO (Total Activos)', Valor: totalAssets, isTotal: true },
            { Concepto: '  Efectivo y Equivalentes (Caja General)', Valor: cajaGeneralValue, isSubtotal: true },
            { Concepto: '    Caja Principal', Valor: cajaPrincipalBalance, isDetail: true },
            ...dynamicCashAccounts.map(acc => ({ Concepto: `    ${acc.name}`, Valor: acc.balance, isDetail: true })),
            { Concepto: '    Cuentas Bancarias', Valor: totalBankBalances, isDetail: true },
            { Concepto: '    Aportes Ordinarios', Valor: totalInvestmentBalances, isDetail: true },
            { Concepto: '  Cuentas por Cobrar', Valor: accountsReceivableValue, isDetail: true },
            { Concepto: '  Anticipos a Proveedores', Valor: anticiposValue, isDetail: true },
            { Concepto: '  Otros Activos Corrientes', Valor: otherAssetsValue, isDetail: true },
            { Concepto: '  Activos Intangibles (Licencias)', Valor: intangiblesValue, isDetail: true },
            { Concepto: '  Construcciones en Curso', Valor: construccionesValue, isDetail: true },
            { Concepto: '  Propiedades, Planta y Equipo', Valor: realEstatesValue, isDetail: true },
            { Concepto: '  Activos Fijos (Oficina y Equipos)', Valor: manualFixedAssetsValue, isDetail: true },
            { Concepto: '  Inventario', Valor: inventoryValue, isDetail: true },
            { Concepto: '  Depreciación Acumulada', Valor: depreciacionAcumuladaValue, isDetail: true },
        ];

        return [
            ...assetsSection,
            { Concepto: 'DEUDAS (Total Pasivos)', Valor: totalDebts, isTotal: true },
            { Concepto: '  Cuentas por Pagar', Valor: accountsPayableValue, isDetail: true },
            { Concepto: '  Otros Pasivos', Valor: otherLiabilitiesValue, isDetail: true },
            { Concepto: 'PATRIMONIO LÍQUIDO (Activos - Pasivos)', Valor: netWorth, isTotal: true }, 
            { isSpacer: true },
            { Concepto: 'INGRESOS TOTALES (P&L del año)', Valor: totalIncomes, isDetail: true },
            { Concepto: 'COSTOS Y GASTOS TOTALES (P&L del año)', Valor: totalCostsAndExpenses, isDetail: true },
            { Concepto: 'EXCEDENTE NETO DEL EJERCICIO (Fiscal/Contable)', Valor: netProfit, isTotal: true },
        ];
    }, [transactions, bankAccounts, fixedAssets, realEstates, accountsReceivable, accountsPayable, accounts, initialBalance, cashAccounts, inventory, selectedYear, areAllDataLoaded, filterByCompany]);

    const handleExportRenta = () => {
        const data = generateRentaData;
        if (data.length === 0 || !areAllDataLoaded) { 
            toast({ variant: 'destructive', title: "No hay datos para exportar." }); 
            return; 
        }
        
        const companyName = activeCompany?.name || 'PARROQUIA PADRE MISERICORDIOSO';
        const companyNit = activeCompany?.doc ? `NIT: ${activeCompany.doc}` : 'NIT: 802012765';

        const dataToExport = [
            { 'Concepto': companyName, 'Valor': '' },
            { 'Concepto': companyNit, 'Valor': '' },
            { 'Concepto': `DECLARACIÓN DE RENTA - AÑO FISCAL ${selectedYear}`, 'Valor': '' },
            { 'Concepto': `Fecha de generación: ${new Date().toLocaleDateString('es-CO')}`, 'Valor': '' },
            { 'Concepto': '', 'Valor': '' }, 
            { 'Concepto': 'CONCEPTO / CUENTA', 'Valor': 'VALOR ($)' },
            { 'Concepto': '', 'Valor': '' } 
        ];

        data.forEach(({ Concepto, Valor, isSpacer }) => {
            if (isSpacer) {
                dataToExport.push({ 'Concepto': '', 'Valor': '' });
            } else {
                dataToExport.push({ 
                    'Concepto': Concepto ? Concepto.trim() : '', 
                    'Valor': Valor != null ? Valor : '' 
                });
            }
        });
            
        exportToExcel(dataToExport, `Reporte_Declaracion_Renta_${selectedYear}`);
        toast({ title: "¡Exportado a Excel!", description: "El reporte se ha exportado exitosamente con la estructura formal." });
    };
    
    return (
        <>
            <Helmet><title>Reportes Tributarios - JaiderHerTur26</title></Helmet>
            <div className="space-y-8">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center"><div><h1 className="text-4xl font-bold text-slate-900">Reportes Tributarios</h1><p className="text-slate-600">Genera tus reportes fiscales.</p></div><div className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-slate-500" /><Label htmlFor="year-select">Año Fiscal:</Label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger id="year-select" className="w-[120px]"><SelectValue placeholder="Año" /></SelectTrigger><SelectContent>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent></Select></div></motion.div>
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl shadow-lg border"><div className="p-6 border-b flex justify-between items-center"><div className="flex items-center"><FileText className="w-6 h-6 mr-3 text-blue-600" /><h2 className="text-xl font-bold text-slate-900">Pagos a Terceros (Exógena)</h2></div><Button onClick={handleExportExogena}><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button></div><div className="p-6">{!areAllDataLoaded ? <p>Cargando datos...</p> : generateExogenaData.length === 0 ? (<div className="text-center py-10"><Search className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No se encontraron pagos a terceros.</p></div>) : (<div className="overflow-x-auto rounded-lg border max-h-72"><table className="w-full"><thead className="bg-slate-50 sticky top-0"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Nombre o Razón Social</th><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Dirección</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Pago o Abono en Cuenta</th></tr></thead><tbody className="divide-y divide-slate-200">{generateExogenaData.map((row, index) => (<tr key={index} className="hover:bg-slate-50"><td className="px-6 py-4 text-sm font-medium text-slate-900">{row['Nombre o Razón Social']}</td><td className="px-6 py-4 text-sm text-slate-600">{row['Dirección']}</td><td className="px-6 py-4 text-sm font-mono text-right text-red-600">${parseFloat(row['Pago o Abono en Cuenta'] || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td ></tr>))}</tbody></table></div>)}</div></motion.div>
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-xl shadow-lg border">
                    <div className="p-6 border-b flex justify-between items-center">
                        <div className="flex items-center"><BookMarked className="w-6 h-6 mr-3 text-emerald-600" /><h2 className="text-xl font-bold text-slate-900">Declaración de Renta</h2></div>
                        <Button onClick={handleExportRenta} variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button>
                    </div>
                    <div className="p-6">
                        <div className="overflow-x-auto rounded-lg border">
                            {!areAllDataLoaded ? <p className="p-4">Cargando...</p> : 
                            <table className="w-full">
                                <thead className="bg-slate-50"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Concepto</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Valor</th></tr></thead>
                                <tbody>
                                    {generateRentaData.map((row, index) => {
                                        if (row.isSpacer) return <tr key={index}><td colSpan="2" className="py-3 bg-white"></td></tr>;
                                        return (
                                            <tr key={index} className={`${row.isTotal ? 'bg-slate-100 border-t-2 border-slate-300' : ''} ${row.isSubtotal ? 'bg-slate-50 border-t border-slate-200' : 'border-b border-slate-100'}`}>
                                                <td className={`px-6 py-3 text-sm ${row.isTotal ? 'font-black text-slate-800' : (row.isSubtotal ? 'font-bold text-slate-700' : 'font-medium text-slate-600')} ${row.Concepto?.startsWith('    ') ? 'pl-16' : row.Concepto?.startsWith('  ') ? 'pl-10' : ''}`}>
                                                    {row.Concepto?.trim()}
                                                </td>
                                                <td className={`px-6 py-3 text-sm font-mono text-right ${row.isTotal ? 'font-bold' : ''}`}>
    {(() => {
        if (row.Valor == null) return '';
        const val = parseFloat(row.Valor);
        const isDepr = (row.Concepto || '').toLowerCase().includes('depreciación') || val < 0;
        const absVal = Math.abs(val);
        const formatted = absVal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (val === 0) return '$ 0,00';
        return isDepr ? `$ (${formatted})` : `$ ${formatted}`;
    })()}
</td>                                               
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>}
                        </div>
                    </div>
                </motion.div>
            </div>
        </>
    );
};

export default TaxReports;"