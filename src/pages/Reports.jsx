import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getDynamicCashAccounts } from '@/lib/cashAccountUtils';

const Reports = () => {
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

  // HELPER PARA EVITAR EL BUG DE ZONA HORARIA (UTC vs Hora Colombia)
  const getSafeYear = (dateStr) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'string' && dateStr.includes('-')) {
          return parseInt(dateStr.split('-')[0], 10);
      }
      return new Date(dateStr).getFullYear();
  };

  const availableYears = useMemo(() => {
      const validTransactions = (transactions || []).filter(t => 
        !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(t.status?.toLowerCase())
      );
      const years = new Set(validTransactions.map(t => getSafeYear(t.date)));
      const current = new Date().getFullYear();
      years.add(current);
      return Array.from(years).sort((a, b) => b - a).map(String);
  }, [transactions]);

  useEffect(() => { generateReportData(); }, [transactions, accounts, bankAccounts, initialBalance, cashAccounts, fixedAssets, realEstates, accountsReceivable, accountsPayable, inventory, selectedYear]);

  const generateReportData = () => {
    const safeParseFloat = (value) => { const parsed = parseFloat(value); return isNaN(parsed) ? 0 : parsed; };
    const allTransactions = transactions || [];
    const allAccounts = accounts || [];
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

    // Aquí usamos el año seguro extraído del string
    const pnlTransactions = validTransactions.filter(t => getSafeYear(t.date).toString() === currentYear);
    const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(currentYear));

      // REGLAS CONTABLES ESTRICTAS
      const isLiabilityAccount = (categoryName) => { const account = allAccounts.find(a => a.name === categoryName); return account && String(account.number).startsWith('2'); };
      const isAssetAccount = (categoryName) => { const account = allAccounts.find(a => a.name === categoryName); return account && String(account.number).startsWith('1'); };
      const isEquityAccount = (categoryName) => { const account = allAccounts.find(a => a.name === categoryName); return account && String(account.number).startsWith('3'); };

      // CÁLCULO DE P&L EXCLUYENDO PATRIMONIO
      const totalIncome = pnlTransactions.filter(t => 
          t.type === 'income' && 
          !t.isInternalTransfer && 
          t.category !== 'Cuentas por Cobrar' && 
          !isLiabilityAccount(t.category) && 
          !isAssetAccount(t.category) &&
          !isEquityAccount(t.category) // Evita que capitalizaciones se muestren como ventas
      ).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

      const totalExpenses = pnlTransactions.filter(t => 
          t.type === 'expense' && 
          !t.isInternalTransfer && 
          !t.isFixedAsset && 
          !t.isPurchase && 
          t.category !== 'Cuentas por Pagar' && 
          !isLiabilityAccount(t.category) && 
          !isAssetAccount(t.category) &&
          !isEquityAccount(t.category)
      ).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0;
      const summaryData = { totalIncome, totalExpenses, netProfit, profitMargin };

      // Solo calcular en categorías no restringidas
      const calculateTotalForCategory = (categoryName) => pnlTransactions.filter(t => 
          t.category === categoryName && 
          !t.isFixedAsset && 
          !t.isInternalTransfer && 
          !isLiabilityAccount(t.category) && 
          !isAssetAccount(t.category) &&
          !isEquityAccount(t.category)
      ).reduce((sum, t) => sum + safeParseFloat(t.amount), 0);

      // Cuentas operacionales para P&L
      const incomeAccounts = allAccounts.filter(a => String(a.number).startsWith('4'));
      const expenseAccounts = allAccounts.filter(a => String(a.number).startsWith('5'));
      const costAccounts = allAccounts.filter(a => String(a.number).startsWith('6') || String(a.number).startsWith('7'));
      
      const totalCosts = costAccounts.reduce((sum, acc) => sum + calculateTotalForCategory(acc.name), 0);
      const grossProfit = totalIncome - totalCosts;
      
      const incomeStatement = [
          { item: 'Ingresos Operacionales', amount: totalIncome }, ...incomeAccounts.map(acc => ({ item: `  ${acc.name}`, amount: calculateTotalForCategory(acc.name) })).filter(i => i.amount),
          { item: 'Costos de Venta', amount: -totalCosts }, ...costAccounts.map(acc => ({ item: `  ${acc.name}`, amount: -calculateTotalForCategory(acc.name) })).filter(i => i.amount),
          { item: 'Utilidad Bruta', amount: grossProfit, isBold: true, isTopBorder: true },
          { item: 'Gastos Operacionales', amount: -totalExpenses }, ...expenseAccounts.map(acc => ({ item: `  ${acc.name}`, amount: -calculateTotalForCategory(acc.name) })).filter(i => i.amount),
          { item: 'Utilidad Neta (Estado de Resultados)', amount: netProfit, isBold: true, isTotal: true },
      ];

      const isAccountMatch = (targetId, accountIdOrString) => {
          if (!accountIdOrString) return false;
          if (accountIdOrString === targetId) return true;
          if (accountIdOrString.startsWith(`${targetId}|`)) return true;
          if (targetId === 'caja_principal' && accountIdOrString.toLowerCase().includes('caja principal')) return true;
          return false;
      };

      // NUEVO FILTRO: Filtrado seguro por año para el balance inicial de Caja
      const initialCash = (initialBalance || []).filter(item => {
          if (!item.date) return true; 
          return getSafeYear(item.date) <= parseInt(currentYear);
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
              if (t.fromAccount && (cashAccountIds.has(t.fromAccount) || t.fromAccount.startsWith('caja_principal'))) {
                  cashExpenses += amount;
              }
              if (t.toAccount && (cashAccountIds.has(t.toAccount) || t.toAccount.startsWith('caja_principal'))) {
                  cashIncomes += amount;
              }
          }
      });
      const cajaPrincipalBalance = initialCash + cashIncomes - cashExpenses;

      let customCashBalance = 0;
      if (cashAccounts) {
          customCashBalance = cashAccounts.reduce((acc, cashAcc) => {
              let currentBal = 0;
              // Filtrar saldo inicial de cajas menores de forma segura
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

      let totalBankBalances = 0, totalInvestmentBalances = 0;
      (bankAccounts || []).forEach(acc => {
          let currentBankBalance = 0;
          let currentInvestmentBalance = 0;
          
          // Filtrar saldo inicial de bancos de forma segura
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
                  const isDrBank = drName === acc.bankName || (acc.accountingCode && drCode === acc.accountingCode);
                  const isCrBank = crName === acc.bankName || (acc.accountingCode && crCode === acc.accountingCode);
                  if (isDrBank) currentBankBalance += amount;
                  if (isCrBank) currentBankBalance -= amount;
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
      
      // Filtrar Cajas en la vista para no mostrar cajas creadas en el futuro
      const dynamicCashAccounts = getDynamicCashAccounts(cashAccounts, validTransactions, currentYear).filter(acc => {
          const originalAcc = (cashAccounts || []).find(c => c.id === acc.id);
          return !originalAcc?.date || getSafeYear(originalAcc.date) <= parseInt(currentYear);
      });

      const inventoryValue = (inventory || []).reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
      
      const manualFixedAssetsValue = (fixedAssets || []).filter(asset => {
          if (asset.year) return parseInt(asset.year) <= parseInt(currentYear);
          if (asset.date) return getSafeYear(asset.date) <= parseInt(currentYear);
          return false;
      }).reduce((sum, asset) => sum + safeParseFloat(asset.value), 0);
      
      const realEstatesValue = (realEstates || []).filter(estate => getSafeYear(estate.date) <= parseInt(currentYear)).reduce((sum, estate) => sum + safeParseFloat(estate.value), 0);
      const totalFixedAssetsValue = manualFixedAssetsValue + realEstatesValue + inventoryValue;

      const accountsReceivableValue = (accountsReceivable || []).filter(r => {
          const rYear = r.date ? getSafeYear(r.date) : (r.year ? parseInt(r.year) : parseInt(selectedYear));
          return r.status === 'Pendiente' && rYear <= parseInt(selectedYear);
      }).reduce((sum, r) => sum + safeParseFloat(r.amount), 0);

      const accountsPayableValue = (accountsPayable || []).filter(p => {
          const pYear = p.date ? getSafeYear(p.date) : (p.year ? parseInt(p.year) : parseInt(selectedYear));
          return p.status === 'Pendiente' && pYear <= parseInt(selectedYear);
      }).reduce((sum, p) => sum + safeParseFloat(p.amount), 0);

      const otherLiabilitiesTransactions = bsTransactions.filter(t => { const account = allAccounts.find(a => a.name === t.category); return account && account.number.startsWith('2') && t.category !== 'Cuentas por Pagar'; });
      const otherLiabilitiesValue = otherLiabilitiesTransactions.reduce((sum, t) => sum + (t.type === 'income' ? safeParseFloat(t.amount) : -safeParseFloat(t.amount)), 0);

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
    
    const totalAssets = cajaGeneralValue + accountsReceivableValue + totalFixedAssetsValue + anticiposValue + construccionesValue + otherAssetsValue;
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
  
  const handleExportReport = (data, name) => { exportToExcel(data.map(({ item, amount }) => ({ 'Concepto': item, 'Monto': amount, })), `${name}_${selectedYear}`); toast({ title: 'Exportado a Excel' }); };
  const handleExportBalanceSheet = () => { const { assets, liabilities, equity, totals } = reportData.balanceSheet; const dataToExport = [ ...assets.map(a => ({ Categoria: a.item, Monto: a.amount != null ? a.amount : '' })), { Categoria: 'TOTAL ACTIVOS', Monto: totals.assets }, {}, ...liabilities.map(l => ({ Categoria: l.item, Monto: l.amount != null ? l.amount : '' })), { Categoria: 'TOTAL PASIVOS', Monto: totals.liabilities }, {}, ...equity.map(e => ({ Categoria: e.item, Monto: e.amount != null ? e.amount : '' })), { Categoria: 'TOTAL PATRIMONIO', Monto: totals.equity }, {}, { Categoria: 'TOTAL PASIVO + PATRIMONIO', Monto: totals.liabilitiesAndEquity } ]; exportToExcel(dataToExport, `Balance_General_${selectedYear}`); }
  const renderSheetTable = (items) => (items.map((item, index) => (<tr key={index} className="border-b last:border-none"><td className={`py-2 ${item.isBold ? 'font-bold' : ''} ${item.isSubtotal ? 'font-semibold' : ''}`} style={{ paddingLeft: item.item.search(/\S/) * 4 }}>{item.item.trim()}</td><td className={`py-2 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.isSubtotal ? 'font-semibold' : ''}`}>{item.amount != null ? `$${item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : ''}</td></tr>)));

  return (
    <>
      <Helmet><title>Reportes - JaiderHerTur26</title></Helmet>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between md:items-center gap-4"><h1 className="text-4xl font-bold text-slate-900 mb-2">Reportes Financieros</h1><div className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-slate-500" /><Label htmlFor="year-select" className="font-medium">Año Fiscal:</Label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger id="year-select" className="w-[120px] bg-white"><SelectValue placeholder="Año" /></SelectTrigger><SelectContent>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent></Select></div></motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><div className="bg-green-100 p-6 rounded-lg border border-green-200"><p className="text-sm text-green-800">Ingresos (P&L)</p><p className="text-2xl font-bold text-green-900">${reportData.summary.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p></div><div className="bg-red-100 p-6 rounded-lg border border-red-200"><p className="text-sm text-red-800">Gastos (P&L)</p><p className="text-2xl font-bold text-red-900">${reportData.summary.totalExpenses.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p></div><div className="bg-blue-100 p-6 rounded-lg border border-blue-200"><p className="text-sm text-blue-800">Utilidad del Ejercicio</p><p className="text-2xl font-bold text-blue-900">${reportData.summary.netProfit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p></div><div className="bg-purple-100 p-6 rounded-lg border border-purple-200"><p className="text-sm text-purple-800">Margen</p><p className="text-2xl font-bold text-purple-900">{reportData.summary.profitMargin}%</p></div></div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}><div className="bg-white rounded-xl shadow-lg border"><div className="flex justify-between items-center p-6 border-b"><h2 className="text-xl font-bold text-slate-900">Balance General</h2><Button onClick={handleExportBalanceSheet} variant="outline"><Download className="w-4 h-4 mr-2" /> Exportar</Button></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8"><div><h3 className="text-lg font-semibold mb-2 text-blue-700">Activos</h3><table className="w-full"><tbody>{renderSheetTable(reportData.balanceSheet.assets)}</tbody></table><table className="w-full mt-2"><tbody><tr className="border-t-2 border-slate-900"><td className="py-2 font-bold">Total Activos</td><td className="py-2 text-right font-mono font-bold">${reportData.balanceSheet.totals.assets?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr></tbody></table></div><div><h3 className="text-lg font-semibold mb-2 text-blue-700">Pasivos y Patrimonio</h3><table className="w-full"><tbody>{renderSheetTable(reportData.balanceSheet.liabilities)}</tbody></table><table className="w-full mt-2"><tbody>{renderSheetTable(reportData.balanceSheet.equity)}</tbody></table><table className="w-full mt-2"><tbody><tr className="border-t-2 border-slate-900"><td className="py-2 font-bold">Total Pasivo + Patrimonio</td><td className="py-2 text-right font-mono font-bold">${reportData.balanceSheet.totals.liabilitiesAndEquity?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr></tbody></table></div></div><div className={`p-4 text-center border-t text-sm font-semibold ${Math.abs(reportData.balanceSheet.totals.assets - reportData.balanceSheet.totals.liabilitiesAndEquity) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{Math.abs(reportData.balanceSheet.totals.assets - reportData.balanceSheet.totals.liabilitiesAndEquity) < 0.01 ? '¡El balance está cuadrado!' : 'El balance no está cuadrado'}</div></div></motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}><div className="bg-white rounded-xl shadow-lg border"><div className="flex justify-between items-center p-6 border-b"><h2 className="text-xl font-bold text-slate-900">Estado de Resultados</h2><Button onClick={() => handleExportReport(reportData.incomeStatement, 'Estado_de_Resultados')} variant="outline"><Download className="w-4 h-4 mr-2" /> Exportar</Button></div><div className="p-6"><table className="w-full"><tbody>{reportData.incomeStatement.map((item, index) => (<tr key={index} className={`border-b last:border-none ${item.isTotal ? 'bg-blue-50' : ''} ${item.isTopBorder ? 'border-t-2 border-slate-900' : ''}`}><td className={`py-3 ${item.isBold ? 'font-bold' : ''}`}>{item.item}</td><td className={`py-3 text-right font-mono ${item.isBold ? 'font-bold' : ''} ${item.amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>${item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>))}</tbody></table></div></div></motion.div>
      </div>
    </>
  );
};

export default Reports;