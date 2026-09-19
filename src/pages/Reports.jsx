import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, Calendar, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel, exportProfessionalTable, exportProfessionalWorkbook } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext'; 
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';
import { expandTransactionsByAllocation } from '@/lib/transactionAllocations';
import { calculateLiquidityBalances, buildCashFlowFromLiquidity } from '@/lib/financialMovements';
import { getOpenItemDate, getOutstandingBalance } from '@/lib/outstandingBalance';
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
  
  // Rango de fechas
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const todayDateKey = new Date().toISOString().split('T')[0];
  const effectiveEndDate = endDate > todayDateKey ? todayDateKey : endDate;
  const initializedRangeCompanyRef = useRef('');

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

  // El período sugerido comienza el día siguiente al saldo de apertura cuando
  // esa apertura pertenece al año actual. Así Santa Cruz abre el 01/08/2026
  // a partir de los saldos recibidos al 31/07/2026, sin inventar enero-julio.
  useEffect(() => {
      if (!activeCompany?.id) return;
      const rangeKey = `${activeCompany.id}|${isConsolidated ? 'C' : 'N'}`;
      if (initializedRangeCompanyRef.current === rangeKey) return;

      const openingItems = [
          ...filterByCompany(initialBalance || []),
          ...filterByCompany(bankAccounts || [])
      ];
      if (openingItems.length === 0) return;

      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const openingDates = openingItems
          .map(item => String(item?.date || '').slice(0, 10))
          .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
          .sort();

      let suggestedStart = yearStart;
      const latestOpening = openingDates.at(-1);
      if (latestOpening) {
          const opening = new Date(`${latestOpening}T12:00:00`);
          opening.setDate(opening.getDate() + 1);
          const nextDay = `${opening.getFullYear()}-${String(opening.getMonth() + 1).padStart(2, '0')}-${String(opening.getDate()).padStart(2, '0')}`;
          if (nextDay.startsWith(String(currentYear)) && nextDay > yearStart) suggestedStart = nextDay;
      }

      setStartDate(suggestedStart);
      setEndDate(todayDateKey);
      initializedRangeCompanyRef.current = rangeKey;
  }, [activeCompany?.id, isConsolidated, initialBalance, bankAccounts, filterByCompany, todayDateKey]);

  useEffect(() => { generateReportData(); }, [transactions, accounts, bankAccounts, initialBalance, cashAccounts, fixedAssets, realEstates, accountsReceivable, accountsPayable, inventory, startDate, effectiveEndDate, isConsolidated, filterByCompany]);

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
    
    // Mantenemos currentYear derivado dinámicamente para que la lógica de depreciación siga funcionando intacta
    const currentYear = getSafeYear(effectiveEndDate).toString();

    const baseValidTransactions = allTransactions.filter(t => 
        !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
    );
    const validTransactions = expandTransactionsByAllocation(baseValidTransactions);
    
    const cashAccountIds = new Set();
    cashAccountIds.add('caja_principal');
    if (allAccounts) { 
        allAccounts.forEach(acc => { 
            if (acc.number === '11050501' || acc.name.toUpperCase() === 'CAJA PRINCIPAL') { 
                cashAccountIds.add(acc.id); 
            } 
        }); 
    }

    // Filtrado exacto por fechas
    const pnlTransactions = validTransactions.filter(t => {
        const tDate = t.date?.substring(0, 10) || '';
        return tDate >= startDate && tDate <= effectiveEndDate;
    });
    
    const bsTransactions = validTransactions.filter(t => {
        const tDate = t.date?.substring(0, 10) || '';
        return tDate <= effectiveEndDate;
    });

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

    // MOTOR ÚNICO DE LIQUIDEZ:
    // Caja, Bancos y Aportes se calculan siempre con la misma regla en todos los reportes.
    // Un ingreso contable sin movimiento de cuentas líquidas (p. ej. activo fijo recibido en donación)
    // NO se interpreta como entrada de efectivo.
    const liquidity = calculateLiquidityBalances({
        transactions: baseValidTransactions,
        initialBalances: fInitialBalance,
        bankAccounts: fBankAccounts,
        cashAccounts: fCashAccounts,
        accounts: allAccounts,
        cutoffDate: effectiveEndDate,
    });

    const cajaPrincipalBalance = liquidity.mainCash;
    const totalBankBalances = liquidity.totalBanks;
    const totalInvestmentBalances = liquidity.investments;
    const customCashBalance = liquidity.totalCustomCash;
    
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
            else if (drCode.startsWith('1') && !drCode.startsWith('11') && !drCode.startsWith('1295') && !drCode.startsWith('1305') && !drCode.startsWith('14') && !drCode.startsWith('15')) {
                otherAssetsValue += amount;
            }
            else if (drCode.startsWith('2') && !drCode.startsWith('2305')) otherLiabilitiesValue -= amount;

            if (crCode.startsWith('1330')) anticiposValue -= amount;
            else if (crCode.startsWith('1508')) construccionesValue -= amount;
            else if (crCode.startsWith('1592')) depreciacionAcumuladaValue -= amount; 
            else if (crCode.startsWith('16')) intangiblesValue -= amount;
            else if (crCode.startsWith('1') && !crCode.startsWith('11') && !crCode.startsWith('1295') && !crCode.startsWith('1305') && !crCode.startsWith('14') && !crCode.startsWith('15')) {
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
        else if (num.startsWith('1') && !num.startsWith('11') && !num.startsWith('1295') && !num.startsWith('1305') && !num.startsWith('14') && !num.startsWith('15')) {
            otherAssetsValue += assetImpact;
        }
        else if (num.startsWith('2') && !num.startsWith('2305')) {
            otherLiabilitiesValue += liabilityImpact;
        }
    });

    const totalCashBalance = cajaPrincipalBalance + customCashBalance;
    const cajaGeneralValue = totalCashBalance + totalBankBalances + totalInvestmentBalances;
    const dynamicCashAccounts = fCashAccounts.map(acc => ({
        ...acc,
        balance: liquidity.customCash[String(acc.id)] || 0,
    }));

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

    const accountsReceivableValue = fAccountsReceivable.reduce((sum, r) => {
        const rDate = getOpenItemDate(r);
        const rYear = rDate ? getSafeYear(rDate) : (r.year ? parseInt(r.year) : parseInt(currentYear));
        if (rYear > parseInt(currentYear)) return sum;
        return sum + getOutstandingBalance(r, effectiveEndDate);
    }, 0);

    const accountsPayableValue = fAccountsPayable.reduce((sum, p) => {
        const pDate = getOpenItemDate(p);
        const pYear = pDate ? getSafeYear(pDate) : (p.year ? parseInt(p.year) : parseInt(currentYear));
        if (pYear > parseInt(currentYear)) return sum;
        return sum + getOutstandingBalance(p, effectiveEndDate);
    }, 0);

    const totalActivoCorriente = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue;
    const totalActivoNoCorriente = intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue;
    
    const totalAssets = totalActivoCorriente + totalActivoNoCorriente; 
    const totalLiabilities = accountsPayableValue + otherLiabilitiesValue;
    const totalEquity = totalAssets - totalLiabilities; 
    const retainedEquity = totalEquity - netProfit;

    const assets = [
        { item: 'ACTIVO CORRIENTE', isBold: true },
        { item: '  Efectivo y Equivalentes', isBold: true },
        { item: '    Total Caja, Bancos y Aportes', amount: cajaGeneralValue, isSubtotal: true },
        { item: '      Caja Principal', amount: cajaPrincipalBalance },
        ...dynamicCashAccounts.map(acc => ({ item: `      ${acc.name}`, amount: acc.balance })),
        { item: '      Cuentas Bancarias', amount: totalBankBalances },
        { item: '      Aportes Ordinarios', amount: totalInvestmentBalances },
        { item: '  Cuentas por Cobrar', amount: accountsReceivableValue },
        { item: '  Anticipos a Proveedores', amount: anticiposValue }, 
        { item: '  Otros Activos Corrientes', amount: otherAssetsValue }, 
        { item: 'TOTAL ACTIVO CORRIENTE ', amount: totalActivoCorriente, isSubtotal: true, isTopBorder: true },
        
        { item: 'ACTIVO NO CORRIENTE', isBold: true },
        { item: '  Activos Intangibles (Licencias)', amount: intangiblesValue },
        { item: '  Construcciones en Curso', amount: construccionesValue }, 
        { item: '  Propiedades, Planta y Equipo', amount: realEstatesValue },
        { item: '  Activos Fijos (Oficina y Equipos)', amount: manualFixedAssetsValue },
        { item: '  Inventario', amount: inventoryValue },
        { item: '  Depreciación Acumulada', amount: depreciacionAcumuladaValue },
        { item: 'TOTAL ACTIVO NO CORRIENTE ', amount: totalActivoNoCorriente, isSubtotal: true, isTopBorder: true },
    ];
        
    const liabilities = [ { item: 'Pasivo', isBold: true }, { item: '  Cuentas por Pagar', amount: accountsPayableValue }, { item: '  Otros Pasivos (Fondos de Terceros)', amount: otherLiabilitiesValue }, ];
        
    const equity = [ 
      { item: '  Patrimonio Institucional (Inc. Utilidades Acum.)', amount: retainedEquity }, 
      { item: '  Utilidad del Ejercicio', amount: netProfit }
    ];

    const balanceSheet = { assets: assets.filter(a => a.amount != null || a.isBold || a.isSubtotal), liabilities: liabilities.filter(l => l.amount != null || l.isBold), equity: equity.filter(e => e.amount != null || e.isBold), totals: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity, liabilitiesAndEquity: totalLiabilities + totalEquity } };

    // FLUJO DE EFECTIVO POR MOVIMIENTO REAL:
    // Solo entra al flujo lo que efectivamente afecta Caja/Bancos. Los ingresos contables en especie,
    // como los $44,4 millones reconocidos contra Activo Fijo, quedan fuera del efectivo.
    const cashFlow = buildCashFlowFromLiquidity({
        transactions: baseValidTransactions,
        initialBalances: fInitialBalance,
        bankAccounts: fBankAccounts,
        cashAccounts: fCashAccounts,
        accounts: allAccounts,
        startDate,
        endDate: effectiveEndDate,
    });

    setReportData({ summary: summaryData, incomeStatement, balanceSheet, cashFlow });
  };
  
  const handleExportReport = (data, name) => { 
      try {
          const companyName = activeCompany?.name || 'ENTIDAD CONTABLE';
          const companyNit = activeCompany?.doc || '';
          const rows = (data || []).map(row => ({
              Concepto: row.item ? String(row.item).trim() : '',
              Valor: row.amount != null ? Number(row.amount) : null,
              __style: row.isTotal ? 'total' : (row.isSubtotal ? 'subtotal' : (row.isBold ? 'section' : ''))
          }));

          exportProfessionalTable({
              fileName: `${name}_${startDate}_al_${effectiveEndDate}`,
              companyName,
              nit: companyNit,
              title: 'ESTADO DE RESULTADOS INTEGRAL',
              period: `DEL ${startDate} AL ${effectiveEndDate}`,
              sheetName: 'Estado de Resultados',
              columns: [
                  { key: 'Concepto', label: 'CONCEPTO / CUENTA', width: 58, type: 'text' },
                  { key: 'Valor', label: 'VALOR (COP)', width: 22, type: 'currency' }
              ],
              rows,
              notes: [
                  'Cifras expresadas en pesos colombianos (COP).',
                  'Los fondos de terceros y traslados internos no forman parte del resultado operacional.'
              ]
          }); 
          toast({ title: 'Excel profesional generado', description: 'Estado de Resultados exportado con formato de revisión contable.' }); 
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
          const fechaCorte = printType === 'balance' ? `AL ${effectiveEndDate}` : `DEL ${startDate} AL ${effectiveEndDate}`;

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
          
          const formatNum = (val) => {
              const num = parseFloat(val) || 0;
              const absVal = Math.abs(num);
              if (absVal < 0.01) return (0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const str = absVal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return num < -0.01 ? `(${str})` : str;
          };

          if (printType === 'balance') {
              const { assets, liabilities, equity, totals } = reportData.balanceSheet;
              
              const renderItems = (items) => (items || []).map(item => {
                  const rawName = String(item.item || '');
                  const leadingSpaces = Math.max(rawName.search(/\\S/), 0);
                  const paddingLeft = leadingSpaces > 0 ? (leadingSpaces * 6) + 'px' : '0px';
                  const cleanName = rawName.toUpperCase();

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
              const { initial, sources, uses, totalSources, totalUses, final, reconciliationDifference } = reportData.cashFlow;
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
                      <tr><td class="td bold" style="padding-left:12px;">Más: Entradas reales de efectivo del período</td><td class="td td-right bold border-bottom">${formatNum(totalSources)}</td></tr>
                      ${(sources || []).map(s => `<tr><td class="td" style="padding-left:36px;">${s.item}</td><td class="td td-right border-bottom">${formatNum(s.amount)}</td></tr>`).join('')}
                      <tr><td class="td bold" style="padding-left:12px;"><br/>Total Disponible</td><td class="td td-right bold border-bottom-double"><br/>${formatNum((initial || 0) + (totalSources || 0))}</td></tr>
                      
                      <tr><td class="td bold" colspan="2"><br/>Usos de Fondo:</td></tr>
                      <tr><td class="td bold" style="padding-left:12px;">Menos: Salidas reales de efectivo del período</td><td class="td td-right bold border-bottom">${formatNum(totalUses)}</td></tr>
                      ${(uses || []).map(u => `<tr><td class="td" style="padding-left:36px;">${u.item}</td><td class="td td-right border-bottom">${formatNum(u.amount)}</td></tr>`).join('')}
                      <tr><td class="td bold" style="padding-left:12px;"><br/>Total Usos de Fondo</td><td class="td td-right bold border-bottom-double"><br/>${formatNum(totalUses)}</td></tr>
                      
                      <tr><td class="td bold" style="padding-left:12px;"><br/>Saldo Disponible</td><td class="td td-right bold border-bottom-double"><br/>${formatNum(final)}</td></tr>
                      <tr><td class="td bold" style="padding-left:12px;">Conciliación con Caja/Bancos</td><td class="td td-right bold">${Math.abs(reconciliationDifference || 0) < 0.01 ? 'OK' : `Diferencia ${formatNum(reconciliationDifference)}`}</td></tr>
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
          const toRows = (items = []) => items.map(item => ({
              Concepto: item.item ? String(item.item).trim() : '',
              Valor: item.amount != null ? Number(item.amount) : null,
              __style: item.isTotal ? 'total' : (item.isSubtotal ? 'subtotal' : (item.isBold ? 'section' : ''))
          }));

          const rows = [
              { Concepto: 'ACTIVO', Valor: null, __style: 'section' },
              ...toRows(assets),
              { Concepto: 'TOTAL ACTIVO', Valor: Number(totals?.assets || 0), __style: 'total' },
              { Concepto: 'PASIVO', Valor: null, __style: 'section' },
              ...toRows(liabilities),
              { Concepto: 'TOTAL PASIVOS', Valor: Number(totals?.liabilities || 0), __style: 'subtotal' },
              { Concepto: 'PATRIMONIO', Valor: null, __style: 'section' },
              ...toRows(equity),
              { Concepto: 'TOTAL PATRIMONIO', Valor: Number(totals?.equity || 0), __style: 'subtotal' },
              { Concepto: 'TOTAL PASIVO + PATRIMONIO', Valor: Number(totals?.liabilitiesAndEquity || 0), __style: 'total' }
          ];

          exportProfessionalTable({
              fileName: `Balance_General_al_${effectiveEndDate}`,
              companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
              nit: activeCompany?.doc || '',
              title: 'BALANCE GENERAL',
              period: `AL ${effectiveEndDate}`,
              sheetName: 'Balance General',
              columns: [
                  { key: 'Concepto', label: 'CONCEPTO / CUENTA', width: 58, type: 'text' },
                  { key: 'Valor', label: 'VALOR (COP)', width: 22, type: 'currency' }
              ],
              rows,
              notes: [
                  'Cifras expresadas en pesos colombianos (COP).',
                  'La línea “Total Caja, Bancos y Aportes” corresponde al subtotal de disponibilidades e inversiones registradas.'
              ]
          });
          toast({ title: 'Excel profesional generado', description: 'Balance General exportado con estructura formal de revisión.' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error de Exportación', description: error.message });
      }
  };

  const handleExportCashFlow = () => {
      try {
          const { initial, sources = [], uses = [], totalSources, totalUses, final, reconciliationDifference } = reportData.cashFlow || {};
          const rows = [
              { Concepto: 'FUENTES', Valor: null, __style: 'section' },
              { Concepto: 'Disponible Inicial (Caja-Bancos)', Valor: Number(initial || 0) },
              { Concepto: 'Entradas reales de efectivo del período', Valor: Number(totalSources || 0), __style: 'subtotal' },
              ...sources.map(item => ({ Concepto: item.item, Valor: Number(item.amount || 0) })),
              { Concepto: 'TOTAL DISPONIBLE', Valor: Number(initial || 0) + Number(totalSources || 0), __style: 'total' },
              { Concepto: 'USOS DE FONDO', Valor: null, __style: 'section' },
              { Concepto: 'Salidas reales de efectivo del período', Valor: Number(totalUses || 0), __style: 'subtotal' },
              ...uses.map(item => ({ Concepto: item.item, Valor: Number(item.amount || 0) })),
              { Concepto: 'TOTAL USOS DE FONDO', Valor: Number(totalUses || 0), __style: 'subtotal' },
              { Concepto: 'SALDO DISPONIBLE', Valor: Number(final || 0), __style: 'total' },
              {
                  Concepto: Math.abs(Number(reconciliationDifference || 0)) < 0.01
                      ? 'CONCILIACIÓN CON CAJA/BANCOS: OK'
                      : 'DIFERENCIA DE CONCILIACIÓN',
                  Valor: Number(reconciliationDifference || 0),
                  __style: Math.abs(Number(reconciliationDifference || 0)) < 0.01 ? 'success' : 'total'
              }
          ];

          exportProfessionalTable({
              fileName: `Flujo_de_Efectivo_${startDate}_al_${effectiveEndDate}`,
              companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
              nit: activeCompany?.doc || '',
              title: 'FLUJO DE EFECTIVO',
              period: `DEL ${startDate} AL ${effectiveEndDate}`,
              sheetName: 'Flujo de Efectivo',
              columns: [
                  { key: 'Concepto', label: 'CONCEPTO / CUENTA', width: 60, type: 'text' },
                  { key: 'Valor', label: 'VALOR (COP)', width: 22, type: 'currency' }
              ],
              rows,
              notes: [
                  'El flujo refleja movimientos reales de Caja y Bancos; traslados internos se presentan sin duplicar el efectivo.',
                  'Los recursos de terceros pueden entrar y salir por Caja sin afectar la utilidad operacional.'
              ]
          });
          toast({ title: 'Excel profesional generado', description: 'Flujo de Efectivo exportado con conciliación visible.' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error de Exportación', description: error.message });
      }
  };

  const renderSheetTable = (items) => (items.map((item, index) => {
      const leadingSpaces = Math.max(String(item.item || '').search(/\S/), 0);
      const dynamicPadding = leadingSpaces > 0 ? (leadingSpaces * 8) + 'px' : '0px';

      return (
          <tr key={index} className={`border-b last:border-none ${item.isTopBorder ? 'border-t-2 border-slate-300' : ''} ${item.isSubtotal ? 'bg-slate-50' : ''}`}>
              <td className={`py-2 ${item.isBold ? 'font-bold text-slate-800' : 'text-slate-600'} ${item.isSubtotal ? 'font-semibold text-slate-800' : ''}`} style={{ paddingLeft: dynamicPadding }}>
                  {item.item}
              </td>
              <td className={`py-2 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.isSubtotal ? 'font-semibold text-slate-800' : ''}`}>
                  {item.amount != null ? (
                      <span className={item.amount < -0.01 ? 'text-slate-900' : ''}>
                          ${" "} 
                          {item.amount < -0.01 
                              ? `(${Math.abs(item.amount).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` 
                              : Math.abs(item.amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                  ) : ''}
              </td>
          </tr>
      );
  }));

  return (
    <>
      <Helmet><title>Reportes - JaiderHerTur26</title></Helmet>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Reportes Financieros</h1>
            
            {/* 🚀 Nuevo bloque de Rango de Fechas */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-slate-500" />
                    <Label className="font-medium text-slate-700">Desde:</Label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={e => setStartDate(e.target.value)} 
                        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex items-center space-x-2">
                    <Label className="font-medium text-slate-700">Hasta:</Label>
                    <input 
                        type="date" 
                        value={endDate} 
                        max={todayDateKey}
                        onChange={e => setEndDate(e.target.value > todayDateKey ? todayDateKey : e.target.value)} 
                        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
            
        </motion.div>
        
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
                        <Button onClick={handleExportCashFlow} variant="outline"><Download className="w-4 h-4 mr-2" /> Excel</Button>
                    </div>
                </div>
                <div className="p-6">
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b"><td className="py-2 font-bold text-slate-800" colSpan="2">Fuentes:</td></tr>
                            <tr className="border-b"><td className="py-2 pl-4 text-slate-600">Disponible Inicial (Caja-Bancos)</td><td className="py-2 text-right font-mono">${(reportData.cashFlow?.initial || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            <tr className="border-b bg-slate-50"><td className="py-2 pl-4 font-bold text-slate-800">Más: Entradas reales de efectivo del período</td><td className="py-2 text-right font-mono font-bold text-green-700">${(reportData.cashFlow?.totalSources || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            {(reportData.cashFlow?.sources || []).map((source, index) => (
                                <tr key={"cash-source-" + index} className="border-b"><td className="py-1.5 pl-9 text-slate-600">{source.item}</td><td className="py-1.5 text-right font-mono text-slate-700">${(source.amount || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            ))}
                            <tr className="border-b-2 border-slate-800"><td className="py-2 pl-4 font-bold text-slate-900">Total Disponible</td><td className="py-2 text-right font-mono font-bold text-slate-900">${((reportData.cashFlow?.initial || 0) + (reportData.cashFlow?.totalSources || 0)).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            
                            <tr className="border-b mt-4"><td className="py-2 font-bold text-slate-800" colSpan="2"><br/>Usos de Fondo:</td></tr>
                            <tr className="border-b bg-slate-50"><td className="py-2 pl-4 font-bold text-slate-800">Menos: Salidas reales de efectivo del período</td><td className="py-2 text-right font-mono font-bold text-red-700">${(reportData.cashFlow?.totalUses || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            {(reportData.cashFlow?.uses || []).map((use, index) => (
                                <tr key={"cash-use-" + index} className="border-b"><td className="py-1.5 pl-9 text-slate-600">{use.item}</td><td className="py-1.5 text-right font-mono text-slate-700">${(use.amount || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            ))}
                            <tr className="border-b-2 border-slate-800"><td className="py-2 pl-4 font-bold text-slate-900">Total Usos de Fondo</td><td className="py-2 text-right font-mono font-bold text-slate-900">${(reportData.cashFlow?.totalUses || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                            
                            <tr className="bg-blue-100/50"><td className="py-3 pl-4 font-bold text-blue-900 text-lg">Saldo Disponible Final</td><td className="py-3 text-right font-mono font-bold text-blue-900 text-lg">${(reportData.cashFlow?.final || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
                        </tbody>
                    </table>
                    <div className={`mt-4 p-3 rounded-lg text-sm font-semibold text-center ${Math.abs(reportData.cashFlow?.reconciliationDifference || 0) < 0.01 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        {Math.abs(reportData.cashFlow?.reconciliationDifference || 0) < 0.01
                            ? 'Flujo de efectivo conciliado con los saldos reales de Caja y Bancos.'
                            : `Diferencia de conciliación: $${Math.abs(reportData.cashFlow?.reconciliationDifference || 0).toLocaleString('es-CO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                    </div>
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