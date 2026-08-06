import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, Calendar, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext'; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';
import { isValid, parseISO } from 'date-fns';

const Reports = () => {
  const { activeCompany, companies, isConsolidated } = useCompany();

  const [transactions] = useCompanyData('transactions');
  const [accounts] = useCompanyData('accounts');
  const [bankAccounts] = useCompanyData('bankAccounts');
  const [initialBalance] = useCompanyData('initialBalance');
  const [cashAccounts] = useCompanyData('cash_accounts');
  const [fixedAssets] = useCompanyData('fixedAssets');
  const [realEstates] = useCompanyData('realEstates');
  const [accountsReceivable] = useCompanyData('accountsReceivable');
  const [accountsPayable] = useCompanyData('accountsPayable');
  const [inventory] = useCompanyData('inventory');
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const [reportData, setReportData] = useState({ 
      incomeStatement: [], 
      balanceSheet: { assets: [], liabilities: [], equity: [], totals: {} }, 
      cashFlow: { initial: 0, sources: [], uses: [], totalSources: 0, totalUses: 0, final: 0 }, 
      summary: { totalIncome: 0, totalExpenses: 0, netProfit: 0, profitMargin: 0 } 
  });
  const { toast } = useToast();

  const [printConfigOpen, setPrintConfigOpen] = useState(false);
  const [printType, setPrintType] = useState(null);
  const [signatures, setSignatures] = useState({
      repLegalName: '',
      repLegalId: 'C.C. ',
      contadorName: '',
      contadorId: 'T.P. '
  });

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

  const availableYears = useMemo(() => {
      const validTransactions = filterByCompany(transactions || []).filter(t => 
        !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
      );
      const years = new Set(validTransactions.map(t => getSafeYear(t.date)));
      const current = new Date().getFullYear();
      years.add(current);
      return Array.from(years).sort((a, b) => b - a).map(String);
  }, [transactions, filterByCompany]);

  useEffect(() => { generateReportData(); }, [transactions, accounts, bankAccounts, initialBalance, cashAccounts, fixedAssets, realEstates, accountsReceivable, accountsPayable, inventory, selectedYear, isConsolidated, filterByCompany]);

  const generateReportData = () => {
    const safeParseFloat = (value) => { const parsed = parseFloat(value); return isNaN(parsed) ? 0 : parsed; };
    
    const allTransactions = filterByCompany(transactions);
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
        const exactName = String(acc.name).trim();
        if (!uniqueAccountsMap.has(exactName)) {
            uniqueAccountsMap.set(exactName, acc);
        }
    });
    const allAccounts = Array.from(uniqueAccountsMap.values());
    const currentYear = selectedYear;

    const validTransactions = allTransactions.filter(t => 
        !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
    );
    
    const cashAccountIds = new Set();
    cashAccountIds.add('caja_principal');
    if (allAccounts) { 
        allAccounts.forEach(acc => { 
            if (acc.number === '11050501' || acc.name.toUpperCase() === 'CAJA PRINCIPAL') { 
                cashAccountIds.add(acc.id); 
            } 
        }); 
    }

    const pnlTransactions = validTransactions.filter(t => getSafeYear(t.date).toString() === currentYear);
    const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(currentYear));

    const getAccountCreationYear = (accountId, defaultDate) => {
        if (defaultDate && isValid(parseISO(defaultDate))) return getSafeYear(defaultDate);
        
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

    const totalIncome = pnlTransactions.reduce((sum, t) => {
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

    const netProfit = totalIncome - totalCosts - totalExpenses;
    const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0;
    const summaryData = { totalIncome, totalExpenses: (totalCosts + totalExpenses), netProfit, profitMargin };
    
    const calculateTotalForCategory = (categoryName, classPrefix) => pnlTransactions.reduce((sum, t) => {
        if (t.debitAccount && t.creditAccount) {
            const amount = safeParseFloat(t.amount);
            if (classPrefix === '4' && t.creditAccount.name?.trim().toUpperCase() === categoryName.trim().toUpperCase()) return sum + amount;
            if (['5', '6', '7'].includes(classPrefix) && t.debitAccount.name?.trim().toUpperCase() === categoryName.trim().toUpperCase()) return sum + amount;
            return sum;
        }

        if (t.category !== categoryName || t.isFixedAsset || t.isInternalTransfer || t.isPurchase) return sum;
        const amount = safeParseFloat(t.amount);
        if (classPrefix === '4') return sum + (t.type === 'income' ? amount : -amount);
        if (['5', '6', '7'].includes(classPrefix)) return sum + (t.type === 'expense' ? amount : -amount);
        return sum;
    }, 0);

    const incomeAccounts = allAccounts.filter(a => String(a.number).startsWith('4'));
    const expenseAccounts = allAccounts.filter(a => String(a.number).startsWith('5'));
    const costAccounts = allAccounts.filter(a => String(a.number).startsWith('6') || String(a.number).startsWith('7'));

    const grossProfit = totalIncome - totalCosts;

    // 🚀 LÓGICA DE EXTRACCIÓN DINÁMICA DE CUENTAS (Para evitar ocultar gastos/ingresos que no estén en el catálogo base)
    const dynamicIncomes = {};
    const dynamicCosts = {};
    const dynamicExpenses = {};

    pnlTransactions.forEach(t => {
        const amount = safeParseFloat(t.amount);
        if (amount === 0) return;

        if (t.debitAccount && t.creditAccount) {
            const drCode = String(t.debitAccount.code || '');
            const crCode = String(t.creditAccount.code || '');
            if (crCode.startsWith('4')) {
                const name = t.creditAccount.name || t.category || 'INGRESOS VARIOS';
                dynamicIncomes[name] = (dynamicIncomes[name] || 0) + amount;
            }
            if (['6', '7'].includes(drCode.charAt(0))) {
                const name = t.debitAccount.name || t.category || 'COSTOS VARIOS';
                dynamicCosts[name] = (dynamicCosts[name] || 0) + amount;
            }
            if (drCode.startsWith('5')) {
                const name = t.debitAccount.name || t.category || 'GASTOS VARIOS';
                dynamicExpenses[name] = (dynamicExpenses[name] || 0) + amount;
            }
        } else {
            if (t.isInternalTransfer || t.isFixedAsset || t.isPurchase) return;
            let prefix = getAccountPrefix(t.category);
            if (!prefix) prefix = t.type === 'income' ? '4' : (t.type === 'expense' ? '5' : null);
            const name = t.category || (t.type === 'income' ? 'INGRESOS VARIOS' : 'GASTOS VARIOS');
            
            if (prefix === '4') dynamicIncomes[name] = (dynamicIncomes[name] || 0) + (t.type === 'income' ? amount : -amount);
            else if (['6', '7'].includes(prefix)) dynamicCosts[name] = (dynamicCosts[name] || 0) + (t.type === 'expense' ? amount : -amount);
            else if (prefix === '5') dynamicExpenses[name] = (dynamicExpenses[name] || 0) + (t.type === 'expense' ? amount : -amount);
        }
    });

    const formatPnlSection = (itemsObj, isNegative = false) => {
        const rows = [];
        for (const [key, value] of Object.entries(itemsObj)) {
            if (Math.abs(value) > 0.01) {
                const cleanKey = String(key || 'SIN CATEGORÍA').toUpperCase();
                rows.push({
                    item: `  ${cleanKey}`, 
                    amount: isNegative ? -Math.abs(value) : value
                });
            }
        }
        return rows.sort((a, b) => a.item.localeCompare(b.item));
    };

    const incomeStatement = [
        { item: 'INGRESOS OPERACIONALES', isBold: true },
        ...formatPnlSection(dynamicIncomes, false),
        { item: 'Total Ingresos', amount: totalIncome, isSubtotal: true, isTopBorder: true },
        
        { item: 'COSTOS DE VENTA', isBold: true },
        ...formatPnlSection(dynamicCosts, true),
        { item: 'Total Costos', amount: -totalCosts, isSubtotal: true, isTopBorder: true },
        
        { item: 'UTILIDAD BRUTA', amount: grossProfit, isBold: true, isTopBorder: true },
        
        { item: 'GASTOS OPERACIONALES', isBold: true },
        ...formatPnlSection(dynamicExpenses, true),
        { item: 'Total Gastos', amount: -totalExpenses, isSubtotal: true, isTopBorder: true },
        
        { item: 'UTILIDAD NETA (Estado de Resultados)', amount: netProfit, isBold: true, isTotal: true },
    ];
    
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

    let anticiposValue = 0, construccionesValue = 0, otherAssetsValue = 0, otherLiabilitiesValue = 0, depreciacionAcumuladaValue = 0, intangiblesValue = 0;

        bsTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);

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
                else if (crCode.startsWith('1') && !crCode.startsWith('11') && !crCode.startsWith('1305') && !crCode.startsWith('14') && !crCode.startsWith('15')) {
                    otherAssetsValue -= amount;
                }
                else if (crCode.startsWith('2') && !crCode.startsWith('2305')) otherLiabilitiesValue += amount;

                return;
            }

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
        if (asset.year) return asset.year.toString() === currentYear.toString();
        if (asset.date) return getSafeYear(asset.date).toString() === currentYear.toString();
        return false;
    }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
    
    const totalDepreciacionInventario = fFixedAssets.filter(asset => {
        if (asset.status === 'Dado de Baja') return false; 
        if (asset.year) return asset.year.toString() === currentYear.toString();
        if (asset.date) return getSafeYear(asset.date).toString() === currentYear.toString();
        return false;
    }).reduce((sum, asset) => sum + safeParseFloat(asset.accumulatedDepreciation || 0), 0);

    const depreciacionPropiedadesGlobal = fRealEstates.filter(estate => {
        if (estate.status === 'Dado de Baja') return false;
        return getSafeYear(estate.date) <= parseInt(currentYear);
    }).reduce((sum, estate) => sum + safeParseFloat(estate.accumulatedDepreciation || 0), 0);

    const depreciacionesFuturasPropiedades = validTransactions.filter(t => {
        return t.category === 'Depreciación Acumulada Activos Fijos' && 
               String(t.description).includes('Edificaciones') && 
               getSafeYear(t.date) > parseInt(currentYear);
    }).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

    const totalDepreciacionPropiedades = depreciacionPropiedadesGlobal - depreciacionesFuturasPropiedades;

    depreciacionAcumuladaValue = -Math.abs(totalDepreciacionInventario + totalDepreciacionPropiedades);
    
    const realEstatesValue = fRealEstates.filter(estate => getSafeYear(estate.date) <= parseInt(currentYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);

    const accountsReceivableValue = fAccountsReceivable.filter(r => {
        const rYear = r.date ? getSafeYear(r.date) : (r.year ? parseInt(r.year) : parseInt(currentYear));
        return r.status === 'Pendiente' && rYear <= parseInt(currentYear);
    }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);

    const accountsPayableValue = fAccountsPayable.filter(p => {
        const pYear = p.date ? getSafeYear(p.date) : (p.year ? parseInt(p.year) : parseInt(currentYear));
        return p.status === 'Pendiente' && pYear <= parseInt(currentYear);
    }).reduce((sum, p) => sum + safeParseFloat(p.amount), 0);

    // 🚀 APLICACIÓN NIIF: Cálculo de Totales Corrientes y No Corrientes
    const totalActivoCorriente = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue;
    const totalActivoNoCorriente = intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue;
    
    const totalAssets = totalActivoCorriente + totalActivoNoCorriente; 
    const totalLiabilities = accountsPayableValue + otherLiabilitiesValue;
    const totalEquity = totalAssets - totalLiabilities; 
    const retainedEquity = totalEquity - netProfit;

    // 🚀 APLICACIÓN NIIF: Arreglo de Activos Estructurado y Jerárquico
    const assets = [
            { item: 'ACTIVO CORRIENTE', isBold: true },
            { item: '  Efectivo y Equivalentes', isBold: true },
            { item: '    Caja General', amount: cajaGeneralValue, isSubtotal: true },
            { item: '      Caja Principal', amount: cajaPrincipalBalance },
            ...dynamicCashAccounts.map(acc => ({ item: `      ${acc.name}`, amount: acc.balance })),
            { item: '      Cuentas Bancarias', amount: totalBankBalances },
            { item: '      Aportes Ordinarios', amount: totalInvestmentBalances },
            { item: '  Cuentas por Cobrar', amount: accountsReceivableValue },
            { item: '  Anticipos a Proveedores', amount: anticiposValue }, 
            { item: '  Otros Activos Corrientes', amount: otherAssetsValue }, 
            { item: 'TOTAL ACTIVO CORRIENTE', amount: totalActivoCorriente, isSubtotal: true, isTopBorder: true },
            
            { item: 'ACTIVO NO CORRIENTE', isBold: true },
            { item: '  Activos Intangibles (Licencias)', amount: intangiblesValue },
            { item: '  Construcciones en Curso', amount: construccionesValue }, 
            { item: '  Propiedades, Planta y Equipo', amount: realEstatesValue },
            { item: '  Activos Fijos (Oficina y Equipos)', amount: manualFixedAssetsValue },
            { item: '  Inventario', amount: inventoryValue },
            { item: '  Depreciación Acumulada', amount: depreciacionAcumuladaValue },
            { item: 'TOTAL ACTIVO NO CORRIENTE', amount: totalActivoNoCorriente, isSubtotal: true, isTopBorder: true },
        ];
        
    const liabilities = [ { item: 'Pasivo', isBold: true }, { item: '  Cuentas por Pagar', amount: accountsPayableValue }, { item: '  Otros Pasivos (Fondos de Terceros)', amount: otherLiabilitiesValue }, ];
        
    const equity = [ 
      { item: 'Patrimonio', isBold: true }, 
      { item: '  Capital Social (Inc. Utilidades Acum.)', amount: retainedEquity }, 
      { item: '  Utilidad del Ejercicio', amount: netProfit }
    ];

    const balanceSheet = { assets: assets.filter(a => a.amount != null || a.isBold || a.isSubtotal), liabilities: liabilities.filter(l => l.amount != null || l.isBold), equity: equity.filter(e => e.amount != null || e.isBold), totals: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity, liabilitiesAndEquity: totalLiabilities + totalEquity } };

    const initialBank = fBankAccounts.reduce((sum, acc) => {
        const creationYear = getAccountCreationYear(acc.id, acc.date);
        if (creationYear <= parseInt(currentYear)) return sum + safeParseFloat(acc.initialBalance);
        return sum;
    }, 0);
    const initialCashTotal = initialCash + initialBank;

    // 🚀 NIIF/IFRS: Depuración de partidas no monetarias (El efectivo no se ve afectado por la depreciación)
    const nonCashKeywords = ['depreciaci', 'amortizaci', 'agotamiento'];
    const cashExpenseAccounts = expenseAccounts.filter(acc => {
        const num = String(acc.number);
        const name = acc.name.toLowerCase();
        // Filtramos códigos PUC asociados a provisiones y depreciaciones (Clase 5160)
        if (num.startsWith('5160') || num.startsWith('5165') || num.startsWith('5168') || num.startsWith('5199')) return false;
        // Filtramos por palabras clave en caso de cuentas nominales creadas por el usuario
        if (nonCashKeywords.some(kw => name.includes(kw))) return false;
        return true;
    });

    const cashExpensesTotal = cashExpenseAccounts.reduce((sum, acc) => sum + Math.abs(calculateTotalForCategory(acc.name, '5')), 0);
    const cashCostsTotal = costAccounts.reduce((sum, acc) => sum + Math.abs(calculateTotalForCategory(acc.name, '6')), 0);

    const cashFlow = {
        initial: initialCashTotal,
        sources: [
            ...incomeAccounts.map(acc => ({ item: `${acc.number} ${acc.name}`, amount: calculateTotalForCategory(acc.name, '4') })).filter(i => i.amount !== 0)
        ],
        uses: [
            ...cashExpenseAccounts.map(acc => ({ item: `${acc.number} ${acc.name}`, amount: Math.abs(calculateTotalForCategory(acc.name, '5')) })).filter(i => i.amount !== 0),
            ...costAccounts.map(acc => ({ item: `${acc.number} ${acc.name}`, amount: Math.abs(calculateTotalForCategory(acc.name, '6')) })).filter(i => i.amount !== 0),
            { item: 'Inversiones y Adquisiciones Activos', amount: manualFixedAssetsValue + construccionesValue }
        ],
        totalSources: totalIncome,
        totalUses: cashExpensesTotal + cashCostsTotal + manualFixedAssetsValue + construccionesValue,
        final: cajaGeneralValue
    };

    setReportData({ summary: summaryData, incomeStatement, balanceSheet, cashFlow });
  };
  
  const handleExportReport = (data, name) => { 
      try {
          const companyName = activeCompany?.name || ' ';
          const companyNit = activeCompany?.doc ? `NIT: ${activeCompany.doc}` : 'NIT: 802012765';

          const dataToExport = [
              { 'Concepto': companyName, 'Monto': '' },
              { 'Concepto': companyNit, 'Monto': '' },
              { 'Concepto': `ESTADO DE RESULTADOS INTEGRAL - AÑO FISCAL ${selectedYear}`, 'Monto': '' },
              { 'Concepto': `Fecha de generación: ${new Date().toLocaleDateString('es-CO')}`, 'Monto': '' },
              { 'Concepto': '', 'Monto': '' }, 
              { 'Concepto': 'CONCEPTO / CUENTA', 'Monto': 'VALOR ($)' },
              { 'Concepto': '', 'Monto': '' } 
          ];

          (data || []).forEach(row => {
              dataToExport.push({
                  'Concepto': row.item ? String(row.item).trim() : '',
                  'Monto': row.amount != null ? row.amount : ''
              });
          });

          exportToExcel(dataToExport, `${name}_${selectedYear}`, {}); 
          toast({ title: 'Exportado a Excel', description: 'El reporte se ha exportado exitosamente.' }); 
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error de Exportación', description: error.message });
      }
  };

  const handlePrintClick = (type) => {
      try {
          setPrintType(type);
          setPrintConfigOpen(true);
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: error.message });
      }
  };

  const executePrint = () => {
      try {
          setPrintConfigOpen(false);
          const printWindow = window.open('', '_blank', 'width=1000,height=800');
          if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador", description: "Permite los pop-ups para imprimir." }); return; }

          const companyName = activeCompany?.name || ' ';
          const companyNit = activeCompany?.doc ? `NIT: ${activeCompany.doc}` : 'NIT: 900.316.227-7';
          const arquidiocesis = "ARQUIDIOCESIS DE BARRANQUILLA";
          const fechaCorte = `A 31 DE DICIEMBRE DE ${selectedYear}`;

          const styles = `
              <style>
                  @media print {
                      @page { margin: 20mm; size: letter portrait; }
                      body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: black; }
                  }
                  body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: black; padding: 20px; }
                  h1, h2, h3 { text-align: center; margin: 2px 0; font-size: 14px; font-weight: bold; }
                  .header { text-align: center; margin-bottom: 30px; font-weight: bold; font-size: 13px; line-height: 1.3; }
                  .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                  .td { padding: 4px 0; vertical-align: bottom; }
                  .td-right { text-align: right; }
                  .border-bottom { border-bottom: 1px solid black; }
                  .border-bottom-double { border-bottom: 3px double black; }
                  .bold { font-weight: bold; }
                  .signatures { display: flex; justify-content: space-between; margin-top: 80px; page-break-inside: avoid; }
                  .sig-box { text-align: center; width: 40%; font-size: 12px; }
                  .sig-line { border-top: 1px solid black; margin-bottom: 5px; }
              </style>
          `;

          let content = '';
          
          // 🚀 Formateador universal estricto a 2 decimales
          const formatNum = (val) => parseFloat(val || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2});

          if (printType === 'balance') {
              const { assets, liabilities, equity, totals } = reportData.balanceSheet;
              
              const renderItems = (items) => (items || []).map(item => {
                  const rawName = String(item.item || '');
                  // Calculamos la indentación en píxeles basados en los espacios
                  const leadingSpaces = Math.max(rawName.search(/\\S/), 0);
                  const paddingLeft = leadingSpaces > 0 ? (leadingSpaces * 6) + 'px' : '0px';
                  const cleanName = rawName.trim().toUpperCase();

                  if (item.isBold && item.amount == null) return `<tr><td class="td bold" colspan="2" style="padding-left: ${paddingLeft};"><br/>${cleanName}</td></tr>`;
                  
                  let amountStr = item.amount != null ? `$ ${formatNum(item.amount)}` : '';
                  let rowClass = item.isTotal ? 'bold border-bottom-double' : (item.isSubtotal ? 'bold border-bottom' : '');
                  return `<tr><td class="td ${item.isBold || item.isSubtotal ? 'bold' : ''}" style="padding-left: ${paddingLeft};">${cleanName}</td><td class="td td-right ${rowClass}">${amountStr}</td></tr>`;
              }).join('');

              content = `
                  <div class="header">
                      ${arquidiocesis}<br/>
                      ${companyName}<br/>
                      ${companyNit}<br/>
                      BALANCE GENERAL ${fechaCorte}
                  </div>
                  <table class="table">
                      <tr><td class="td bold" colspan="2">ACTIVO</td></tr>
                      ${renderItems(assets)}
                      <tr><td class="td bold"><br/>TOTAL ACTIVO</td><td class="td td-right bold border-bottom-double"><br/>$ ${formatNum(totals?.assets)}</td></tr>
                      
                      <tr><td class="td bold" colspan="2"><br/>PASIVO</td></tr>
                      ${renderItems(liabilities)}
                      <tr><td class="td bold"><br/>TOTAL PASIVOS</td><td class="td td-right bold border-bottom-double"><br/>$ ${formatNum(totals?.liabilities)}</td></tr>
                      
                      <tr><td class="td bold" colspan="2"><br/>PATRIMONIO</td></tr>
                      ${renderItems(equity)}
                      <tr><td class="td bold"><br/>TOTAL PATRIMONIO</td><td class="td td-right bold border-bottom-double"><br/>$ ${formatNum(totals?.equity)}</td></tr>
                      
                      <tr><td class="td bold"><br/>TOTAL PASIVO + PATRIMONIO</td><td class="td td-right bold border-bottom-double"><br/>$ ${formatNum(totals?.liabilitiesAndEquity)}</td></tr>
                  </table>
              `;
          } else if (printType === 'pnl') {
              content = `
                  <div class="header">
                      ${arquidiocesis}<br/>
                      ${companyName}<br/>
                      ${companyNit}<br/>
                      ESTADO DE RESULTADO ${fechaCorte}
                  </div>
                  <table class="table">
                      ${(reportData.incomeStatement || []).map(item => {
                          const rawName = String(item.item || '');
                          const leadingSpaces = Math.max(rawName.search(/\\S/), 0);
                          const paddingLeft = leadingSpaces > 0 ? (leadingSpaces * 6) + 'px' : '0px';
                          const cleanName = rawName.trim().toUpperCase();

                          if (item.isBold && !item.amount && !item.isTotal) return `<tr><td class="td bold" colspan="2" style="padding-left: ${paddingLeft};"><br/>${cleanName}</td></tr>`;
                          let amountStr = item.amount != null ? `$ ${formatNum(Math.abs(item.amount))}` : '';
                          let rowClass = item.isTotal || item.isSubtotal ? 'bold border-bottom-double' : '';
                          return `<tr><td class="td ${item.isBold ? 'bold' : ''}" style="padding-left: ${paddingLeft};">${cleanName}</td><td class="td td-right ${rowClass}">${amountStr}</td></tr>`;
                      }).join('')}
                  </table>
              `;
          } else if (printType === 'cashflow') {
              const { initial, sources, uses, totalSources, totalUses, final } = reportData.cashFlow;
              content = `
                  <div class="header">
                      ${arquidiocesis}<br/>
                      ${companyName}<br/>
                      ${companyNit}<br/>
                      FLUJO DE EFECTIVO ${fechaCorte}
                  </div>
                  <table class="table">
                      <tr><td class="td bold" colspan="2">Fuentes:</td></tr>
                      <tr><td class="td" style="padding-left:12px;">Disponible Inicial (Caja-Bancos)</td><td class="td td-right border-bottom">${formatNum(initial)}</td></tr>
                      <tr><td class="td bold" style="padding-left:12px;">Más: Ingresos Ordinarios / del Mes</td><td class="td td-right bold border-bottom">${formatNum(totalSources)}</td></tr>
                      ${(sources || []).map(s => `<tr><td class="td" style="padding-left:36px;">${s.item}</td><td class="td td-right border-bottom">${formatNum(s.amount)}</td></tr>`).join('')}
                      <tr><td class="td bold" style="padding-left:12px;"><br/>Total Disponible</td><td class="td td-right bold border-bottom-double"><br/>${formatNum((initial || 0) + (totalSources || 0))}</td></tr>
                      
                      <tr><td class="td bold" colspan="2"><br/>Usos de Fondo:</td></tr>
                      <tr><td class="td bold" style="padding-left:12px;">Menos: Gastos Realizados</td><td class="td td-right bold border-bottom">${formatNum(totalUses)}</td></tr>
                      ${(uses || []).map(u => `<tr><td class="td" style="padding-left:36px;">${u.item}</td><td class="td td-right border-bottom">${formatNum(u.amount)}</td></tr>`).join('')}
                      <tr><td class="td bold" style="padding-left:12px;"><br/>Total Usos de Fondo</td><td class="td td-right bold border-bottom-double"><br/>${formatNum(totalUses)}</td></tr>
                      
                      <tr><td class="td bold" style="padding-left:12px;"><br/>Saldo Disponible</td><td class="td td-right bold border-bottom-double"><br/>${formatNum(final)}</td></tr>
                  </table>
              `;
          }

          printWindow.document.write(`
              <!DOCTYPE html>
              <html>
              <head><title>Reporte_${printType}</title>${styles}</head>
              <body>
                  ${content}
                  <div class="signatures">
                      <div class="sig-box">
                          <div class="sig-line"></div>
                          <span class="bold">${signatures.repLegalName}</span><br/>
                          REPRESENTANTE LEGAL<br/>
                          ${signatures.repLegalId}
                      </div>
                      <div class="sig-box">
                          <div class="sig-line"></div>
                          <span class="bold">${signatures.contadorName}</span><br/>
                          CONTADOR PÚBLICO<br/>
                          ${signatures.contadorId}
                      </div>
                  </div>
              </body>
              </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: 'Hubo un error generando el PDF: ' + error.message });
      }
  };

  const handleExportBalanceSheet = () => { 
      try {
          const { assets, liabilities, equity, totals } = reportData.balanceSheet; 
          const companyName = activeCompany?.name || ' ';
          const companyNit = activeCompany?.doc ? `NIT: ${activeCompany.doc}` : 'NIT: 802012765';

          const dataToExport = [
              { 'Concepto': companyName, 'Monto': '' },
              { 'Concepto': companyNit, 'Monto': '' },
              { 'Concepto': `BALANCE GENERAL - AÑO FISCAL ${selectedYear}`, 'Monto': '' },
              { 'Concepto': `Fecha de generación: ${new Date().toLocaleDateString('es-CO')}`, 'Monto': '' },
              { 'Concepto': '', 'Monto': '' }, 
              { 'Concepto': 'CONCEPTO / CUENTA', 'Monto': 'VALOR ($)' },
              { 'Concepto': '', 'Monto': '' } 
          ];

          (assets || []).forEach(a => {
              dataToExport.push({
                  'Concepto': a.item ? String(a.item).trim() : '',
                  'Monto': a.amount != null ? a.amount : ''
              });
          });
          dataToExport.push({ 'Concepto': 'TOTAL ACTIVOS', 'Monto': totals?.assets || 0 });
          dataToExport.push({ 'Concepto': '', 'Monto': '' });

          (liabilities || []).forEach(l => {
              dataToExport.push({
                  'Concepto': l.item ? String(l.item).trim() : '',
                  'Monto': l.amount != null ? l.amount : ''
              });
          });
          dataToExport.push({ 'Concepto': 'TOTAL PASIVOS', 'Monto': totals?.liabilities || 0 });
          dataToExport.push({ 'Concepto': '', 'Monto': '' });

          (equity || []).forEach(e => {
              dataToExport.push({
                  'Concepto': e.item ? String(e.item).trim() : '',
                  'Monto': e.amount != null ? e.amount : ''
              });
          });
          dataToExport.push({ 'Concepto': 'TOTAL PATRIMONIO', 'Monto': totals?.equity || 0 });
          dataToExport.push({ 'Concepto': '', 'Monto': '' });
          dataToExport.push({ 'Concepto': 'TOTAL PASIVO + PATRIMONIO', 'Monto': totals?.liabilitiesAndEquity || 0 });

          exportToExcel(dataToExport, `Balance_General_${selectedYear}`, {}); 
          toast({ title: 'Exportado a Excel', description: 'El Balance General se ha exportado exitosamente con la estructura formal.' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error de Exportación', description: error.message });
      }
  };

  // 🚀 Modificación Visual de la Tabla para aplicar indentación a sub-cuentas
  const renderSheetTable = (items) => (items.map((item, index) => {
      const leadingSpaces = Math.max(String(item.item || '').search(/\\S/), 0);
      const dynamicPadding = leadingSpaces > 0 ? (leadingSpaces * 8) + 'px' : '0px';

      return (
          <tr key={index} className={`border-b last:border-none ${item.isTopBorder ? 'border-t-2 border-slate-300' : ''} ${item.isSubtotal ? 'bg-slate-50' : ''}`}>
              <td className={`py-2 ${item.isBold ? 'font-bold text-slate-800' : 'text-slate-600'} ${item.isSubtotal ? 'font-semibold text-slate-800' : ''}`} style={{ paddingLeft: dynamicPadding }}>
                  {item.item.trim()}
              </td>
              <td className={`py-2 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.isSubtotal ? 'font-semibold text-slate-800' : ''}`}>
                  {item.amount != null ? `$${parseFloat(item.amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
              </td>
          </tr>
      );
  }));

  return (
    <>
      <Helmet><title>Reportes - JaiderHerTur26</title></Helmet>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between md:items-center gap-4"><h1 className="text-4xl font-bold text-slate-900 mb-2">Reportes Financieros</h1><div className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-slate-500" /><Label htmlFor="year-select" className="font-medium">Año Fiscal:</Label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger id="year-select" className="w-[120px] bg-white"><SelectValue placeholder="Año" /></SelectTrigger><SelectContent>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent></Select></div></motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><div className="bg-green-100 p-6 rounded-lg border border-green-200"><p className="text-sm text-green-800">Ingresos Operacionales (P&L)</p><p className="text-2xl font-bold text-green-900">${reportData.summary.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><div className="bg-red-100 p-6 rounded-lg border border-red-200"><p className="text-sm text-red-800">Costos y Gastos (P&L)</p><p className="text-2xl font-bold text-red-900">${reportData.summary.totalExpenses.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><div className="bg-blue-100 p-6 rounded-lg border border-blue-200"><p className="text-sm text-blue-800">Utilidad Neta</p><p className="text-2xl font-bold text-blue-900">${reportData.summary.netProfit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><div className="bg-purple-100 p-6 rounded-lg border border-purple-200"><p className="text-sm text-purple-800">Margen de Ganancia</p><p className="text-2xl font-bold text-purple-900">{reportData.summary.profitMargin}%</p></div></div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-white rounded-xl shadow-lg border">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-bold text-slate-900">Balance General</h2>
                    <div className="flex gap-2">
                        <Button onClick={() => handlePrintClick('balance')} className="bg-blue-600 hover:bg-blue-700 text-white"><Printer className="w-4 h-4 mr-2" /> Imprimir PDF</Button>
                        <Button onClick={handleExportBalanceSheet} variant="outline"><Download className="w-4 h-4 mr-2" /> Excel</Button>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8"><div><h3 className="text-lg font-semibold mb-2 text-blue-700">Activos</h3><table className="w-full"><tbody>{renderSheetTable(reportData.balanceSheet.assets)}</tbody></table><table className="w-full mt-2"><tbody><tr className="border-t-2 border-slate-900"><td className="py-2 font-bold">Total Activos</td><td className="py-2 text-right font-mono font-bold">${reportData.balanceSheet.totals.assets?.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></tbody></table></div><div><h3 className="text-lg font-semibold mb-2 text-blue-700">Pasivos y Patrimonio</h3><table className="w-full"><tbody>{renderSheetTable(reportData.balanceSheet.liabilities)}</tbody></table><table className="w-full mt-2"><tbody>{renderSheetTable(reportData.balanceSheet.equity)}</tbody></table><table className="w-full mt-2"><tbody><tr className="border-t-2 border-slate-900"><td className="py-2 font-bold">Total Pasivo + Patrimonio</td><td className="py-2 text-right font-mono font-bold">${reportData.balanceSheet.totals.liabilitiesAndEquity?.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></tbody></table></div></div><div className={`p-4 text-center border-t text-sm font-semibold ${Math.abs(reportData.balanceSheet.totals.assets - reportData.balanceSheet.totals.liabilitiesAndEquity) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{Math.abs(reportData.balanceSheet.totals.assets - reportData.balanceSheet.totals.liabilitiesAndEquity) < 0.01 ? '¡El balance está cuadrado!' : 'El balance no está cuadrado'}</div>
            </div>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="bg-white rounded-xl shadow-lg border">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-bold text-slate-900">Estado de Resultados</h2>
                    <div className="flex gap-2">
                        <Button onClick={() => handlePrintClick('pnl')} className="bg-blue-600 hover:bg-blue-700 text-white"><Printer className="w-4 h-4 mr-2" /> Imprimir PDF</Button>
                        <Button onClick={() => handleExportReport(reportData.incomeStatement, 'Estado_de_Resultados')} variant="outline"><Download className="w-4 h-4 mr-2" /> Excel</Button>
                    </div>
                </div>
                <div className="p-6"><table className="w-full"><tbody>{reportData.incomeStatement.map((item, index) => (<tr key={index} className={`border-b last:border-none ${item.isTotal ? 'bg-blue-100/50' : ''} ${item.isSubtotal ? 'bg-slate-50' : ''} ${item.isTopBorder ? 'border-t-2 border-slate-300' : ''}`}><td className={`py-3 ${item.isBold ? 'font-bold text-slate-900' : 'text-slate-600'} pl-${Math.max(String(item.item).search(/\\S/), 0) * 2}`}>{item.item.trim()}</td><td className={`py-3 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>{item.amount != null ? `$${parseFloat(item.amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</td></tr>))}</tbody></table></div>
            </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="bg-white rounded-xl shadow-lg border">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-bold text-slate-900">Flujo de Efectivo</h2>
                    <div className="flex gap-2">
                        <Button onClick={() => handlePrintClick('cashflow')} className="bg-blue-600 hover:bg-blue-700 text-white"><Printer className="w-4 h-4 mr-2" /> Imprimir PDF</Button>
                    </div>
                </div>
                <div className="p-6">
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b"><td className="py-2 font-bold text-slate-800" colSpan="2">Fuentes:</td></tr>
                            <tr className="border-b"><td className="py-2 pl-4 text-slate-600">Disponible Inicial (Caja-Bancos)</td><td className="py-2 text-right font-mono">${(reportData.cashFlow?.initial || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            <tr className="border-b bg-slate-50"><td className="py-2 pl-4 font-bold text-slate-800">Más: Ingresos Ordinarios / del Mes</td><td className="py-2 text-right font-mono font-bold text-green-700">${(reportData.cashFlow?.totalSources || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            <tr className="border-b-2 border-slate-800"><td className="py-2 pl-4 font-bold text-slate-900">Total Disponible</td><td className="py-2 text-right font-mono font-bold text-slate-900">${((reportData.cashFlow?.initial || 0) + (reportData.cashFlow?.totalSources || 0)).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            
                            <tr className="border-b mt-4"><td className="py-2 font-bold text-slate-800" colSpan="2"><br/>Usos de Fondo:</td></tr>
                            <tr className="border-b bg-slate-50"><td className="py-2 pl-4 font-bold text-slate-800">Menos: Gastos Realizados</td><td className="py-2 text-right font-mono font-bold text-red-700">${(reportData.cashFlow?.totalUses || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            <tr className="border-b-2 border-slate-800"><td className="py-2 pl-4 font-bold text-slate-900">Total Usos de Fondo</td><td className="py-2 text-right font-mono font-bold text-slate-900">${(reportData.cashFlow?.totalUses || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            
                            <tr className="bg-blue-100/50"><td className="py-3 pl-4 font-bold text-blue-900 text-lg">Saldo Disponible Final</td><td className="py-3 text-right font-mono font-bold text-blue-900 text-lg">${(reportData.cashFlow?.final || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
      </div>

      <Dialog open={printConfigOpen} onOpenChange={setPrintConfigOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Configuración de Firmas</DialogTitle>
                <DialogDescription>Confirma los nombres que aparecerán en la firma del documento antes de imprimir.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label>Nombre Representante Legal</Label>
                    <input type="text" className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={signatures.repLegalName} onChange={e => setSignatures({...signatures, repLegalName: e.target.value})} />
                </div>
                <div className="grid gap-2">
                    <Label>Documento Representante</Label>
                    <input type="text" className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={signatures.repLegalId} onChange={e => setSignatures({...signatures, repLegalId: e.target.value})} />
                </div>
                <div className="grid gap-2">
                    <Label>Nombre Contador Público</Label>
                    <input type="text" className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={signatures.contadorName} onChange={e => setSignatures({...signatures, contadorName: e.target.value})} />
                </div>
                <div className="grid gap-2">
                    <Label>Tarjeta Profesional Contador</Label>
                    <input type="text" className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={signatures.contadorId} onChange={e => setSignatures({...signatures, contadorId: e.target.value})} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setPrintConfigOpen(false)}>Cancelar</Button>
                <Button onClick={executePrint} className="bg-blue-600 hover:bg-blue-700 text-white">Generar PDF Oficial</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Reports;