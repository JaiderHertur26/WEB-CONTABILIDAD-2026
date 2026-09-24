import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Info } from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import StatCard from '@/components/dashboard/StatCard';
import DashboardHero from '@/components/dashboard/DashboardHero';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import ContractTaxAlert from '@/components/contracts/ContractTaxAlert';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { format, startOfMonth, subMonths, eachMonthOfInterval, startOfDay, endOfDay, startOfYear, endOfYear, isBefore, isAfter, isWithinInterval } from 'date-fns';
import { expandTransactionsByAllocation } from '@/lib/transactionAllocations';
import { calculateLiquidityBalances } from '@/lib/financialMovements';
import { getOpenItemDate, getOutstandingBalance } from '@/lib/outstandingBalance';
import { parseAccountingDate, getAccountingYear, toAccountingDateInput } from '@/lib/accountingDate';
import { getCompanyScopeIds } from '@/lib/companyHierarchy';

const Dashboard = () => {
  const { activeCompany, companies, isConsolidated, toggleConsolidation } = useCompany();
  const navigate = useNavigate();
  const [transactionsData, , isTransactionsLoaded] = useCompanyData('transactions');
  const [initialBalanceData, , isInitialBalanceLoaded] = useCompanyData('initialBalance');
  const [bankAccountsData, , isBankAccountsLoaded] = useCompanyData('bankAccounts');
  const [cashAccountsData, , isCashAccountsLoaded] = useCompanyData('cash_accounts'); 
  const [fixedAssetsData, , isFixedAssetsLoaded] = useCompanyData('fixedAssets');
  const [realEstatesData, , isRealEstatesLoaded] = useCompanyData('realEstates');
  const [accountsReceivableData, , isARLoaded] = useCompanyData('accountsReceivable');
  const [accountsData, , isAccountsLoaded] = useCompanyData('accounts');
  const [inventoryData, , isInventoryLoaded] = useCompanyData('inventory');

  const [stats, setStats] = useState({
    generalBalance: 0,
    totalIncome: 0,
    totalExpenses: 0,
    cashBalance: 0,
  });

  const [chartData, setChartData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  
  // Year Selector State
  const today = new Date();
  const todayDateKey = toAccountingDateInput(today);
  const currentYear = today.getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  // Para la vigencia actual el Dashboard siempre corta en hoy; nunca proyecta
  // movimientos futuros como si ya hubieran ocurrido.
  const [dateRange, setDateRange] = useState({
    from: startOfYear(today),
    to: today,
  });
  const selectedCutoffDate = Number(selectedYear) >= currentYear
    ? todayDateKey
    : `${selectedYear}-12-31`;
  
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#ec4899', '#14b8a6'];

  const areAllDataLoaded = () => {
    return isTransactionsLoaded && isInitialBalanceLoaded && isBankAccountsLoaded && isFixedAssetsLoaded && isRealEstatesLoaded && isARLoaded && isAccountsLoaded && isCashAccountsLoaded && isInventoryLoaded;
  };

  const handleDateRangeChange = (e, field) => {
    const rawDate = String(e.target.value || '');
    const safeDate = rawDate > todayDateKey ? todayDateKey : rawDate;
    const adjustedDate = parseAccountingDate(safeDate);
    setDateRange(prev => {
      if (field === 'from' && adjustedDate > prev.to) return { from: adjustedDate, to: adjustedDate };
      if (field === 'to' && adjustedDate < prev.from) return { from: adjustedDate, to: adjustedDate };
      return { ...prev, [field]: adjustedDate };
    });
  };
  
  const handleYearChange = (year) => {
    setSelectedYear(year);
    const date = new Date(parseInt(year), 0, 1);
    
    setDateRange({
        from: startOfYear(date),
        to: parseInt(year, 10) >= currentYear ? today : endOfYear(date),
    });
  };

  const currentId = String(activeCompany?.id || '').trim();
  const consolidatedCompanyIds = useMemo(
    () => getCompanyScopeIds(companies, currentId),
    [companies, currentId]
  );
  const hasSubCompanies = consolidatedCompanyIds.size > (currentId ? 1 : 0);

  // 🚀 HELPER SEGURO DE FECHAS
  const getSafeYear = (dateStr) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'string' && dateStr.includes('-')) {
          return parseInt(dateStr.split('-')[0], 10);
      }
      return getAccountingYear(dateStr);
  };

  // 🚀 FILTRO MAESTRO DE CONSOLIDACIÓN
  const filterByCompany = useMemo(() => (items) => {
      if (!items) return [];
      return items.filter(item => {
          const cid = item.company_id || item._companyId || item.companyId;
          if (!isConsolidated) return !cid || String(cid) === String(activeCompany?.id);
          return !cid || consolidatedCompanyIds.has(String(cid));
      });
  }, [isConsolidated, activeCompany, consolidatedCompanyIds]);

  const availableYears = useMemo(() => {
      const validTransactions = filterByCompany(transactionsData || []).filter(t => 
        !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
      );
      const current = new Date().getFullYear();
      const years = new Set(
          validTransactions
              .map(t => getSafeYear(t.date))
              .filter(year => Number.isInteger(year) && year > 0 && year <= current)
      );
      years.add(current);
      return Array.from(years).sort((a, b) => b - a).map(String);
  }, [transactionsData, filterByCompany]);

  useEffect(() => {
    if (!areAllDataLoaded()) return;

    const safeParseFloat = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    };
      
    // 🚀 BLINDAMOS TODOS LOS ARREGLOS
    const allTransactions = filterByCompany(transactionsData);
    const fInitialBalance = filterByCompany(initialBalanceData);
    const fCashAccounts = filterByCompany(cashAccountsData);
    const fBankAccounts = filterByCompany(bankAccountsData);
    const fFixedAssets = filterByCompany(fixedAssetsData);
    const fRealEstates = filterByCompany(realEstatesData);
    const fAccountsReceivable = filterByCompany(accountsReceivableData);
    const fInventory = filterByCompany(inventoryData);
    const allAccounts = accountsData || [];

    const INVALID_STATUSES = ['eliminado', 'anulado', 'cancelado', 'borrador'];

    const validTransactions = allTransactions.filter(t => 
        !INVALID_STATUSES.includes(t.status?.toLowerCase())
    );
    const expandedValidTransactions = expandTransactionsByAllocation(validTransactions);

    const pickerStart = startOfDay(dateRange.from);
    const pickerEnd = endOfDay(dateRange.to);

    const transactionsInPeriod = expandedValidTransactions.filter(t => {
        if (!t.date) return false;
        const comparisonDate = parseAccountingDate(t.date);
        return comparisonDate >= pickerStart && comparisonDate <= pickerEnd;
    });

    const bsTransactions = expandedValidTransactions.filter(t => {
        const dateKey = toAccountingDateInput(t.date);
        return dateKey && dateKey <= selectedCutoffDate;
    });

    const getAccountPrefix = (categoryName) => {
        const account = allAccounts.find(a => a.name === categoryName);
        return account ? String(account.number).charAt(0) : null;
    };

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

    // 🚀 MOTOR PUC UNIFICADO PARA EFECTIVO (Idéntico al Balance General)
    const getAssetDetails = (destinationStr, categoryName = '') => {
        if (!destinationStr) return { code: '238095', name: 'PARTIDAS POR CLASIFICAR' };
        const [id, name] = destinationStr.split('|');
        if (id === 'pending_payable') return { code: '23050101', name: 'CUENTAS POR PAGAR' };
        if (id === 'pending_receivable') return { code: '13050505', name: 'CUENTAS POR COBRAR' };
        if (id === 'caja_principal' || (name && name.toUpperCase().includes('CAJA PRINCIPAL'))) return { code: '11050501', name: 'CAJA PRINCIPAL' };
        const cashAcc = (cashAccountsData || []).find(c => c.id === id);
        if (cashAcc) return { code: cashAcc.accounting_account || '1105', name: cashAcc.name };
        if (id === '12950501' || (name && name.toUpperCase().includes('APORTES COOPERATIVA'))) return { code: '12950501', name: 'APORTES COOPERATIVA FRATERNIDAD' };
        const bank = (bankAccountsData || []).find(b => b.id === id);
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
            const catObj = (accountsData || []).find(a => a.name === t.category) || { number: '421004', name: t.category };
            return { debit: { code: assetAcc.code, name: assetAcc.name, value: amount }, credit: { code: catObj.number || '421004', name: catObj.name || t.category, value: amount } };
        }
        if (t.type === 'transfer' && t.fromAccount && t.toAccount) {
            const debit = getAssetDetails(t.toAccount, t.category);
            const credit = getAssetDetails(t.fromAccount, t.category);
            return { debit: { ...debit, value: amount }, credit: { ...credit, value: amount } };
        }
        const assetAcc = getAssetDetails(t.destination, t.category);
        const catObj = (accountsData || []).find(a => a.name === t.category);
        const catAcc = { code: t._accountNumber || (catObj ? catObj.number : (t.type === 'income' ? '4105' : '5105')), name: t.category };
        if (t.type === 'income') {
            return { debit: { ...assetAcc, value: amount }, credit: { ...catAcc, value: amount } };
        } else {
            return { debit: { ...catAcc, value: amount }, credit: { ...assetAcc, value: amount } };
        }
    };

    // Liquidez calculada por un único motor compartido con Balance y Reportes Tributarios.
    const liquidity = calculateLiquidityBalances({
        transactions: validTransactions,
        initialBalances: fInitialBalance,
        bankAccounts: fBankAccounts,
        cashAccounts: fCashAccounts,
        accounts: allAccounts,
        cutoffDate: selectedCutoffDate,
    });

    const cajaPrincipalBalance = liquidity.mainCash;
    const totalBankBalances = liquidity.totalBanks;
    const totalInvestmentBalances = liquidity.investments;
    const customCashBalance = liquidity.totalCustomCash;
    const totalCashBalance = liquidity.totalCash;
    const cajaGeneralTotal = liquidity.totalLiquidity;
    
    // --- ASSETS (ACTIVOS UNIFICADOS) ---
    const inventoryValue = fInventory.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
    
    // Clonamos exactamente el filtro condicional del módulo Reports.jsx
    const manualFixedAssetsValue = fFixedAssets.filter(asset => {
        if (asset.status === 'Dado de Baja') return false; 
        const assetYear = asset.date ? getSafeYear(asset.date) : (asset.year ? parseInt(asset.year) : 0);
        return assetYear === parseInt(selectedYear);
    }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
    
    const realEstatesValue = fRealEstates.filter(estate => {
        const estateDate = toAccountingDateInput(estate.date);
        return estateDate ? estateDate <= selectedCutoffDate : getSafeYear(estate.date) <= parseInt(selectedYear);
    }).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);
    
    const accountsReceivableValue = fAccountsReceivable.reduce((sum, r) => {
        const rDate = getOpenItemDate(r);
        const rYear = rDate ? getSafeYear(rDate) : (r.year ? parseInt(r.year) : parseInt(selectedYear));
        if (rYear > parseInt(selectedYear)) return sum;
        return sum + getOutstandingBalance(r, selectedCutoffDate);
    }, 0);
    
    let anticiposValue = 0, construccionesValue = 0, otherAssetsValue = 0, intangiblesValue = 0, depreciacionAcumuladaValue = 0;

    bsTransactions.forEach(t => {
        const amount = safeParseFloat(t.amount);

        if (t.debitAccount && t.creditAccount) {
            // EVITAR DOBLE CONTABILIZACIÓN
            if (String(t.id).endsWith('-inc')) return;

            const drCode = String(t.debitAccount.code || '');
            const crCode = String(t.creditAccount.code || '');

            if (drCode.startsWith('1330')) anticiposValue += amount;
            else if (drCode.startsWith('1508')) construccionesValue += amount;
            else if (drCode.startsWith('1592')) depreciacionAcumuladaValue -= amount; 
            else if (drCode.startsWith('16')) intangiblesValue += amount;
            else if (drCode.startsWith('1') && !drCode.startsWith('11') && !drCode.startsWith('1305') && !drCode.startsWith('14') && !drCode.startsWith('15')) {
                otherAssetsValue += amount;
            }

            if (crCode.startsWith('1330')) anticiposValue -= amount;
            else if (crCode.startsWith('1508')) construccionesValue -= amount;
            else if (crCode.startsWith('1592')) depreciacionAcumuladaValue += amount; 
            else if (crCode.startsWith('16')) intangiblesValue -= amount;
            else if (crCode.startsWith('1') && !crCode.startsWith('11') && !crCode.startsWith('1305') && !crCode.startsWith('14') && !crCode.startsWith('15')) {
                otherAssetsValue -= amount;
            }
            return;
        }

        const acc = allAccounts.find(a => a.name === t.category);
        if (!acc) return;
        const num = String(acc.number);

        const assetImpact = t.type === 'expense' ? amount : -amount;

        if (num.startsWith('1330')) anticiposValue += assetImpact;
        else if (num.startsWith('1508')) construccionesValue += assetImpact;
        else if (num.startsWith('1592')) depreciacionAcumuladaValue += (t.type === 'expense' ? amount : -amount);
        else if (num.startsWith('16')) intangiblesValue += assetImpact;
        else if (num.startsWith('1') && !num.startsWith('11') && !num.startsWith('1305') && !num.startsWith('14') && !num.startsWith('15')) {
            otherAssetsValue += assetImpact;
        }
    });

    const totalDepreciacionInventario = fFixedAssets.filter(asset => {
        if (asset.status === 'Dado de Baja') return false; 
        const assetYear = asset.date ? getSafeYear(asset.date) : (asset.year ? parseInt(asset.year) : 0);
        return assetYear === parseInt(selectedYear);
    }).reduce((sum, asset) => sum + safeParseFloat(asset.accumulatedDepreciation || 0), 0);

    const depreciacionPropiedadesGlobal = fRealEstates.filter(estate => {
        if (estate.status === 'Dado de Baja') return false;
        return getSafeYear(estate.date) <= parseInt(selectedYear);
    }).reduce((sum, estate) => sum + safeParseFloat(estate.accumulatedDepreciation || 0), 0);

    const depreciacionesFuturasPropiedades = validTransactions.filter(t => {
        return t.category === 'Depreciación Acumulada Activos Fijos' && 
               String(t.description).includes('Edificaciones') && 
               toAccountingDateInput(t.date) > selectedCutoffDate;
    }).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

    const totalDepreciacionPropiedades = depreciacionPropiedadesGlobal - depreciacionesFuturasPropiedades;

    depreciacionAcumuladaValue = -Math.abs(totalDepreciacionInventario + totalDepreciacionPropiedades);

    const totalActivoCorriente = cajaGeneralTotal + accountsReceivableValue + anticiposValue + otherAssetsValue;
    const totalActivoNoCorriente = intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue;
    const totalAssets = totalActivoCorriente + totalActivoNoCorriente;

   
    // --- P&L CALCULATIONS (MOTOR UNIFICADO) ---
    let totalIncomes = 0;
    let totalExpenses = 0;

    transactionsInPeriod.forEach(t => {
        if (t.debitAccount && t.creditAccount && String(t.id).endsWith('-inc')) return;

        const amount = safeParseFloat(t.amount);

        if (t.debitAccount && t.creditAccount) {
            const drCode = String(t.debitAccount.code || '');
            const crCode = String(t.creditAccount.code || '');
            const drPrefix = drCode.charAt(0);
            const crPrefix = crCode.charAt(0);

            if (crPrefix === '4') totalIncomes += amount;
            if (['5', '6', '7'].includes(drPrefix)) totalExpenses += amount;
            return;
        }

        const accountObj = allAccounts.find(a => a.name === t.category);
        let prefix = '0';
        if (accountObj) {
            prefix = String(accountObj.number).charAt(0);
        } else if (t.category === 'Transferencia Interna') {
            prefix = '0';
        } else {
            prefix = t.type === 'income' ? '4' : '5';
        }

        if (!t.isInternalTransfer) {
            if (prefix === '4') {
                if (t.type === 'income') totalIncomes += amount;
                else totalExpenses += amount;
            } else if (['5', '6', '7'].includes(prefix)) {
                totalExpenses += amount;
            }
        }
    });

    const cajaGeneralExacta = cajaPrincipalBalance + customCashBalance + totalBankBalances + totalInvestmentBalances;

    setStats({
      generalBalance: totalAssets,
      totalIncome: totalIncomes,
      totalExpenses: totalExpenses,
      cashBalance: cajaGeneralExacta, 
    });

    const monthlyData = generateMonthlyData(transactionsInPeriod, dateRange.from, dateRange.to, allAccounts);
    setChartData(monthlyData);

    const categories = generateCategoryData(transactionsInPeriod, allAccounts);
    setCategoryData(categories);
  }, [transactionsData, initialBalanceData, bankAccountsData, cashAccountsData, fixedAssetsData, realEstatesData, accountsReceivableData, accountsData, inventoryData, dateRange, isConsolidated, selectedYear, filterByCompany]);

  const generateMonthlyData = (transactions, startDate, endDate, allAccounts) => {
    if (!startDate || !endDate) return [];
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    
    let monthsInInterval = [];
    try {
        monthsInInterval = eachMonthOfInterval({ start, end });
    } catch (e) { return []; }
    
    const months = monthsInInterval.map(monthStart => ({ name: format(monthStart, 'MMM yyyy'), ingresos: 0, gastos: 0 }));

    transactions.forEach(t => {
      const transactionDate = parseAccountingDate(t.date);

      if (transactionDate >= start && transactionDate <= end) {
        const monthName = format(startOfMonth(transactionDate), 'MMM yyyy');
        const monthData = months.find(m => m.name === monthName);
        if (monthData) {
            const amount = parseFloat(t.amount);
            if (isNaN(amount)) return;

            if (t.debitAccount && t.creditAccount) {
                if (String(t.id).endsWith('-inc')) return;
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                if (crCode.charAt(0) === '4') monthData.ingresos += amount;
                if (['5', '6', '7'].includes(drCode.charAt(0))) monthData.gastos += amount;
                return;
            }

            const accountObj = allAccounts.find(a => a.name === t.category);
            let prefix = '0';
            if (accountObj) {
                prefix = String(accountObj.number).charAt(0);
            } else if (t.category === 'Transferencia Interna') {
                prefix = '0';
            } else {
                prefix = t.type === 'income' ? '4' : '5';
            }

            if (!t.isInternalTransfer) {
                if (prefix === '4') {
                    if (t.type === 'income') monthData.ingresos += amount;
                    else monthData.gastos += amount;
                } else if (['5', '6', '7'].includes(prefix)) {
                    monthData.gastos += amount;
                }
            }
        }
      }
    });
    return months;
  };

  const generateCategoryData = (transactions, allAccounts) => {
    const categoryTotals = {};

    transactions.forEach(t => {
        const amount = parseFloat(t.amount);
        if (isNaN(amount)) return;

        if (t.debitAccount && t.creditAccount) {
            if (String(t.id).endsWith('-inc')) return;
            const drCode = String(t.debitAccount.code || '');
            if (['5', '6', '7'].includes(drCode.charAt(0))) {
                const catName = t.debitAccount.name || 'Sin Categoría';
                categoryTotals[catName] = (categoryTotals[catName] || 0) + amount;
            }
            return;
        }

        const accountObj = allAccounts.find(a => a.name === t.category);
        let prefix = '0';
        if (accountObj) {
            prefix = String(accountObj.number).charAt(0);
        } else if (t.category === 'Transferencia Interna') {
            prefix = '0';
        } else {
            prefix = t.type === 'income' ? '4' : '5';
        }

        if (!t.isInternalTransfer && t.type === 'expense') {
            if (['5', '6', '7'].includes(prefix) || (prefix === '4' && t.type === 'expense')) {
                 const catName = t.category || 'Sin Categoría';
                 categoryTotals[catName] = (categoryTotals[catName] || 0) + amount;
            }
        }
    });

    const totalExpenses = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

    return Object.entries(categoryTotals).map(([name, value], index) => ({
      name, 
      value, 
      percentage: totalExpenses > 0 ? (value / totalExpenses) * 100 : 0,
      color: COLORS[index % COLORS.length]
    })).sort((a,b) => b.value - a.value);
  };

  return (
    <>
      <Helmet>
        <title>Dashboard · HERTUR Contabilidad</title>
      </Helmet>

      <div className="space-y-6 lg:space-y-7">
        <DashboardHero
          activeCompany={activeCompany}
          selectedYear={selectedYear}
          availableYears={availableYears}
          onYearChange={handleYearChange}
          hasSubCompanies={hasSubCompanies}
          isConsolidated={isConsolidated}
          onToggleConsolidation={toggleConsolidation}
          stats={stats}
          periodLabel={format(dateRange.from, 'dd/MM/yyyy') + ' – ' + format(dateRange.to, 'dd/MM/yyyy')}
          cutoffLabel={format(parseAccountingDate(selectedCutoffDate), 'dd/MM/yyyy')}
          onNewTransaction={() => navigate('/transactions')}
          onReports={() => navigate('/reports')}
        />
        {isConsolidated && (
            <div className="flex items-center gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/70 px-4 py-3 text-sm text-violet-800 shadow-sm">
                <Info className="w-5 h-5 flex-shrink-0" />
                Estás viendo la información combinada de toda la estructura vinculada. La Vista Consolidada es de solo lectura; para registrar, editar o cerrar períodos debes volver a Vista Individual.
            </div>
        )}

        <ContractTaxAlert />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Activos" value={`$${stats.generalBalance.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} trend="static" color="blue" tooltip="Activos corrientes y no corrientes al corte seleccionado" caption={`Corte: ${selectedCutoffDate}`} />
          <StatCard title="Ingresos (P&L)" value={`$${stats.totalIncome.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} trend="static" color="green" tooltip="Ingresos de cuentas clase 4 en el rango seleccionado" caption={`${format(dateRange.from, 'dd/MM/yyyy')} – ${format(dateRange.to, 'dd/MM/yyyy')}`} />
          <StatCard title="Costos y Gastos (P&L)" value={`$${stats.totalExpenses.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} trend="static" color="red" tooltip="Costos y gastos de cuentas clases 5, 6 y 7 en el rango seleccionado" caption={`${format(dateRange.from, 'dd/MM/yyyy')} – ${format(dateRange.to, 'dd/MM/yyyy')}`} />
          <StatCard title="Liquidez Total" value={`$${stats.cashBalance.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={PiggyBank} trend="static" color="purple" tooltip="Caja principal + cajas auxiliares + bancos + aportes/inversiones" caption={`Corte: ${selectedCutoffDate}`} />
        </div>

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.12 }} className="hertur-surface w-full rounded-3xl border border-slate-200/80 p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  Ingresos vs Gastos <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">P&L</span>
              </h3>
              <div className="grid w-full grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 sm:grid-cols-2 lg:w-auto">
                <div className="flex items-center gap-2">
                  <Label htmlFor="startDate" className="text-xs font-medium text-slate-500 uppercase">Desde</Label>
                  <input type="date" id="startDate" max={todayDateKey} value={format(dateRange.from, 'yyyy-MM-dd')} onChange={(e) => handleDateRangeChange(e, 'from')} className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100/60" />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="endDate" className="text-xs font-medium text-slate-500 uppercase">Hasta</Label>
                  <input type="date" id="endDate" max={todayDateKey} value={format(dateRange.to, 'yyyy-MM-dd')} onChange={(e) => handleDateRangeChange(e, 'to')} className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100/60" />
                </div>
              </div>
            </div>
            <div className="h-[300px] w-full sm:h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize: 12}} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`} tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => `$${value.toLocaleString('es-ES')}`} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                    <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" strokeWidth={3} dot={{ fill: '#ef4444', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
                </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.18 }} className="hertur-surface flex h-full w-full flex-col rounded-3xl border border-slate-200/80 p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] sm:p-6">
            <h3 className="text-xl font-semibold text-slate-900 mb-4">Gastos por Categoría</h3>
            {categoryData.length > 0 ? (
                <div className="flex flex-col flex-1 min-h-[350px]">
                    <div className="flex-1 w-full relative min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `$${value.toLocaleString('es-ES')}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xs text-slate-400 font-medium uppercase">Total</span>
                            <span className="text-lg font-bold text-slate-700">${stats.totalExpenses.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                    <div className="mt-4 flex-1 overflow-y-auto max-h-[200px] pr-2 space-y-3 custom-scrollbar border-t border-slate-100 pt-4">
                        {categoryData.map((item, index) => (
                            <div key={index} className="flex items-center justify-between text-sm group hover:bg-slate-50 p-1.5 rounded-md transition-colors">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                                    <span className="text-slate-600 truncate font-medium" title={item.name}>{item.name}</span>
                                </div>
                                <div className="flex flex-col items-end ml-2">
                                    <span className="font-semibold text-slate-800">${item.value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
                                    <span className="text-[10px] text-slate-400">{item.percentage.toFixed(1)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <PiggyBank className="w-12 h-12 mb-2 opacity-20"/>
                    <p>No hay gastos registrados</p>
                </div>
            )}
          </motion.div>
        </div>

        <RecentTransactions />
      </div>
    </>
  );
};

export default Dashboard;
