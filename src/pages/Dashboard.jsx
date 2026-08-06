import React, { useState, useEffect, useMemo } from 'react';
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

  const currentId = String(activeCompany?.id || '').trim();
  const hasSubCompanies = companies.some(c => {
      const pId = String(c.parentId || c.parent_id || '').trim();
      return pId === currentId && pId !== '';
  });

  // 🚀 HELPER SEGURO DE FECHAS
  const getSafeYear = (dateStr) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'string' && dateStr.includes('-')) {
          return parseInt(dateStr.split('-')[0], 10);
      }
      return new Date(dateStr).getFullYear();
  };

  // 🚀 FILTRO MAESTRO DE CONSOLIDACIÓN
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
      const validTransactions = filterByCompany(transactionsData || []).filter(t => 
        !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
      );
      const years = new Set(validTransactions.map(t => getSafeYear(t.date)));
      const current = new Date().getFullYear();
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

    const pickerStart = startOfDay(dateRange.from);
    const pickerEnd = endOfDay(dateRange.to);

    const transactionsInPeriod = validTransactions.filter(t => {
        if (!t.date) return false;
        const tDate = new Date(t.date);
        const comparisonDate = new Date(tDate.getUTCFullYear(), tDate.getUTCMonth(), tDate.getUTCDate());
        return comparisonDate >= pickerStart && comparisonDate <= pickerEnd;
    });

    const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(selectedYear));

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

    // 1. Caja Principal
    const initialCash = fInitialBalance.filter(item => !item.date || getSafeYear(item.date) <= parseInt(selectedYear)).reduce((sum, item) => sum + safeParseFloat(item.balance), 0);
    let cashIncomes = 0, cashExpenses = 0;
    
    bsTransactions.forEach(t => {
        const amount = safeParseFloat(t.amount);
        
        if (t.debitAccount && t.creditAccount) {
            const drCode = t.debitAccount.code;
            const crCode = t.creditAccount.code;
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

    // 2. Custom Cash Accounts
    let customCashBalance = 0;
    if (fCashAccounts.length > 0) {
        customCashBalance = fCashAccounts.reduce((acc, cashAcc) => {
            let currentBal = 0;
            if (!cashAcc.date || getSafeYear(cashAcc.date) <= parseInt(selectedYear)) {
                currentBal = safeParseFloat(cashAcc.initial_balance);
            }
            bsTransactions.forEach(t => {
                const amount = safeParseFloat(t.amount);
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

    // 3. Bank Accounts
    let totalBankBalances = 0, totalInvestmentBalances = 0;
    fBankAccounts.forEach(acc => {
        let currentBankBalance = 0;
        let currentInvestmentBalance = 0;
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

    const cajaGeneralTotal = cajaPrincipalBalance + customCashBalance + totalBankBalances + totalInvestmentBalances;
    
    // --- ASSETS (ACTIVOS UNIFICADOS) ---
    const inventoryValue = fInventory.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
    
    // Clonamos exactamente el filtro condicional del módulo Reports.jsx
    const manualFixedAssetsValue = fFixedAssets.filter(asset => {
        if (asset.status === 'Dado de Baja') return false; 
        const assetYear = asset.date ? getSafeYear(asset.date) : (asset.year ? parseInt(asset.year) : 0);
        return assetYear === parseInt(selectedYear);
    }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
    
    const realEstatesValue = fRealEstates.filter(estate => getSafeYear(estate.date) <= parseInt(selectedYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);
    
    const accountsReceivableValue = fAccountsReceivable.filter(r => {
        const rYear = r.date ? getSafeYear(r.date) : (r.year ? parseInt(r.year) : parseInt(selectedYear));
        return r.status === 'Pendiente' && rYear <= parseInt(selectedYear);
    }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);
    
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

    depreciacionAcumuladaValue = -Math.abs(totalDepreciacionInventario + depreciacionPropiedadesGlobal);

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

    setStats({
      generalBalance: totalAssets,
      totalIncome: totalIncomes,
      totalExpenses: totalExpenses,
      cashBalance: cajaGeneralTotal, 
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
      const tDate = new Date(t.date);
      const transactionDate = new Date(tDate.getUTCFullYear(), tDate.getUTCMonth(), tDate.getUTCDate());

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
          <StatCard title="Total Activos (Patrimonio)" value={`$${stats.generalBalance.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} trend={stats.generalBalance >= 0 ? 'up' : 'down'} color="blue" tooltip="Caja + Cuentas Cobrar + Activos Fijos + Inventario + Construcciones" />
          <StatCard title="Ingresos (P&L)" value={`$${stats.totalIncome.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} trend="up" color="green" tooltip="Cuentas Clase 4" />
          <StatCard title="Costos y Gastos (P&L)" value={`$${stats.totalExpenses.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingDown} trend="down" color="red" tooltip="Cuentas Clases 5, 6 y 7" />
          <StatCard title="Caja Total (Disponible)" value={`$${stats.cashBalance.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={PiggyBank} trend="static" color="purple" tooltip={`Saldo real acumulado al ${selectedYear}`} />
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