import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext'; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';

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

  const [reportData, setReportData] = useState({ incomeStatement: [], balanceSheet: { assets: [], liabilities: [], equity: [], totals: {} }, summary: { totalIncome: 0, totalExpenses: 0, netProfit: 0, profitMargin: 0 } });
  const { toast } = useToast();

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

    // ============================================================================
    // 🚀 SOLUCIÓN DE DUPLICIDAD: Unificamos el catálogo de cuentas (PUC)
    // Si la Capilla y Parroquia tienen cuentas con el mismo nombre, las fusionamos 
    // para evitar que se repitan en el Estado de Resultados al consolidar.
    // ============================================================================
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

    // ============================================================================
    // 🚀 ESTADO DE RESULTADOS (P&L) CON REGLAS DE PREFIJO PUC ESTRICTAS Y DEVOLUCIONES
    // ============================================================================
    const getAccountPrefix = (categoryName) => {
        const account = allAccounts.find(a => a.name === categoryName);
        return account ? String(account.number).charAt(0) : null;
    };

    // Ingresos (4): Suman con income, RESTAN con expense (devoluciones)
    const totalIncome = pnlTransactions.reduce((sum, t) => {
        if (t.isInternalTransfer || (t.debitAccount && t.creditAccount)) return sum;
        if (getAccountPrefix(t.category) === '4') {
            return sum + (t.type === 'income' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount));
        }
        return sum;
    }, 0);

    // Costos (6, 7): Suman con expense, RESTAN con income (anulaciones)
    const totalCosts = pnlTransactions.reduce((sum, t) => {
        if (t.isInternalTransfer || (t.debitAccount && t.creditAccount)) return sum;
        if (['6', '7'].includes(getAccountPrefix(t.category))) {
            return sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount));
        }
        return sum;
    }, 0);

    // Gastos (5): Suman con expense, RESTAN con income (reembolsos)
    const totalExpenses = pnlTransactions.reduce((sum, t) => {
        if (t.isInternalTransfer || t.isFixedAsset || t.isPurchase || (t.debitAccount && t.creditAccount)) return sum;
        if (getAccountPrefix(t.category) === '5') {
            return sum + (t.type === 'expense' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount));
        }
        return sum;
    }, 0);

    const netProfit = totalIncome - totalCosts - totalExpenses;
    const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0;
    const summaryData = { totalIncome, totalExpenses: (totalCosts + totalExpenses), netProfit, profitMargin };
    
    // Desglose individual de cada categoría
    const calculateTotalForCategory = (categoryName, classPrefix) => pnlTransactions.reduce((sum, t) => {
        if (t.category !== categoryName || t.isFixedAsset || t.isInternalTransfer || t.isPurchase || (t.debitAccount && t.creditAccount)) return sum;
        const amount = safeParseFloat(t.amount);
        if (classPrefix === '4') return sum + (t.type === 'income' ? amount : -amount);
        if (['5', '6', '7'].includes(classPrefix)) return sum + (t.type === 'expense' ? amount : -amount);
        return sum;
    }, 0);

    const incomeAccounts = allAccounts.filter(a => String(a.number).startsWith('4'));
    const expenseAccounts = allAccounts.filter(a => String(a.number).startsWith('5'));
    const costAccounts = allAccounts.filter(a => String(a.number).startsWith('6') || String(a.number).startsWith('7'));

    const grossProfit = totalIncome - totalCosts;

    const incomeStatement = [
        { item: 'INGRESOS OPERACIONALES', isBold: true },
        ...incomeAccounts.map(acc => ({ item: `  ${acc.name}`, amount: calculateTotalForCategory(acc.name, '4') })).filter(i => i.amount !== 0),
        { item: 'Total Ingresos', amount: totalIncome, isSubtotal: true, isTopBorder: true },
        
        { item: 'COSTOS DE VENTA', isBold: true },
        ...costAccounts.map(acc => ({ item: `  ${acc.name}`, amount: -Math.abs(calculateTotalForCategory(acc.name, '6')) })).filter(i => i.amount !== 0),
        { item: 'Total Costos', amount: -totalCosts, isSubtotal: true, isTopBorder: true },
        
        { item: 'UTILIDAD BRUTA', amount: grossProfit, isBold: true, isTopBorder: true },
        
        { item: 'GASTOS OPERACIONALES', isBold: true },
        ...expenseAccounts.map(acc => ({ item: `  ${acc.name}`, amount: -Math.abs(calculateTotalForCategory(acc.name, '5')) })).filter(i => i.amount !== 0),
        { item: 'Total Gastos', amount: -totalExpenses, isSubtotal: true, isTopBorder: true },
        
        { item: 'UTILIDAD NETA (Estado de Resultados)', amount: netProfit, isBold: true, isTotal: true },
    ];
    
    // ============================================================================
    // --- BALANCE SHEET CALCULATIONS ---
    // ============================================================================

    const isAccountMatch = (targetId, accountIdOrString) => {
        if (!accountIdOrString) return false;
        if (accountIdOrString === targetId) return true;
        if (accountIdOrString.startsWith(`${targetId}|`)) return true;
        if (targetId === 'caja_principal' && accountIdOrString.toLowerCase().includes('caja principal')) return true;
        return false;
    };

    // 1. Caja Principal
    const initialCash = fInitialBalance.reduce((sum, item) => {
        if (!item.date || getSafeYear(item.date) <= parseInt(currentYear)) {
            return sum + safeParseFloat(item.balance);
        }
        return sum;
    }, 0);
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
            if (!cashAcc.date || getSafeYear(cashAcc.date) <= parseInt(currentYear)) {
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

    // 3. Bank Accounts
    let totalBankBalances = 0, totalInvestmentBalances = 0;
    fBankAccounts.forEach(acc => {
        let currentBankBalance = 0, currentInvestmentBalance = 0;
        if (!acc.date || getSafeYear(acc.date) <= parseInt(currentYear)) {
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
        return !originalAcc?.date || getSafeYear(originalAcc.date) <= parseInt(currentYear);
    });

    // 4. Activos y Pasivos
    let anticiposValue = 0, construccionesValue = 0, otherAssetsValue = 0, otherLiabilitiesValue = 0;

    bsTransactions.forEach(t => {
        // Obtenemos la cuenta asociada a la categoría o destino
        const acc = allAccounts.find(a => a.name === t.category);
        if (!acc) return;
        const num = String(acc.number);

        const amount = safeParseFloat(t.amount);

        // Impacto según la naturaleza de la transacción
        // Si es gasto o transferencia de salida resta/suma según corresponda, 
        // pero para cuentas de Activo (1) y Pasivo (2), evaluamos su clase y tipo:
        let impact = 0;
        if (num.startsWith('1')) {
            // En activo: Ingresos/Débitos suman, Gastos/Créditos restan (o viceversa según el tipo)
            impact = (t.type === 'income' || t.type === 'transfer') ? amount : -amount;
        } else if (num.startsWith('2')) {
            // En pasivo: Ingresos/Créditos suman, Egresos/Débitos restan
            impact = (t.type === 'income' || t.type === 'transfer') ? amount : -amount;
        }

        // Caso especial para los cruces contables internos (Amortizaciones T-0004, T-0006, T-0008)
        // Como el cruce genera un par (expense/income), la transacción de tipo 'expense' 
        // con cuenta 1508 está sumando al activo, y la de tipo 'income' con cuenta 1330 está restando al anticipo.
        if (t.isInternalTransfer) {
            if (t.type === 'expense') {
                if (num.startsWith('1330')) anticiposValue -= amount;
                else if (num.startsWith('1508')) construccionesValue += amount;
            } else if (t.type === 'income') {
                if (num.startsWith('1330')) anticiposValue -= amount;
                else if (num.startsWith('1508')) construccionesValue += amount;
            }
            return;
        }

        // Flujo normal para transacciones estándar
        const assetImpact = t.type === 'expense' ? amount : -amount;
        const liabilityImpact = t.type === 'income' ? amount : -amount;

        if (num.startsWith('1330')) anticiposValue += assetImpact;
        else if (num.startsWith('1508')) construccionesValue += assetImpact;
        else if (num.startsWith('1') && !num.startsWith('11') && !num.startsWith('1305') && !num.startsWith('14') && !num.startsWith('15')) {
            otherAssetsValue += assetImpact;
        }
        else if (num.startsWith('2') && !num.startsWith('2305')) {
            otherLiabilitiesValue += liabilityImpact;
        }
    });

    const inventoryValue = fInventory.reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
    const manualFixedAssetsValue = fFixedAssets.filter(asset => {
        if (asset.year) return parseInt(asset.year) <= parseInt(currentYear);
        if (asset.date) return getSafeYear(asset.date) <= parseInt(currentYear);
        return false;
    }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
    
    const realEstatesValue = fRealEstates.filter(estate => getSafeYear(estate.date) <= parseInt(currentYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);
    const totalFixedAssetsValue = manualFixedAssetsValue + realEstatesValue + inventoryValue + anticiposValue + construccionesValue + otherAssetsValue;

    const accountsReceivableValue = fAccountsReceivable.filter(r => {
        const rYear = r.date ? getSafeYear(r.date) : (r.year ? parseInt(r.year) : parseInt(currentYear));
        return r.status === 'Pendiente' && rYear <= parseInt(currentYear);
    }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);

    const accountsPayableValue = fAccountsPayable.filter(p => {
        const pYear = p.date ? getSafeYear(p.date) : (p.year ? parseInt(p.year) : parseInt(currentYear));
        return p.status === 'Pendiente' && pYear <= parseInt(currentYear);
    }).reduce((sum, p) => sum + safeParseFloat(p.amount), 0);

    const assets = [
        { item: 'Activo Corriente', isBold: true },
        { item: '  Efectivo y Equivalentes', isSubtotal: true },
        { item: '    Caja General', amount: cajaGeneralValue, isBold: true },
        { item: '      Caja Principal', amount: cajaPrincipalBalance },
        ...dynamicCashAccounts.map(acc => ({ item: `      ${acc.name}`, amount: acc.balance })),
        { item: '      Cuentas Bancarias', amount: totalBankBalances },
        { item: '      Aportes Ordinarios', amount: totalInvestmentBalances },
        { item: '  Cuentas por Cobrar', amount: accountsReceivableValue },
        { item: '  Anticipos a Proveedores', amount: anticiposValue }, 
        { item: '  Otros Activos Corrientes', amount: otherAssetsValue }, 
        { item: 'Activo No Corriente', isBold: true },
        { item: '  Construcciones en Curso', amount: construccionesValue }, 
        { item: '  Activos Fijos (Incl. Inventario)', amount: totalFixedAssetsValue },
    ];
    
    const liabilities = [ { item: 'Pasivo', isBold: true }, { item: '  Cuentas por Pagar', amount: accountsPayableValue }, { item: '  Otros Pasivos (Fondos de Terceros)', amount: otherLiabilitiesValue }, ];
    
    const totalAssets = cajaGeneralValue + accountsReceivableValue + totalFixedAssetsValue; 
    const totalLiabilities = accountsPayableValue + otherLiabilitiesValue;
    const totalEquity = totalAssets - totalLiabilities; 
    
    const retainedEquity = totalEquity - netProfit;

    const equity = [ 
      { item: 'Patrimonio', isBold: true }, 
      { item: '  Capital Social (Inc. Utilidades Acum.)', amount: retainedEquity }, 
      { item: '  Utilidad del Ejercicio', amount: netProfit }
    ];

    const balanceSheet = { assets: assets.filter(a => a.amount != null || a.isBold || a.isSubtotal), liabilities: liabilities.filter(l => l.amount != null || l.isBold), equity: equity.filter(e => e.amount != null || e.isBold), totals: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity, liabilitiesAndEquity: totalLiabilities + totalEquity } };
    setReportData({ summary: summaryData, incomeStatement, balanceSheet });
  };
  
  // 🚀 EXPORTACIÓN SERIA Y PROFESIONAL DEL ESTADO DE RESULTADOS
  const handleExportReport = (data, name) => { 
      const companyName = activeCompany?.name || 'PARROQUIA PADRE MISERICORDIOSO';
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

      data.forEach(row => {
          dataToExport.push({
              'Concepto': row.item.trim(),
              'Monto': row.amount != null ? row.amount : ''
          });
      });

      exportToExcel(dataToExport, `Estado_de_Resultados_${selectedYear}`); 
      toast({ title: 'Exportado a Excel', description: 'El Estado de Resultados se ha exportado exitosamente con la estructura formal.' }); 
  };

  // 🚀 EXPORTACIÓN SERIA Y PROFESIONAL DEL BALANCE GENERAL
  const handleExportBalanceSheet = () => { 
      const { assets, liabilities, equity, totals } = reportData.balanceSheet; 
      const companyName = activeCompany?.name || 'PARROQUIA PADRE MISERICORDIOSO';
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

      assets.forEach(a => {
          dataToExport.push({
              'Concepto': a.item.trim(),
              'Monto': a.amount != null ? a.amount : ''
          });
      });
      dataToExport.push({ 'Concepto': 'TOTAL ACTIVOS', 'Monto': totals.assets });
      dataToExport.push({ 'Concepto': '', 'Monto': '' });

      liabilities.forEach(l => {
          dataToExport.push({
              'Concepto': l.item.trim(),
              'Monto': l.amount != null ? l.amount : ''
          });
      });
      dataToExport.push({ 'Concepto': 'TOTAL PASIVOS', 'Monto': totals.liabilities });
      dataToExport.push({ 'Concepto': '', 'Monto': '' });

      equity.forEach(e => {
          dataToExport.push({
              'Concepto': e.item.trim(),
              'Monto': e.amount != null ? e.amount : ''
          });
      });
      dataToExport.push({ 'Concepto': 'TOTAL PATRIMONIO', 'Monto': totals.equity });
      dataToExport.push({ 'Concepto': '', 'Monto': '' });
      dataToExport.push({ 'Concepto': 'TOTAL PASIVO + PATRIMONIO', 'Monto': totals.liabilitiesAndEquity });

      exportToExcel(dataToExport, `Balance_General_${selectedYear}`); 
      toast({ title: 'Exportado a Excel', description: 'El Balance General se ha exportado exitosamente con la estructura formal.' });
  };

  const renderSheetTable = (items) => (items.map((item, index) => (<tr key={index} className={`border-b last:border-none ${item.isTopBorder ? 'border-t-2 border-slate-300' : ''} ${item.isSubtotal ? 'bg-slate-50' : ''}`}><td className={`py-2 ${item.isBold ? 'font-bold text-slate-800' : 'text-slate-600'} ${item.isSubtotal ? 'font-semibold' : ''}`} style={{ paddingLeft: item.item.search(/\S/) * 4 }}>{item.item.trim()}</td><td className={`py-2 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.isSubtotal ? 'font-semibold' : ''}`}>{item.amount != null ? `$${item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : ''}</td></tr>)));

  return (
    <>
      <Helmet><title>Reportes - JaiderHerTur26</title></Helmet>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between md:items-center gap-4"><h1 className="text-4xl font-bold text-slate-900 mb-2">Reportes Financieros</h1><div className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-slate-500" /><Label htmlFor="year-select" className="font-medium">Año Fiscal:</Label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger id="year-select" className="w-[120px] bg-white"><SelectValue placeholder="Año" /></SelectTrigger><SelectContent>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent></Select></div></motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><div className="bg-green-100 p-6 rounded-lg border border-green-200"><p className="text-sm text-green-800">Ingresos Operacionales (P&L)</p><p className="text-2xl font-bold text-green-900">${reportData.summary.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p></div><div className="bg-red-100 p-6 rounded-lg border border-red-200"><p className="text-sm text-red-800">Costos y Gastos (P&L)</p><p className="text-2xl font-bold text-red-900">${reportData.summary.totalExpenses.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p></div><div className="bg-blue-100 p-6 rounded-lg border border-blue-200"><p className="text-sm text-blue-800">Utilidad Neta</p><p className="text-2xl font-bold text-blue-900">${reportData.summary.netProfit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p></div><div className="bg-purple-100 p-6 rounded-lg border border-purple-200"><p className="text-sm text-purple-800">Margen de Ganancia</p><p className="text-2xl font-bold text-purple-900">{reportData.summary.profitMargin}%</p></div></div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}><div className="bg-white rounded-xl shadow-lg border"><div className="flex justify-between items-center p-6 border-b"><h2 className="text-xl font-bold text-slate-900">Balance General</h2><Button onClick={handleExportBalanceSheet} variant="outline"><Download className="w-4 h-4 mr-2" /> Exportar</Button></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8"><div><h3 className="text-lg font-semibold mb-2 text-blue-700">Activos</h3><table className="w-full"><tbody>{renderSheetTable(reportData.balanceSheet.assets)}</tbody></table><table className="w-full mt-2"><tbody><tr className="border-t-2 border-slate-900"><td className="py-2 font-bold">Total Activos</td><td className="py-2 text-right font-mono font-bold">${reportData.balanceSheet.totals.assets?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr></tbody></table></div><div><h3 className="text-lg font-semibold mb-2 text-blue-700">Pasivos y Patrimonio</h3><table className="w-full"><tbody>{renderSheetTable(reportData.balanceSheet.liabilities)}</tbody></table><table className="w-full mt-2"><tbody>{renderSheetTable(reportData.balanceSheet.equity)}</tbody></table><table className="w-full mt-2"><tbody><tr className="border-t-2 border-slate-900"><td className="py-2 font-bold">Total Pasivo + Patrimonio</td><td className="py-2 text-right font-mono font-bold">${reportData.balanceSheet.totals.liabilitiesAndEquity?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr></tbody></table></div></div><div className={`p-4 text-center border-t text-sm font-semibold ${Math.abs(reportData.balanceSheet.totals.assets - reportData.balanceSheet.totals.liabilitiesAndEquity) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{Math.abs(reportData.balanceSheet.totals.assets - reportData.balanceSheet.totals.liabilitiesAndEquity) < 0.01 ? '¡El balance está cuadrado!' : 'El balance no está cuadrado'}</div></div></motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}><div className="bg-white rounded-xl shadow-lg border"><div className="flex justify-between items-center p-6 border-b"><h2 className="text-xl font-bold text-slate-900">Estado de Resultados</h2><Button onClick={() => handleExportReport(reportData.incomeStatement, 'Estado_de_Resultados')} variant="outline"><Download className="w-4 h-4 mr-2" /> Exportar</Button></div><div className="p-6"><table className="w-full"><tbody>{reportData.incomeStatement.map((item, index) => (<tr key={index} className={`border-b last:border-none ${item.isTotal ? 'bg-blue-100/50' : ''} ${item.isSubtotal ? 'bg-slate-50' : ''} ${item.isTopBorder ? 'border-t-2 border-slate-300' : ''}`}><td className={`py-3 ${item.isBold ? 'font-bold text-slate-900' : 'text-slate-600'} pl-${item.item.search(/\S/) * 2}`}>{item.item.trim()}</td><td className={`py-3 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>{item.amount != null ? `$${item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : ''}</td></tr>))}</tbody></table></div></div></motion.div>
      </div>
    </>
  );
};

export default Reports;