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

    const pnlTransactions = validTransactions.filter(t => getSafeYear(t.date).toString() === currentYear);
    const bsTransactions = validTransactions.filter(t => getSafeYear(t.date) <= parseInt(currentYear));

    const getSafeYear = (dateStr) => {
        if (!dateStr) return 0;
        if (typeof dateStr === 'string' && dateStr.includes('-')) return parseInt(dateStr.split('-')[0], 10);
        return new Date(dateStr).getFullYear();
    };

    // 🚀 1. MOTOR UNIFICADO DE RESOLUCIÓN (Idéntico al Libro Mayor)
    const getAssetDetails = (destinationStr, categoryName = '') => {
        if (!destinationStr) return { code: '238095', name: 'PARTIDAS POR CLASIFICAR' };
        const [id, name] = destinationStr.split('|');
        if (id === 'pending_payable') return { code: '23050101', name: 'CUENTAS POR PAGAR' };
        if (id === 'pending_receivable') return { code: '13050505', name: 'CUENTAS POR COBRAR' };
        if (id === 'caja_principal' || (name && name.toUpperCase().includes('CAJA PRINCIPAL'))) return { code: '11050501', name: 'CAJA PRINCIPAL' };
        const cashAcc = (cashAccounts || []).find(c => c.id === id);
        if (cashAcc) return { code: cashAcc.accounting_account || '1105', name: cashAcc.name };
        if (id === '12950501' || (name && name.toUpperCase().includes('APORTES COOPERATIVA'))) return { code: '12950501', name: 'APORTES COOPERATIVA FRATERNIDAD' };
        const bank = (bankAccounts || []).find(b => b.id === id);
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
            const catObj = (accounts || []).find(a => a.name === t.category) || { number: '421004', name: t.category };
            return { debit: { code: assetAcc.code, name: assetAcc.name, value: amount }, credit: { code: catObj.number || '421004', name: catObj.name || t.category, value: amount } };
        }
        if (t.type === 'transfer' && t.fromAccount && t.toAccount) {
            const debit = getAssetDetails(t.toAccount, t.category);
            const credit = getAssetDetails(t.fromAccount, t.category);
            return { debit: { ...debit, value: amount }, credit: { ...credit, value: amount } };
        }
        const assetAcc = getAssetDetails(t.destination, t.category);
        const catObj = (accounts || []).find(a => a.name === t.category);
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

    // 🚀 3. EXTRACCIÓN DE SALDOS FINALES PUC PARA EL BALANCE GENERAL
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
    const totalIncome = pnlTransactions.reduce((sum, t) => {
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

    const netProfit = totalIncome - totalCosts - totalExpenses;
    const grossProfit = totalIncome - totalCosts;
    const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0;
    const summaryData = { totalIncome, totalExpenses: (totalCosts + totalExpenses), netProfit, profitMargin };

    // Extracción dinámica P&L
    const dynamicIncomes = {};
    const dynamicCosts = {};
    const dynamicExpenses = {};

    pnlTransactions.forEach(t => {
        const { debit, credit } = resolveAccountingRow(t);
        if (credit?.code?.startsWith('4')) {
            const name = credit.name || t.category || 'INGRESOS VARIOS';
            dynamicIncomes[name] = (dynamicIncomes[name] || 0) + safeParseFloat(credit.value);
        }
        if (['6', '7'].includes(debit?.code?.charAt(0))) {
            const name = debit.name || t.category || 'COSTOS VARIOS';
            dynamicCosts[name] = (dynamicCosts[name] || 0) + safeParseFloat(debit.value);
        }
        if (debit?.code?.startsWith('5')) {
            const name = debit.name || t.category || 'GASTOS VARIOS';
            dynamicExpenses[name] = (dynamicExpenses[name] || 0) + safeParseFloat(debit.value);
        }
    });

    const formatPnlSection = (itemsObj, isNegative = false) => {
        const rows = [];
        for (const [key, value] of Object.entries(itemsObj)) {
            if (Math.abs(value) > 0.01) {
                rows.push({ item: `  ${String(key).toUpperCase()}`, amount: isNegative ? -Math.abs(value) : value });
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

    let customCashBalance = 0;
    if (fCashAccounts.length > 0) {
        customCashBalance = fCashAccounts.reduce((acc, cashAcc) => acc + safeParseFloat(cashAcc.initial_balance), 0);
    }

    const totalCashBalance = cajaPrincipalBalance + customCashBalance;
    const cajaGeneralValue = totalCashBalance + totalBankBalances + totalInvestmentBalances;
    const totalActivoCorriente = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue;
    const totalActivoNoCorriente = intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue;
    
    const totalAssets = totalActivoCorriente + totalActivoNoCorriente; 
    const totalLiabilities = accountsPayableValue + otherLiabilitiesValue; 
    const totalEquity = totalAssets - totalLiabilities; 
    const retainedEquity = totalEquity - netProfit;

    const assets = [
        { item: 'ACTIVO CORRIENTE', isBold: true },
        { item: '  Efectivo y Equivalentes', isBold: true },
        { item: '    Caja General', amount: cajaGeneralValue, isSubtotal: true },
        { item: '      Caja Principal', amount: cajaPrincipalBalance },
        ...fCashAccounts.map(acc => ({ item: `      ${acc.name}`, amount: safeParseFloat(acc.initial_balance) })),
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
        
    const liabilities = [ { item: 'Pasivo', isBold: true }, { item: '  Cuentas por Pagar', amount: accountsPayableValue }, { item: '  Otros Pasivos (Fondos de Terceros)', amount: otherLiabilitiesValue } ];
    const equity = [ { item: 'Patrimonio', isBold: true }, { item: '  Capital Social (Inc. Utilidades Acum.)', amount: retainedEquity }, { item: '  Utilidad del Ejercicio', amount: netProfit } ];

    const balanceSheet = { assets: assets.filter(a => a.amount != null || a.isBold || a.isSubtotal), liabilities: liabilities.filter(l => l.amount != null || l.isBold), equity: equity.filter(e => e.amount != null || e.isBold), totals: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity, liabilitiesAndEquity: totalLiabilities + totalEquity } };

    const initialBank = fBankAccounts.reduce((sum, acc) => sum + safeParseFloat(acc.initialBalance), 0);
    const initialCashTotal = cajaPrincipalBalance + initialBank;

    const cashFlow = {
        initial: initialCashTotal,
        sources: [{ item: 'Ingresos Operacionales', amount: totalIncome }],
        uses: [{ item: 'Costos y Gastos', amount: totalCosts + totalExpenses }],
        totalSources: totalIncome,
        totalUses: totalCosts + totalExpenses,
        final: initialCashTotal + totalIncome - (totalCosts + totalExpenses)
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
          
          
          // 🚀 FORMATO NIIF OFICIAL: Paréntesis para saldos contrarios (ej: Depreciación), Ceros sin paréntesis
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
                  // Calculamos la indentación en píxeles basados en los espacios
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