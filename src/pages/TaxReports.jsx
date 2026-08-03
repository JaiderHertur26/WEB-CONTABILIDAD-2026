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

        const getAccountPrefix = (categoryName) => {
            const account = allAccounts.find(a => a.name === categoryName);
            return account ? String(account.number).charAt(0) : null;
        };

        // 1. P&L Logic
        const totalIncomes = pnlTransactions.reduce((sum, t) => {
            if (t.debitAccount && t.creditAccount) {
                const crCode = String(t.creditAccount.code || '');
                if (crCode.startsWith('4')) return sum + safeParseFloat(t.amount);
                return sum;
            }
            if (t.isInternalTransfer) return sum;
            
            if (getAccountPrefix(t.category) === '4') {
                return sum + (t.type === 'income' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount));
            }
            return sum;
        }, 0);

        const totalCosts = pnlTransactions.reduce((sum, t) => {
            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                if (['6', '7'].includes(drCode.charAt(0))) return sum + safeParseFloat(t.amount);
                return sum;
            }
            if (t.isInternalTransfer) return sum;

            if (['6', '7'].includes(getAccountPrefix(t.category))) {
                return sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount));
            }
            return sum;
        }, 0);

        const totalExpenses = pnlTransactions.reduce((sum, t) => {
            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                if (drCode.startsWith('5')) return sum + safeParseFloat(t.amount);
                return sum;
            }
            if (t.isInternalTransfer || t.isFixedAsset || t.isPurchase) return sum;

            if (getAccountPrefix(t.category) === '5') {
                return sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount));
            }
            return sum;
        }, 0);

        const totalCostsAndExpenses = totalCosts + totalExpenses;
        const netProfit = totalIncomes - totalCostsAndExpenses;

        // 2. Balance Sheet Logic
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

        const initialCash = fInitialBalance.reduce((sum, item) => {
            const creationYear = getAccountCreationYear('caja_principal', item.date);
            if (creationYear <= parseInt(currentYear)) {
                return sum + safeParseFloat(item.balance);
            }
            return sum;
        }, 0);

        let cashIncomes = 0, cashExpenses = 0;
        
        bsTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);

            // Bloque Partida Doble Manual
            if (t.debitAccount && t.creditAccount) {
                if (String(t.id).endsWith('-inc')) return;
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                const drName = t.debitAccount.name ? t.debitAccount.name.toUpperCase() : '';
                const crName = t.creditAccount.name ? t.creditAccount.name.toUpperCase() : '';
                
                if (drCode === '11050501' || drName.includes('CAJA PRINCIPAL')) cashIncomes += amount;  
                if (crCode === '11050501' || crName.includes('CAJA PRINCIPAL')) cashExpenses += amount; 
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
        if (fCashAccounts.length > 0) {
            customCashBalance = fCashAccounts.reduce((acc, cashAcc) => {
                let currentBal = 0;
                const creationYear = getAccountCreationYear(cashAcc.id, cashAcc.date);
                if (creationYear <= parseInt(currentYear)) {
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
        const totalCashBalance = cajaPrincipalBalance + customCashBalance;

        let totalBankBalances = 0, totalInvestmentBalances = 0;
        fBankAccounts.forEach(acc => {
            let currentBankBalance = 0, currentInvestmentBalance = 0;
            const creationYear = getAccountCreationYear(acc.id, acc.date);
            
            if (creationYear <= parseInt(currentYear)) {
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
                     
                     if (drName === acc.bankName || (acc.accountingCode && drCode === acc.accountingCode)) currentBankBalance += amount;
                     if (crName === acc.bankName || (acc.accountingCode && crCode === acc.accountingCode)) currentBankBalance -= amount;
                     return;
                }

                if (t.type !== 'transfer' && t.destination && t.destination.startsWith(acc.id)) {
                     if (t.type === 'income') { if (t.description && t.description.includes('Aporte Ordinario')) currentInvestmentBalance += amount; else currentBankBalance += amount; } 
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

        const cajaGeneralValue = totalCashBalance + totalBankBalances + totalInvestmentBalances;
        const dynamicCashAccounts = getDynamicCashAccounts(fCashAccounts, validTransactions, currentYear).filter(acc => {
            const originalAcc = (fCashAccounts || []).find(c => c.id === acc.id);
            const creationYear = originalAcc ? getAccountCreationYear(originalAcc.id, originalAcc.date) : new Date().getFullYear();
            return creationYear <= parseInt(currentYear);
        });

        let initialDepreciacion = 0, initialAnticipos = 0, initialConstrucciones = 0, initialOtherAssets = 0, initialOtherLiabilities = 0;
        
        fInitialBalance.forEach(item => {
            const itemYear = item.date ? getSafeYear(item.date) : new Date().getFullYear();
            if (itemYear <= parseInt(currentYear)) {
                const amount = safeParseFloat(item.balance);
                const code = String(item.accountingCode || '');
                
                if (code.startsWith('1592')) {
                    initialDepreciacion -= Math.abs(amount);
                } else if (code.startsWith('1330')) {
                    initialAnticipos += amount;
                } else if (code.startsWith('1508')) {
                    initialConstrucciones += amount;
                } else if (code.startsWith('1') && !code.startsWith('11') && !code.startsWith('1305') && !code.startsWith('14') && !code.startsWith('15')) {
                    initialOtherAssets += amount;
                } else if (code.startsWith('2') && !code.startsWith('2305')) {
                    initialOtherLiabilities += Math.abs(amount);
                }
            }
        });

        let anticiposValue = initialAnticipos;
        let construccionesValue = initialConstrucciones;
        let otherAssetsValue = initialOtherAssets;
        let otherLiabilitiesValue = initialOtherLiabilities;
        let depreciacionAcumuladaValue = initialDepreciacion;
        let intangiblesValue = 0; // DECLARADO AQUÍ

        fInitialBalance.forEach(item => {
            const itemYear = item.date ? getSafeYear(item.date) : new Date().getFullYear();
            if (itemYear <= parseInt(currentYear)) {
                const code = String(item.accountingCode || '');
                if (code.startsWith('16')) intangiblesValue += safeParseFloat(item.balance);
            }
        });

        bsTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);

            // Bloque Partida Doble Manual
            if (t.debitAccount && t.creditAccount) {
                if (String(t.id).endsWith('-inc')) return;
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');

                if (drCode.startsWith('1330')) anticiposValue += amount;
                else if (drCode.startsWith('1508')) construccionesValue += amount;
                else if (drCode.startsWith('1592')) depreciacionAcumuladaValue += amount; 
                else if (drCode.startsWith('16')) intangiblesValue += amount;
                else if (drCode.startsWith('1') && !drCode.startsWith('11') && !drCode.startsWith('1305') && !drCode.startsWith('14') && !drCode.startsWith('15')) {
                    otherAssetsValue += amount;
                }
                else if (drCode.startsWith('2') && !drCode.startsWith('2305')) otherLiabilitiesValue -= amount;

                if (crCode.startsWith('1330')) anticiposValue -= amount;
                else if (crCode.startsWith('1508')) construccionesValue -= amount;
                else if (crCode.startsWith('1592')) depreciacionAcumuladaValue -= amount; 
                else if (crCode.startsWith('16')) intangiblesValue -= amount;
                else if (crCode.startsWith('1') && !drCode.startsWith('11') && !drCode.startsWith('1305') && !drCode.startsWith('14') && !drCode.startsWith('15')) {
                    otherAssetsValue -= amount;
                }
                else if (crCode.startsWith('2') && !drCode.startsWith('2305')) otherLiabilitiesValue += amount;

                return;
            }

            // --- CUALQUIER TRANSACCIÓN (INCLUSO CRUCES CONTABLES) FLUYE POR AQUÍ ---
            const acc = allAccounts.find(a => a.name === t.category);
            if (!acc) return;
            const num = String(acc.number);

            const assetImpact = t.type === 'expense' ? amount : -amount;
            const liabilityImpact = t.type === 'income' ? amount : -amount;

            if (num.startsWith('1330')) anticiposValue += assetImpact;
            else if (num.startsWith('1508')) construccionesValue += assetImpact;
            else if (num.startsWith('1592')) depreciacionAcumuladaValue += (t.type === 'expense' ? amount : -amount);
            else if (num.startsWith('16')) intangiblesValue += assetImpact;
            else if (num.startsWith('1') && !num.startsWith('11') && !num.startsWith('1305') && !num.startsWith('14') && !num.startsWith('15')) {
                otherAssetsValue += assetImpact;
            }
            else if (num.startsWith('2') && !num.startsWith('2305')) {
                otherLiabilitiesValue += liabilityImpact;
            }
        });

        const inventoryValue = fInventory.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
        
        const manualFixedAssetsValue = fFixedAssets.filter(asset => {
            if (asset.status === 'Dado de Baja') return false; 
            const assetYear = asset.date ? getSafeYear(asset.date) : (asset.year ? parseInt(asset.year) : 0);
            return assetYear === parseInt(selectedYear);
        }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
        
        const totalDepreciacionInventario = fFixedAssets.filter(asset => {
            if (asset.status === 'Dado de Baja') return false; 
            const assetYear = asset.date ? getSafeYear(asset.date) : (asset.year ? parseInt(asset.year) : 0);
            return assetYear === parseInt(selectedYear);
        }).reduce((sum, asset) => sum + safeParseFloat(asset.accumulatedDepreciation || 0), 0);

        const totalDepreciacionPropiedades = fRealEstates.filter(estate => {
            if (estate.status === 'Dado de Baja') return false;
            return getSafeYear(estate.date) <= parseInt(currentYear);
        }).reduce((sum, estate) => sum + safeParseFloat(estate.accumulatedDepreciation || 0), 0);

        depreciacionAcumuladaValue = -Math.abs(totalDepreciacionInventario + totalDepreciacionPropiedades);
        
        const realEstatesValue = fRealEstates.filter(estate => getSafeYear(estate.date) <= parseInt(selectedYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);

        const accountsReceivableValue = fAccountsReceivable.filter(r => {
            const rYear = r.date ? getSafeYear(r.date) : (r.year ? parseInt(r.year) : parseInt(selectedYear));
            return r.status === 'Pendiente' && rYear <= parseInt(selectedYear);
        }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);

        const accountsPayableValue = fAccountsPayable.filter(p => {
            const pYear = p.date ? getSafeYear(p.date) : (p.year ? parseInt(p.year) : parseInt(selectedYear));
            return p.status === 'Pendiente' && pYear <= parseInt(selectedYear);
        }).reduce((sum, p) => sum + safeParseFloat(p.amount), 0);

        const totalAssets = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue + intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue; 
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
            { Concepto: 'RENTA LÍQUIDA (Ingresos - Gastos)', Valor: netProfit, isTotal: true },
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
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl shadow-lg border"><div className="p-6 border-b flex justify-between items-center"><div className="flex items-center"><FileText className="w-6 h-6 mr-3 text-blue-600" /><h2 className="text-xl font-bold text-slate-900">Pagos a Terceros (Exógena)</h2></div><Button onClick={handleExportExogena}><Download className="w-4 h-4 mr-2"/> Exportar Reporte</Button></div><div className="p-6">{!areAllDataLoaded ? <p>Cargando datos...</p> : generateExogenaData.length === 0 ? (<div className="text-center py-10"><Search className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No se encontraron pagos a terceros.</p></div>) : (<div className="overflow-x-auto rounded-lg border max-h-72"><table className="w-full"><thead className="bg-slate-50 sticky top-0"><tr><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Nombre o Razón Social</th><th className="px-6 py-3 text-left text-sm font-semibold text-slate-800">Dirección</th><th className="px-6 py-3 text-right text-sm font-semibold text-slate-800">Pago o Abono en Cuenta</th></tr></thead><tbody className="divide-y divide-slate-200">{generateExogenaData.map((row, index) => (<tr key={index} className="hover:bg-slate-50"><td className="px-6 py-4 text-sm font-medium text-slate-900">{row['Nombre o Razón Social']}</td><td className="px-6 py-4 text-sm text-slate-600">{row['Dirección']}</td><td className="px-6 py-4 text-sm font-mono text-right text-red-600">${row['Pago o Abono en Cuenta'].toLocaleString('es-ES', {minimumFractionDigits: 2})}</td ></tr>))}</tbody></table></div>)}</div></motion.div>
                
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
                                                    {row.Valor != null ? `$${row.Valor.toLocaleString('es-ES', {minimumFractionDigits: 2})}` : ''}
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

export default TaxReports;