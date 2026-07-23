import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Building, Building2, Info, Calendar } from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import StatCard from '@/components/dashboard/StatCard';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { format, startOfMonth, subMonths, eachMonthOfInterval, startOfDay, endOfDay, startOfYear, endOfYear, isBefore, isAfter, isWithinInterval } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Dashboard = () => {
  const { activeCompany, companies, isConsolidated, toggleConsolidation } = useCompany();
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
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear().toString()]);

  // Configuración inicial de fechas
  const [dateRange, setDateRange] = useState({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#ec4899', '#14b8a6'];

  const areAllDataLoaded = () => {
    return isTransactionsLoaded && isInitialBalanceLoaded && isBankAccountsLoaded && isFixedAssetsLoaded && isRealEstatesLoaded && isARLoaded && isAccountsLoaded && isCashAccountsLoaded && isInventoryLoaded;
  };

  const handleDateRangeChange = (e, field) => {
    const newDate = new Date(e.target.value);
    const adjustedDate = new Date(newDate.getTime() + newDate.getTimezoneOffset() * 60000);
    setDateRange(prev => ({ ...prev, [field]: adjustedDate }));
  };

  const handleYearChange = (year) => {
    setSelectedYear(year);
    const date = new Date(parseInt(year), 0, 1);

    setDateRange({
      from: startOfYear(date),
      to: endOfYear(date),
    });
  };

  // DETECTOR DE CAPILLAS BLINDADO
  const currentId = String(activeCompany?.id || '').trim();
  const hasSubCompanies = companies.some(c => {
      const pId = String(c.parentId || c.parent_id || '').trim();
      return pId === currentId && pId !== '';
  });

  // Filtro centralizado para Inversiones / Activos
  const isInvestmentCategory = (cat) => {
    const category = (cat || '').toUpperCase();
    return category.includes('CONSTRUCCIONES') || category.includes('ANTICIPOS');
  };

  useEffect(() => {
    if (!areAllDataLoaded()) return;

    const safeParseFloat = (value) => {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    const allTransactions = transactionsData || [];
    const INVALID_STATUSES = ['eliminado', 'anulado', 'cancelado', 'borrador'];

    // 1. Filter out invalid transactions immediately
    const validTransactions = allTransactions.filter(t =>
      !INVALID_STATUSES.includes(t.status?.toLowerCase())
    );

    const transactionYears = new Set();
    const currentSystemYear = new Date().getFullYear();
    transactionYears.add(currentSystemYear);

    validTransactions.forEach(t => {
      if (t.date) {
        const year = new Date(t.date).getFullYear();
        if (!isNaN(year)) {
          transactionYears.add(year);
        }
      }
    });

    const sortedYears = Array.from(transactionYears).sort((a, b) => b - a).map(String);
    setAvailableYears(prev => JSON.stringify(prev) !== JSON.stringify(sortedYears) ? sortedYears : prev);

    // --- DATE BOUNDARIES ---
    const pickerStart = startOfDay(dateRange.from);
    const pickerEnd = endOfDay(dateRange.to);

    const transactionsInPeriod = validTransactions.filter(t => {
      if (!t.date) return false;
      const tDate = new Date(t.date);
      const comparisonDate = new Date(tDate.getUTCFullYear(), tDate.getUTCMonth(), tDate.getUTCDate());
      return comparisonDate >= pickerStart && comparisonDate <= pickerEnd;
    });

    const bsTransactions = validTransactions.filter(t => new Date(t.date).getFullYear() <= parseInt(selectedYear));

    // --- HELPER: Account Prefixes ---
    const allAccounts = accountsData || [];
    const getAccountPrefix = (categoryName) => {
      const account = allAccounts.find(a => a.name === categoryName);
      return account ? account.number.charAt(0) : null;
    };

    // --- CASH BALANCE CALCULATION ---
    // 1. Identify Cash Accounts
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

    // 2. Calculate Caja Principal Balance
    const initialCash = (initialBalanceData || []).reduce((sum, item) => sum + safeParseFloat(item.balance), 0);
    let cashIncomes = 0, cashExpenses = 0;

    bsTransactions.forEach(t => {
      const amount = safeParseFloat(t.amount);

      // Check Explicit Accounting (Store Transactions)
      if (t.debitAccount && t.creditAccount) {
        const drCode = t.debitAccount.code;
        const crCode = t.creditAccount.code;
        const drName = t.debitAccount.name ? t.debitAccount.name.toUpperCase() : '';
        const crName = t.creditAccount.name ? t.creditAccount.name.toUpperCase() : '';

        // Check for Caja Principal
        if (drCode === '11050501' || drName.includes('CAJA PRINCIPAL')) {
          cashIncomes += amount;
        }
        if (crCode === '11050501' || crName.includes('CAJA PRINCIPAL')) {
          cashExpenses += amount;
        }
        return;
      }

      // Standard
      if (t.type === 'income' || t.type === 'expense') {
        if (t.destination && (cashAccountIds.has(t.destination) || t.destination.startsWith('caja_principal'))) {
          if (t.type === 'income') cashIncomes += amount; else cashExpenses += amount;
        }
      }
      // Transfers
      if (t.type === 'transfer') {
        if (t.fromAccount && (cashAccountIds.has(t.fromAccount) || t.fromAccount.startsWith('caja_principal'))) {
          cashExpenses += amount;
        }
        if (t.toAccount && (cashAccountIds.has(t.toAccount) || t.toAccount.startsWith('caja_principal'))) {
          cashIncomes += amount;
        }
      }
    });
    const cajaPrincipalBalance = initialCash + cashIncomes - cashExpenses;

    // 3. Custom Cash Accounts
    let customCashBalance = 0;
    if (cashAccountsData) {
      customCashBalance = cashAccountsData.reduce((acc, cashAcc) => {
        let currentBal = safeParseFloat(cashAcc.initial_balance);
        bsTransactions.forEach(t => {
          const amount = safeParseFloat(t.amount);
          // Standard
          if (t.type !== 'transfer' && t.destination && t.destination.startsWith(cashAcc.id)) {
            if (t.type === 'income') currentBal += amount; else if (t.type === 'expense') currentBal -= amount;
          }
          // Transfers
          if (t.type === 'transfer') {
            if (isAccountMatch(cashAcc.id, t.fromAccount)) currentBal -= amount;
            if (isAccountMatch(cashAcc.id, t.toAccount)) currentBal += amount;
          }
        });
        return acc + currentBal;
      }, 0);
    }

    // 4. Bank Accounts
    let totalBankBalances = 0, totalInvestmentBalances = 0;
    (bankAccountsData || []).forEach(acc => {
      let currentBankBalance = safeParseFloat(acc.initialBalance);
      let currentInvestmentBalance = safeParseFloat(acc.initialInvestmentBalance);
      bsTransactions.forEach(t => {
        const amount = safeParseFloat(t.amount);

        // Explicit Accounting Check (Store)
        if (t.debitAccount && t.creditAccount) {
          const drName = t.debitAccount.name || '';
          const crName = t.creditAccount.name || '';
          // Match Bank by Name
          if (drName === acc.bankName) currentBankBalance += amount;
          if (crName === acc.bankName) currentBankBalance -= amount;
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

    const cajaGeneralTotal = cajaPrincipalBalance + customCashBalance + totalBankBalances + totalInvestmentBalances;

    // --- ASSETS (ACTIVOS) ---
    // CORRECCIÓN: Ahora SÍ multiplica la Cantidad por el Costo Unitario
    const inventoryValue = (inventoryData || []).reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
    
    const manualFixedAssetsValue = (fixedAssetsData || []).filter(asset => {
        if (asset.year) {
            return asset.year.toString() === selectedYear.toString();
        }
        if (asset.date) {
            return new Date(asset.date).getFullYear().toString() === selectedYear.toString();
        }
        return false;
    }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
    
    const realEstatesValue = (realEstatesData || []).filter(estate => new Date(estate.date).getFullYear() <= parseInt(selectedYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);
    
    const accountsReceivableValue = (accountsReceivableData || []).filter(r => {
        const rYear = r.date ? new Date(r.date).getFullYear() : (r.year ? parseInt(r.year) : parseInt(selectedYear));
        return r.status === 'Pendiente' && rYear <= parseInt(selectedYear);
    }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);
    
    // Calculamos el valor de las inversiones para incluirlas en los Activos Totales
    const construccionesValue = bsTransactions
      .filter(t => (t.category || '').toUpperCase().includes('CONSTRUCCIONES'))
      .reduce((sum, t) => sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

    const anticiposValue = bsTransactions
      .filter(t => (t.category || '').toUpperCase().includes('ANTICIPOS'))
      .reduce((sum, t) => sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

    const totalAssets = cajaGeneralTotal + accountsReceivableValue + manualFixedAssetsValue + realEstatesValue + inventoryValue + construccionesValue + anticiposValue;

    // --- P&L CALCULATIONS ---
    const income = transactionsInPeriod.filter(t => {
      if (t.type !== 'income' || t.isInternalTransfer) return false;
      const prefix = getAccountPrefix(t.category);
      return prefix === '4';
    }).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

    const expenses = transactionsInPeriod.filter(t => {
      if (t.type !== 'expense' || t.isInternalTransfer || t.isFixedAsset || t.isPurchase) return false;
      const prefix = getAccountPrefix(t.category);
      // Se excluyen categorías de inversión
      return t.category !== 'Cuentas por Pagar' && prefix !== '2' && !isInvestmentCategory(t.category);
    }).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

    setStats({
      generalBalance: totalAssets,
      totalIncome: income,
      totalExpenses: expenses,
      cashBalance: cajaGeneralTotal,
    });

    const monthlyData = generateMonthlyData(transactionsInPeriod.filter(t => !t.isInternalTransfer), dateRange.from, dateRange.to, getAccountPrefix);
    setChartData(monthlyData);

    const categories = generateCategoryData(transactionsInPeriod, getAccountPrefix);
    setCategoryData(categories);
  }, [transactionsData, initialBalanceData, bankAccountsData, cashAccountsData, fixedAssetsData, realEstatesData, accountsReceivableData, accountsData, inventoryData, dateRange, isConsolidated, selectedYear]);

  const generateMonthlyData = (transactions, startDate, endDate, getAccountPrefix) => {
    if (!startDate || !endDate) return [];
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);

    let monthsInInterval = [];
    try {
      monthsInInterval = eachMonthOfInterval({ start, end });
    } catch (e) { return []; }

    const months = monthsInInterval.map(monthStart => ({ name: format(monthStart, 'MMM yyyy'), ingresos: 0, gastos: 0 }));

    transactions.forEach(t => {
      const tDate = new Date(t.date);
      const transactionDate = new Date(tDate.getUTCFullYear(), tDate.getUTCMonth(), tDate.getUTCDate());

      if (transactionDate >= start && transactionDate <= end) {
        const monthName = format(startOfMonth(transactionDate), 'MMM yyyy');
        const monthData = months.find(m => m.name === monthName);
        if (monthData) {
          const amount = parseFloat(t.amount);
          const prefix = getAccountPrefix(t.category);

          if (!isNaN(amount)) {
            if (t.type === 'income' && prefix === '4') {
              monthData.ingresos += amount;
            // Se excluyen categorías de inversión en las gráficas
            } else if (t.type === 'expense' && !t.isInternalTransfer && !t.isFixedAsset && !t.isPurchase && t.category !== 'Cuentas por Pagar' && prefix !== '2' && !isInvestmentCategory(t.category)) {
              monthData.gastos += amount;
            }
          }
        }
      }
    });
    return months;
  };

  const generateCategoryData = (transactions, getAccountPrefix) => {
    const expenseTransactions = transactions.filter(t => {
      if (t.type !== 'expense' || t.isInternalTransfer || t.isFixedAsset || t.isPurchase) return false;
      const prefix = getAccountPrefix(t.category);
      // Se excluyen categorías de inversión en las gráficas
      return t.category !== 'Cuentas por Pagar' && prefix !== '2' && !isInvestmentCategory(t.category);
    });

    const categoryTotals = expenseTransactions.reduce((acc, t) => {
      const category = t.category || 'Sin Categoría';
      const amount = parseFloat(t.amount);
      if (!isNaN(amount)) {
        if (!acc[category]) acc[category] = 0;
        acc[category] += amount;
      }
      return acc;
    }, {});

    const totalExpenses = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

    return Object.entries(categoryTotals).map(([name, value], index) => ({
      name,
      value,
      percentage: totalExpenses > 0 ? (value / totalExpenses) * 100 : 0,
      color: COLORS[index % COLORS.length]
    })).sort((a, b) => b.value - a.value);
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - JaiderHerTur26</title>
      </Helmet>

      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard</h1>
                {isConsolidated && <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded-full border border-purple-200 animate-pulse">CONSOLIDADO</span>}
              </div>
              <p className="text-slate-600">Resumen general de tu contabilidad</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <Select value={selectedYear} onValueChange={handleYearChange}>
                <SelectTrigger className="w-full sm:w-[130px] bg-white shadow-sm border-slate-200">
                  <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasSubCompanies && (
                <div className="flex items-center space-x-3 bg-white p-2.5 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                  <Switch
                    id="consolidation-mode"
                    checked={isConsolidated}
                    onCheckedChange={toggleConsolidation}
                    className="data-[state=checked]:bg-purple-600"
                  />
                  <Label htmlFor="consolidation-mode" className="cursor-pointer flex items-center gap-2">
                    {isConsolidated ? <Building2 className="w-5 h-5 text-purple-600" /> : <Building className="w-5 h-5 text-slate-400" />}
                    <div className="flex flex-col leading-tight">
                      <span className={isConsolidated ? "font-bold text-purple-700" : "font-medium text-slate-600"}>
                        {isConsolidated ? "Vista Consolidada" : "Vista Individual"}
                      </span>
                      {isConsolidated && <span className="text-[10px] text-purple-600 font-medium">Incluye sub-empresas</span>}
                    </div>
                  </Label>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {isConsolidated && (
          <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg flex gap-3 text-purple-800 text-sm items-center">
            <Info className="w-5 h-5 flex-shrink-0" />
            Estás viendo la información combinada de tu empresa y todas sus sub-empresas vinculadas. Para editar datos, se recomienda cambiar a Vista Individual.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Activos (Patrimonio)" value={`$${stats.generalBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`} icon={DollarSign} trend={stats.generalBalance >= 0 ? 'up' : 'down'} color="blue" tooltip="Caja + Cuentas Cobrar + Activos Fijos + Inventario + Construcciones" />
          <StatCard title="Ingresos (P&L)" value={`$${stats.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`} icon={TrendingUp} trend="up" color="green" tooltip="Cuenta Prefijo 4" />
          <StatCard title="Gastos (P&L)" value={`$${stats.totalExpenses.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`} icon={TrendingDown} trend="down" color="red" tooltip="Egresos (Excluye Pasivos e Inversiones)" />
          <StatCard title="Caja Total (Disponible)" value={`$${stats.cashBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`} icon={PiggyBank} trend="static" color="purple" tooltip={`Saldo real acumulado al ${selectedYear}`} />
        </div>

        <div className="grid grid-cols-1 gap-6 items-start">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 w-full">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                Ingresos vs Gastos <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">P&L</span>
              </h3>
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100 w-full lg:w-auto">
                <div className="flex items-center gap-2">
                  <Label htmlFor="startDate" className="text-xs font-medium text-slate-500 uppercase">Desde</Label>
                  <input type="date" id="startDate" value={format(dateRange.from, 'yyyy-MM-dd')} onChange={(e) => handleDateRangeChange(e, 'from')} className="text-sm border border-slate-300 rounded-md pl-2 pr-2 py-1 focus:ring-2 focus:ring-blue-500 w-32 bg-white" />
                </div>
                <div className="hidden sm:block w-px h-4 bg-slate-300"></div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="endDate" className="text-xs font-medium text-slate-500 uppercase">Hasta</Label>
                  <input type="date" id="endDate" value={format(dateRange.to, 'yyyy-MM-dd')} onChange={(e) => handleDateRangeChange(e, 'to')} className="text-sm border border-slate-300 rounded-md pl-2 pr-2 py-1 focus:ring-2 focus:ring-blue-500 w-32 bg-white" />
                </div>
              </div>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `$${value.toLocaleString('es-ES')}`} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" strokeWidth={3} dot={{ fill: '#ef4444', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 h-full w-full flex flex-col">
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
                <PiggyBank className="w-12 h-12 mb-2 opacity-20" />
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