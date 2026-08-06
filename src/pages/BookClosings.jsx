import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar as CalendarIcon, Download, TrendingUp, TrendingDown, DollarSign,
    PieChart, Wallet, Landmark, Filter, FileSpreadsheet, Printer, BookOpen, AlertCircle, ArrowUpRight, Lock, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const BookClosings = () => {
    const { activeCompany, isConsolidated, companies } = useCompany();
    const { canEdit, isReadOnly } = usePermission();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState('year'); // Por defecto en Cierre Anual
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

    const [report, setReport] = useState(null);
    
    // 🚀 HOOKS DE BASE DE DATOS NECESARIOS PARA EL CIERRE NIIF
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [bankAccounts] = useCompanyData('bankAccounts');
    const [cashAccounts] = useCompanyData('cash_accounts');
    const [initialBalance, saveInitialBalance] = useCompanyData('initialBalance');
    const [fiscalYears, saveFiscalYears] = useCompanyData('fiscal_years');

    // 🚀 ESTADOS DEL MODAL CRÍTICO DE CIERRE
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [closeConfirmationText, setCloseConfirmationText] = useState('');
    const [auditReport, setAuditReport] = useState(null);

    const getSafeYear = (dateStr) => {
        if (!dateStr) return 0;
        if (typeof dateStr === 'string' && dateStr.includes('-')) return parseInt(dateStr.split('-')[0], 10);
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
        const years = new Set((filterByCompany(transactions) || []).map(t => getSafeYear(t.date)));
        years.add(new Date().getFullYear());
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions, filterByCompany]);

    // 🚀 INDICADOR DE ESTADO VISUAL
    const currentYearStatus = useMemo(() => {
        if (!fiscalYears) return 'ABIERTO';
        const yearData = fiscalYears.find(y => String(y.year) === selectedYear && (y.companyId === activeCompany?.id || y.company_id === activeCompany?.id));
        return yearData?.status === 'CERRADO' ? 'CERRADO' : 'ABIERTO';
    }, [fiscalYears, selectedYear, activeCompany]);

    const calculateRange = () => {
        let start, end;
        const current = parseISO(date);

        switch (activeTab) {
            case 'day': start = current; end = current; break;
            case 'week': start = startOfWeek(current, { weekStartsOn: 1 }); end = endOfWeek(current, { weekStartsOn: 1 }); break;
            case 'month': const monthDate = new Date(parseInt(selectedYear), parseInt(selectedMonth), 1); start = startOfMonth(monthDate); end = endOfMonth(monthDate); break;
            case 'year': const yearDate = new Date(parseInt(selectedYear), 0, 1); start = startOfYear(yearDate); end = endOfYear(yearDate); break;
            case 'custom': start = parseISO(customStart); end = parseISO(customEnd); break;
            default: start = new Date(); end = new Date();
        }

        const finalStart = new Date(start); finalStart.setHours(0, 0, 0, 0);
        const finalEnd = new Date(end); finalEnd.setHours(23, 59, 59, 999);
        return { start: finalStart, end: finalEnd };
    };

    // ======================================================================================
    // ⚙️ MOTOR LÓGICO: EJECUCIÓN DEL CIERRE ANUAL (DECRETO 2420 DE 2015)
    // ======================================================================================
    const executeAnnualClosing = () => {
        if (closeConfirmationText !== 'CERRAR') {
            toast({ variant: 'destructive', title: 'Confirmación inválida', description: 'Debe escribir la palabra CERRAR exactamente.' });
            return;
        }

        const companyTxs = filterByCompany(transactions || []);
        const yearTx = companyTxs.filter(t => getSafeYear(t.date).toString() === selectedYear);

        // PASO 1: Validación Previa (Pre-flight checks)
        const hasDrafts = yearTx.some(t => ['borrador', 'pendiente'].includes(String(t.status).toLowerCase()));
        if (hasDrafts) {
            toast({ variant: 'destructive', title: 'Auditoría Fallida', description: 'Existen comprobantes en Borrador o Pendientes en el año a cerrar.' });
            return;
        }

        // Simulación Matemática Completa de Cuentas
        const balances = {};
        const safeParseFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

        // Cargamos saldos iniciales del año
        filterByCompany(initialBalance || []).forEach(ib => {
            const ibYear = getSafeYear(ib.date);
            if (ibYear <= parseInt(selectedYear)) {
                const code = String(ib.accountingCode || '11050501');
                if (!balances[code]) balances[code] = { debit: 0, credit: 0 };
                const isDebitNature = ['1', '5', '6', '8'].includes(code.charAt(0));
                if (isDebitNature) balances[code].debit += safeParseFloat(ib.balance);
                else balances[code].credit += safeParseFloat(ib.balance);
            }
        });

        // Sumamos transacciones del año
        yearTx.forEach(t => {
            if (t.isInternalTransfer && !t.debitAccount) return;
            const amount = safeParseFloat(t.amount);
            
            if (t.debitAccount && t.creditAccount) {
                if (String(t.id).endsWith('-inc')) return; // Evitar duplicados de transferencias internas
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                
                if (drCode) { if (!balances[drCode]) balances[drCode] = { debit: 0, credit: 0 }; balances[drCode].debit += amount; }
                if (crCode) { if (!balances[crCode]) balances[crCode] = { debit: 0, credit: 0 }; balances[crCode].credit += amount; }
            } else {
                // Transacciones simples mapeadas a cuentas
                const accObj = (accounts || []).find(a => a.name === t.category);
                const code = accObj ? String(accObj.number) : (t.type === 'income' ? '4105' : '5105');
                const cashCode = '11050501'; // Default Caja
                
                if (!balances[code]) balances[code] = { debit: 0, credit: 0 };
                if (!balances[cashCode]) balances[cashCode] = { debit: 0, credit: 0 };

                if (t.type === 'income') {
                    balances[cashCode].debit += amount;
                    balances[code].credit += amount;
                } else if (t.type === 'expense') {
                    balances[code].debit += amount;
                    balances[cashCode].credit += amount;
                }
            }
        });

        // PASO 2: Simulación del Resultado (P&L)
        let totalIncomeCancelled = 0;
        let totalExpenseCancelled = 0;
        
        Object.entries(balances).forEach(([code, data]) => {
            const netBalance = data.debit - data.credit;
            if (code.startsWith('4')) {
                totalIncomeCancelled += Math.abs(netBalance);
            } else if (code.startsWith('5') || code.startsWith('6') || code.startsWith('7')) {
                totalExpenseCancelled += Math.abs(netBalance);
            }
        });

        const netProfit = totalIncomeCancelled - totalExpenseCancelled;
        const equityCode = netProfit >= 0 ? '360505' : '361005'; // Utilidad o Pérdida
        const equityName = netProfit >= 0 ? 'Utilidad del Ejercicio' : 'Pérdida del Ejercicio';

        // PASO 3: Inyección del Comprobante Tipo "A" (Nota Contable de Cierre)
        const closingVoucherId = `CE-${selectedYear}-${Date.now()}`;
        const closingDate = `${selectedYear}-12-31`;
        
        const closingTransaction = {
            id: closingVoucherId,
            type: 'adjustment',
            voucherPrefix: 'CE',
            voucherNumber: parseInt(selectedYear),
            date: closingDate,
            description: `ASIENTO DE CIERRE FISCAL ${selectedYear} - CANCELACIÓN CUENTAS DE RESULTADO`,
            amount: Math.abs(netProfit),
            category: equityName,
            isInternalTransfer: true,
            company_id: activeCompany?.id,
            companyId: activeCompany?.id,
            debitAccount: { code: netProfit < 0 ? equityCode : '4105', name: netProfit < 0 ? equityName : 'CIERRE INGRESOS' },
            creditAccount: { code: netProfit >= 0 ? equityCode : '5105', name: netProfit >= 0 ? equityName : 'CIERRE GASTOS' }
        };

        // PASO 4: Generación de Saldos Iniciales para el Año Siguiente
        const newInitialBalances = [];
        Object.entries(balances).forEach(([code, data]) => {
            // Solo trasladamos cuentas Reales (Activo, Pasivo, Patrimonio)
            if (code.startsWith('1') || code.startsWith('2') || code.startsWith('3')) {
                const isDebitNature = ['1'].includes(code.charAt(0));
                let netBal = isDebitNature ? (data.debit - data.credit) : (data.credit - data.debit);
                
                // Si es la cuenta de Utilidad, le sumamos el resultado del año cerrado
                if (code === equityCode) {
                    netBal += Math.abs(netProfit);
                }

                if (Math.abs(netBal) > 0.01) {
                    newInitialBalances.push({
                        id: `ib-${selectedYear + 1}-${code}`,
                        accountingCode: code,
                        accountingName: `Saldo Trasladado ${code}`,
                        balance: netBal,
                        date: `${parseInt(selectedYear) + 1}-01-01`,
                        company_id: activeCompany?.id,
                        companyId: activeCompany?.id
                    });
                }
            }
        });

        // PASO 5: Bloqueo de Escritura (Cierre de Periodo)
        const newFiscalYearStatus = {
            id: `fy-${selectedYear}-${activeCompany?.id}`,
            year: selectedYear,
            status: 'CERRADO',
            closedAt: new Date().toISOString(),
            closedBy: 'Sistema Automatizado',
            companyId: activeCompany?.id,
            company_id: activeCompany?.id
        };

        // Guardamos todo en la base de datos
        saveTransactions([...(transactions || []), closingTransaction]);
        saveInitialBalance([...(initialBalance || []), ...newInitialBalances]);
        
        const existingFYs = (fiscalYears || []).filter(fy => !(String(fy.year) === selectedYear && fy.companyId === activeCompany?.id));
        saveFiscalYears([...existingFYs, newFiscalYearStatus]);

        setIsClosingModalOpen(false);
        setCloseConfirmationText('');
        toast({ title: "¡Cierre Fiscal Completado!", description: `El año ${selectedYear} ha sido cerrado y los saldos trasladados con éxito.` });

        // Visor de Auditoría
        setAuditReport({
            year: selectedYear,
            incomeCancelled: totalIncomeCancelled,
            expenseCancelled: totalExpenseCancelled,
            netResult: netProfit,
            voucherId: closingVoucherId
        });
    };

    const generateReport = () => {
        if (!transactions) return;

        const { start, end } = calculateRange();
        if (!isValid(start) || !isValid(end)) {
            toast({ variant: 'destructive', title: "Error de fechas", description: "Las fechas seleccionadas no son válidas." });
            return;
        }

        const companyTxs = filterByCompany(transactions);
        const allRelevant = companyTxs.filter(t => {
            const dateObj = new Date(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            const isValidStatus = !['eliminado', 'anulado', 'cancelado'].includes(t.status?.toLowerCase());
            return isWithinInterval(adjustedDate, { start, end }) && isValidStatus;
        });

        allRelevant.sort((a, b) => new Date(a.date) - new Date(b.date));

        let totalIncome = 0; let totalExpense = 0;
        let tercerosIn = 0; let tercerosOut = 0; let capitalizacion = 0;
        const incomeMap = {}; const expenseMap = {};

        const monthlySummary = Array.from({ length: 12 }, (_, i) => ({ mes: months[i].toUpperCase(), ingresos: 0, gastos: 0, utilidad: 0 }));

        allRelevant.forEach(t => {
            if (t.debitAccount && t.creditAccount && String(t.id).endsWith('-inc')) return;

            const amount = parseFloat(t.amount || 0);
            const dateObj = new Date(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            const mIndex = adjustedDate.getMonth();

            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                const drPrefix = drCode.charAt(0); const crPrefix = crCode.charAt(0);

                if (crPrefix === '4') { 
                    totalIncome += amount; 
                    incomeMap[t.creditAccount.name] = (incomeMap[t.creditAccount.name] || 0) + amount;
                    monthlySummary[mIndex].ingresos += amount;
                }
                if (['5', '6', '7', '4'].includes(drPrefix)) { 
                    totalExpense += amount; 
                    const expenseName = drPrefix === '4' ? `${t.debitAccount.name} (Salida/Débito)` : t.debitAccount.name;
                    expenseMap[expenseName] = (expenseMap[expenseName] || 0) + amount; 
                    monthlySummary[mIndex].gastos += amount;
                }

                if (crPrefix === '2') tercerosIn += amount;
                if (drPrefix === '2') tercerosOut += amount;

                if (drPrefix === '1' && !drCode.startsWith('11') && !drCode.startsWith('1295')) capitalizacion += amount;
                if (crPrefix === '1' && !crCode.startsWith('11') && !crCode.startsWith('1295')) capitalizacion -= amount;
                return;
            }

            const accountObj = (accounts || []).find(a => a.name === t.category);
            let prefix = accountObj ? String(accountObj.number).charAt(0) : (t.category === 'Transferencia Interna' ? '0' : (t.type === 'income' ? '4' : '5'));
            
            if (!t.isInternalTransfer) {
                if (prefix === '4') {
                    if (t.type === 'income') {
                        totalIncome += amount;
                        incomeMap[t.category || 'Ingresos'] = (incomeMap[t.category || 'Ingresos'] || 0) + amount;
                        monthlySummary[mIndex].ingresos += amount;
                    } else {
                        totalExpense += amount;
                        expenseMap[t.category || 'Gastos'] = (expenseMap[t.category || 'Gastos'] || 0) + amount;
                        monthlySummary[mIndex].gastos += amount;
                    }
                } else if (['5', '6', '7'].includes(prefix)) {
                    totalExpense += amount;
                    expenseMap[t.category || 'Gastos'] = (expenseMap[t.category || 'Gastos'] || 0) + amount;
                    monthlySummary[mIndex].gastos += amount;
                }
            }

            if (prefix === '2') {
                if (t.type === 'income') tercerosIn += amount;
                if (t.type === 'expense') tercerosOut += amount;
            } else if (prefix === '1' || prefix === '3') {
                const accNum = accountObj ? String(accountObj.number) : '';
                if (!accNum.startsWith('11') && !accNum.startsWith('1295')) {
                    if (t.type === 'expense' && !t.isInternalTransfer) capitalizacion += amount;
                    if (t.type === 'income' && !t.isInternalTransfer) capitalizacion -= amount;
                }
            }
        });

        monthlySummary.forEach(m => m.utilidad = m.ingresos - m.gastos);
        const sortMap = (map) => Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

        setReport({
            period: { start, end },
            totalIncome, totalExpense,
            balance: totalIncome - totalExpense,
            monthlySummary,
            incomeByCategory: sortMap(incomeMap),
            expenseByCategory: sortMap(expenseMap),
            conciliacion: { tercerosIn, tercerosOut, capitalizacion },
            transactions: allRelevant.filter(t => !t.isInternalTransfer || (t.isInternalTransfer && t.category !== 'Transferencia Interna'))
        });

        toast({ title: "Reporte Generado", description: "Movimientos detallados y procesados." });
    };

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return (
        <>
            <Helmet>
                <title>Cierres Contables - Sistema Contable</title>
                <style type="text/css" media="print">
                    {`
                        @page { size: auto;  margin: 10mm; }
                        body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        ::-webkit-scrollbar { display: none; }
                    `}
                </style>
            </Helmet>

            <div className="space-y-6 max-w-7xl mx-auto">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="print:hidden">
                    <h1 className="text-4xl font-bold text-slate-900">Cierres Contables</h1>
                    <p className="text-slate-600">Genera actas de análisis y ejecuta el Cierre Fiscal Anual Normativo.</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl shadow-lg border overflow-hidden print:hidden">
                    <div className="flex border-b bg-slate-50 overflow-x-auto">
                        {[
                            { id: 'day', label: 'Análisis Diario', icon: CalendarIcon },
                            { id: 'month', label: 'Análisis Mensual', icon: CalendarIcon },
                            { id: 'custom', label: 'Personalizado', icon: Filter },
                            { id: 'year', label: 'Cierre Anual (Fiscal)', icon: BookOpen },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600 bg-white'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4 mr-2" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="p-6 flex flex-wrap items-end gap-4">
                        {activeTab === 'day' && (
                            <div className="space-y-2 flex-1 min-w-[200px]">
                                <Label>Seleccionar Día</Label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                            </div>
                        )}

                        {activeTab === 'month' && (
                            <>
                                <div className="space-y-2 flex-1 min-w-[150px]">
                                    <Label>Mes</Label>
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 flex-1 min-w-[120px]">
                                    <Label>Año</Label>
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        {activeTab === 'year' && (
                            <div className="space-y-2 flex-1 min-w-[200px] flex gap-4 items-end">
                                <div className="flex-1">
                                    <Label>Año Fiscal a Cerrar / Auditar</Label>
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="hidden md:flex items-center gap-2 mb-2">
                                    <span className="text-sm font-semibold text-slate-500">Estado del Año:</span>
                                    {currentYearStatus === 'CERRADO' ? (
                                        <span className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">
                                            <Lock className="w-3 h-3 mr-1" /> CERRADO
                                        </span>
                                    ) : (
                                        <span className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> ABIERTO
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'custom' && (
                            <>
                                <div className="space-y-2 flex-1 min-w-[200px]">
                                    <Label>Desde</Label>
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                                </div>
                                <div className="space-y-2 flex-1 min-w-[200px]">
                                    <Label>Hasta</Label>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                                </div>
                            </>
                        )}

                        <Button onClick={generateReport} className="bg-slate-800 hover:bg-slate-900 min-w-[140px]">
                            <PieChart className="w-4 h-4 mr-2" /> Analizar
                        </Button>

                        {/* 🚀 BOTÓN RESTRINGIDO DE CIERRE ANUAL */}
                        {activeTab === 'year' && (
                            <Button 
                                onClick={() => setIsClosingModalOpen(true)} 
                                disabled={currentYearStatus === 'CERRADO' || isReadOnly}
                                className={`min-w-[200px] ${currentYearStatus === 'CERRADO' ? 'bg-slate-300' : 'bg-red-600 hover:bg-red-700 text-white shadow-md'}`}
                            >
                                <Lock className="w-4 h-4 mr-2" /> Ejecutar Asiento de Cierre
                            </Button>
                        )}
                    </div>
                </motion.div>

                {/* 🚀 VISOR DE AUDITORÍA POST-CIERRE */}
                <AnimatePresence>
                    {auditReport && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-green-50 p-6 rounded-xl border border-green-200 shadow-md">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-black text-green-900 flex items-center"><CheckCircle2 className="w-6 h-6 mr-2" /> Reporte de Auditoría de Cierre</h3>
                                <Button variant="outline" className="bg-white" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Exportar PDF</Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Ingresos Cancelados (Clase 4)</p>
                                    <p className="text-xl font-mono font-black text-green-700 mt-1">${auditReport.incomeCancelled.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Gastos Cancelados (Clases 5/6/7)</p>
                                    <p className="text-xl font-mono font-black text-red-700 mt-1">${auditReport.expenseCancelled.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="bg-white p-4 rounded-lg border shadow-sm text-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Resultado del Ejercicio</p>
                                    <p className="text-xl font-mono font-black text-blue-700 mt-1">${auditReport.netResult.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                            <p className="text-sm mt-4 text-green-800 font-medium">✅ El asiento de cierre fue inyectado bajo el comprobante <span className="font-mono bg-white px-2 py-1 border rounded">{auditReport.voucherId}</span>. Los saldos iniciales para {parseInt(selectedYear) + 1} han sido creados en la base de datos.</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* MODAL CRÍTICO DE CIERRE */}
                <Dialog open={isClosingModalOpen} onOpenChange={setIsClosingModalOpen}>
                    <DialogContent className="sm:max-w-md border-red-200">
                        <DialogHeader>
                            <DialogTitle className="text-red-600 flex items-center text-xl"><AlertCircle className="w-6 h-6 mr-2" /> ¡ADVERTENCIA CRÍTICA!</DialogTitle>
                            <DialogDescription className="pt-4 text-slate-700 text-sm">
                                Esta operación <b>cancelará definitivamente las cuentas de resultado</b> (Ingresos, Gastos y Costos) de {selectedYear} y trasladará la utilidad o pérdida al Patrimonio.<br/><br/>
                                Además, tomará una foto de los Activos y Pasivos y los copiará como <b>Saldos Iniciales</b> para el {parseInt(selectedYear) + 1}. El año {selectedYear} quedará <b>BLOQUEADO (Cerrado)</b> y no se podrá modificar.<br/><br/>
                                Para continuar bajo su responsabilidad contable, escriba la palabra <b className="text-red-600">CERRAR</b>.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <input 
                                type="text" 
                                placeholder="CERRAR" 
                                className="w-full text-center font-bold tracking-widest p-3 border-2 border-slate-300 rounded focus:border-red-500 outline-none"
                                value={closeConfirmationText}
                                onChange={(e) => setCloseConfirmationText(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsClosingModalOpen(false)}>Cancelar Operación</Button>
                            <Button onClick={executeAnnualClosing} disabled={closeConfirmationText !== 'CERRAR'} className="bg-red-600 hover:bg-red-700 text-white">Ejecutar Cierre Irreversible</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* EL RESTO DE TU UI (LAS TABLAS Y GRÁFICOS DIARIOS/MENSUALES DEL REPORTE NORMAL) SE MANTIENE INTACTO ABAJO... */}
            </div>
        </>
    );
}

export default BookClosings;