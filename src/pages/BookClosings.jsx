import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
    Calendar as CalendarIcon,
    Download,
    TrendingUp,
    TrendingDown,
    DollarSign,
    PieChart,
    Wallet,
    Landmark,
    Filter,
    FileSpreadsheet,
    Printer,
    BookOpen,
    AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel } from '@/lib/excel';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import {
    format,
    parseISO,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    isWithinInterval,
    isValid
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BookClosings = () => {
    const { activeCompany } = useCompany();
    const [activeTab, setActiveTab] = useState('day');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

    const [report, setReport] = useState(null);
    const [transactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const { toast } = useToast();

    const availableYears = React.useMemo(() => {
        const years = new Set((transactions || []).map(t => new Date(t.date).getFullYear()));
        const current = new Date().getFullYear();
        years.add(current);
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions]);

    const calculateRange = () => {
        let start, end;
        const current = parseISO(date);

        switch (activeTab) {
            case 'day':
                start = current;
                end = current;
                break;
            case 'week':
                start = startOfWeek(current, { weekStartsOn: 1 });
                end = endOfWeek(current, { weekStartsOn: 1 });
                break;
            case 'month':
                const monthDate = new Date(parseInt(selectedYear), parseInt(selectedMonth), 1);
                start = startOfMonth(monthDate);
                end = endOfMonth(monthDate);
                break;
            case 'year':
                const yearDate = new Date(parseInt(selectedYear), 0, 1);
                start = startOfYear(yearDate);
                end = endOfYear(yearDate);
                break;
            case 'custom':
                start = parseISO(customStart);
                end = parseISO(customEnd);
                break;
            default:
                start = new Date();
                end = new Date();
        }

        const finalStart = new Date(start);
        finalStart.setHours(0, 0, 0, 0);

        const finalEnd = new Date(end);
        finalEnd.setHours(23, 59, 59, 999);

        return { start: finalStart, end: finalEnd };
    };

    const generateReport = () => {
        if (!transactions) return;

        const { start, end } = calculateRange();

        if (!isValid(start) || !isValid(end)) {
            toast({ variant: 'destructive', title: "Error de fechas", description: "Las fechas seleccionadas no son válidas." });
            return;
        }

        const allRelevant = transactions.filter(t => {
            const dateObj = new Date(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            const isValidStatus = !['eliminado', 'anulado', 'cancelado'].includes(t.status?.toLowerCase());
            return isWithinInterval(adjustedDate, { start, end }) && isValidStatus;
        });

        const pnlTransactions = allRelevant.filter(t => !t.isInternalTransfer);
        allRelevant.sort((a, b) => new Date(a.date) - new Date(b.date));

        const isInvestmentCategory = (cat) => {
            const category = (cat || '').toUpperCase();
            return category.includes('CONSTRUCCIONES') || category.includes('ANTICIPOS');
        };

        const isLiabilityAccount = (t) => {
            const acc = (accounts || []).find(a => a.id === t.accountId || a.name === t.category);
            return acc && acc.number && String(acc.number).startsWith('2');
        };

        const incomes = pnlTransactions.filter(t =>
            t.type === 'income' &&
            !isLiabilityAccount(t) &&
            !isInvestmentCategory(t.category)
        );

        const expenses = pnlTransactions.filter(t =>
            t.type === 'expense' &&
            !isLiabilityAccount(t) &&
            !isInvestmentCategory(t.category)
        );

        let excludedIncome = 0;
        let excludedExpense = 0;

        pnlTransactions.forEach(t => {
            if (isLiabilityAccount(t) || isInvestmentCategory(t.category)) {
                if (t.type === 'income') excludedIncome += parseFloat(t.amount || 0);
                if (t.type === 'expense') excludedExpense += parseFloat(t.amount || 0);
            }
        });

        const groupByCategory = (list) => {
            const groups = {};
            list.forEach(t => {
                const catName = t.category || 'Sin Categoría asignada';
                groups[catName] = (groups[catName] || 0) + parseFloat(t.amount);
            });
            return Object.entries(groups).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
        };

        const flowIn = {};
        const flowOut = {};

        allRelevant.forEach(t => {
            const amount = parseFloat(t.amount);
            const getCleanName = (accStr) => {
                if (!accStr) return 'CAJA PRINCIPAL';
                const parts = accStr.split('|');
                const name = (parts.length > 1 ? parts[1] : parts[0]).toUpperCase();
                return name === 'CAJA_PRINCIPAL' ? 'CAJA PRINCIPAL' : name;
            };

            if (t.isInternalTransfer && t.type === 'expense') {
                const origin = getCleanName(t.destination);
                const destName = t.description.split(' a ')[1]?.split(':')[0].toUpperCase() || 'CUENTA DESTINO';
                const label = `${origin} (A: ${destName})`;
                flowOut[label] = (flowOut[label] || 0) + amount;
            } else if (t.isInternalTransfer && t.type === 'income') {
                const target = getCleanName(t.destination);
                const origName = t.description.split('desde ')[1] || 'CUENTA ORIGEN';
                const label = `${target} (DESDE: ${origName.toUpperCase()})`;
                flowIn[label] = (flowIn[label] || 0) + amount;
            } else if (t.type === 'income') {
                const target = getCleanName(t.destination);
                flowIn[target] = (flowIn[target] || 0) + amount;
            } else if (t.type === 'expense') {
                const origin = getCleanName(t.destination);
                flowOut[origin] = (flowOut[origin] || 0) + amount;
            }
        });

        const totalIncome = incomes.reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const totalExpense = expenses.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        setReport({
            period: { start, end },
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            incomeByCategory: groupByCategory(incomes),
            expenseByCategory: groupByCategory(expenses),
            incomeByDestination: Object.entries(flowIn).map(([name, total]) => ({ name, total })),
            expenseByDestination: Object.entries(flowOut).map(([name, total]) => ({ name, total })),
            transactions: pnlTransactions,
            conciliacion: { excludedIncome, excludedExpense }
        });

        toast({ title: "Cierre Generado", description: "Movimientos detallados y procesados." });
    };

    const handleExport = () => {
        if (!report) return;

        const detailData = report.transactions.map(t => {
            const dateObj = new Date(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);

            let destName = t.destination ? t.destination.split('|')[1] || t.destination.split('|')[0] : 'N/A';
            if (destName === 'caja_principal') destName = 'Caja Principal';

            return {
                'Comprobante': t.voucherNumber || '-',
                'Fecha': format(adjustedDate, 'dd/MM/yyyy'),
                'Tipo': t.type === 'income' ? 'Ingreso' : 'Egreso',
                'Categoría Contable': t.category || 'Sin Categoría',
                'Descripción': t.description,
                'Cuenta (Caja/Banco)': destName.toUpperCase(),
                'Ingreso': t.type === 'income' ? parseFloat(t.amount) : 0,
                'Egreso': t.type === 'expense' ? parseFloat(t.amount) : 0,
            };
        });

        const fileName = `Cierre_Contable_${format(report.period.start, 'dd-MM-yyyy')}_al_${format(report.period.end, 'dd-MM-yyyy')}`;

        exportToExcel(detailData, fileName, {
            'Total Ingresos': report.totalIncome,
            'Total Egresos': report.totalExpense,
            'Resultado Neto': report.balance
        });
        toast({ title: "Exportado", description: "El archivo Excel ha sido descargado." });
    };

    const handlePrint = () => {
        if (!report) return;

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        const { start, end } = report.period;
        const formattedStart = format(start, "d 'de' MMMM, yyyy", { locale: es });
        const formattedEnd = format(end, "d 'de' MMMM, yyyy", { locale: es });

        const generateTableRows = (data) => {
            if (data.length === 0) return `<tr><td colspan="2" style="text-align: center; padding: 8px; color: #64748b;">No hay registros</td></tr>`;
            return data.map(item => `
                <tr>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-size: 11px;">${item.name}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-size: 12px; font-weight: bold;">$${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                </tr>
            `).join('');
        };

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Acta_de_Cierre_${format(start, "yyyyMMdd")}</title>
                <style>
    @page { size: letter; margin: 15mm; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.4; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    .header p { margin: 2px 0; font-size: 11px; color: #475569; }
    .title { text-align: center; font-size: 15px; font-weight: bold; margin-top: 0; margin-bottom: 5px; text-decoration: underline; }
    .period { text-align: center; font-size: 12px; margin-top: 0; margin-bottom: 15px; color: #475569; }
    .summary-box { display: flex; justify-content: space-between; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-bottom: 15px; background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .summary-item { text-align: center; width: 33%; }
    .summary-item:not(:last-child) { border-right: 1px solid #cbd5e1; }
    .summary-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .summary-value { font-size: 16px; font-weight: bold; }
    .section-title { font-size: 11px; font-weight: bold; background-color: #e2e8f0; padding: 5px 10px; margin-top: 15px; margin-bottom: 8px; border: 1px solid #cbd5e1; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .grid-2 { display: flex; gap: 15px; page-break-inside: avoid; }
    .col { width: 50%; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    th { background-color: #f1f5f9; text-align: left; padding: 5px 6px; border: 1px solid #cbd5e1; font-size: 10px; color: #334155; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td { padding: 5px 6px !important; border: 1px solid #e2e8f0; font-size: 10px !important; }
    .signatures { margin-top: 35px; display: flex; justify-content: space-between; padding: 0 40px; page-break-inside: avoid; }
    .sig-block { width: 40%; text-align: center; }
    .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11px; font-weight: bold; }
</style>
            </head>
            <body>
                <div class="header">
                    <h1>${activeCompany?.name || 'PARROQUIA MARÍA AUXILIO DE LOS CRISTIANOS'}</h1>
                    <p>NIT: ${activeCompany?.doc || '802020683'}</p>
                    <p>${activeCompany?.address || 'Cra 10 # 98 - 71'} - Tel: ${activeCompany?.phone || '3167630763'}</p>
                </div>
                
                <div class="title">ACTA DE CIERRE CONTABLE</div>
                <p class="period">Periodo: ${formattedStart} al ${formattedEnd}</p>

                <div class="summary-box">
                    <div class="summary-item">
                        <div class="summary-label">Total Ingresos</div>
                        <div class="summary-value" style="color: #16a34a;">$${report.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Total Egresos</div>
                        <div class="summary-value" style="color: #dc2626;">$${report.totalExpense.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Balance Neto</div>
                        <div class="summary-value" style="color: #2563eb;">$${report.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>

                <div class="section-title">1. Estado de Resultados (Por Concepto)</div>
                <div class="grid-2">
                    <div class="col">
                        <table>
                            <thead><tr><th>Ingresos Clasificados</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.incomeByCategory)}</tbody>
                        </table>
                    </div>
                    <div class="col">
                        <table>
                            <thead><tr><th>Egresos Clasificados</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.expenseByCategory)}</tbody>
                        </table>
                    </div>
                </div>

                <div class="section-title">2. Flujo de Efectivo (Cajas y Bancos)</div>
                <div class="grid-2">
                    <div class="col">
                        <table>
                            <thead><tr><th>Dinero Recibido En</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.incomeByDestination)}</tbody>
                        </table>
                    </div>
                    <div class="col">
                        <table>
                            <thead><tr><th>Dinero Pagado Desde</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.expenseByDestination)}</tbody>
                        </table>
                    </div>
                </div>

                <div class="signatures">
                    <div class="sig-block">
                        <div class="sig-line">Elaborado por:</div>
                    </div>
                    <div class="sig-block">
                        <div class="sig-line">Revisado / Aprobado por:</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

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
                    <p className="text-slate-600">Genera el Acta de Cierre detallando el Estado de Resultados y el Flujo de Efectivo.</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl shadow-lg border overflow-hidden print:hidden">
                    <div className="flex border-b bg-slate-50 overflow-x-auto">
                        {[
                            { id: 'day', label: 'Cierre Diario', icon: CalendarIcon },
                            { id: 'week', label: 'Cierre Semanal', icon: CalendarIcon },
                            { id: 'month', label: 'Cierre Mensual', icon: CalendarIcon },
                            { id: 'year', label: 'Cierre Anual', icon: BookOpen },
                            { id: 'custom', label: 'Personalizado', icon: Filter },
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

                        {activeTab === 'week' && (
                            <div className="space-y-2 flex-1 min-w-[200px]">
                                <Label>Seleccionar un día de la semana</Label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                                <p className="text-xs text-slate-500">Se calculará de Lunes a Domingo.</p>
                            </div>
                        )}

                        {activeTab === 'month' && (
                            <>
                                <div className="space-y-2 flex-1 min-w-[150px]">
                                    <Label>Mes</Label>
                                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 flex-1 min-w-[120px]">
                                    <Label>Año</Label>
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        {activeTab === 'year' && (
                            <div className="space-y-2 flex-1 min-w-[200px]">
                                <Label>Año Fiscal</Label>
                                <Select value={selectedYear} onValueChange={setSelectedYear}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
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

                        <Button onClick={generateReport} className="bg-blue-600 hover:bg-blue-700 min-w-[140px]">
                            <PieChart className="w-4 h-4 mr-2" /> Calcular Cierre
                        </Button>
                    </div>
                </motion.div>

                {report && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="space-y-6 pb-12">

                        <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 bg-white p-6 rounded-xl border shadow-sm">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 uppercase">Acta de Cierre Contable</h1>
                                <h2 className="text-md font-medium text-slate-700 mt-1">
                                    Periodo: {format(report.period.start, "d 'de' MMMM, yyyy", { locale: es })} al {format(report.period.end, "d 'de' MMMM, yyyy", { locale: es })}
                                </h2>
                                <p className="text-slate-500 text-sm mt-1">Transacciones procesadas: {report.transactions.length}</p>
                            </div>
                            <div className="flex gap-2 print:hidden">
                                <Button variant="outline" onClick={handlePrint} className="text-slate-700 border-slate-300 hover:bg-slate-100">
                                    <Printer className="w-4 h-4 mr-2" /> Imprimir Acta
                                </Button>
                                <Button variant="outline" onClick={handleExport} className="text-green-700 border-green-200 bg-green-50 hover:bg-green-100">
                                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Anexo
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border border-green-100 shadow-sm print:shadow-none print:border-slate-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-green-100 p-2 rounded-lg print:bg-transparent"><TrendingUp className="w-6 h-6 text-green-600 print:text-black" /></div>
                                    <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full print:bg-transparent print:border print:border-black print:text-black">Ingresos</span>
                                </div>
                                <p className="text-slate-600 text-sm font-medium">Total Ingresos Periodo</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">${report.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                            </div>

                            <div className="bg-gradient-to-br from-red-50 to-pink-50 p-6 rounded-xl border border-red-100 shadow-sm print:shadow-none print:border-slate-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-red-100 p-2 rounded-lg print:bg-transparent"><TrendingDown className="w-6 h-6 text-red-600 print:text-black" /></div>
                                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full print:bg-transparent print:border print:border-black print:text-black">Egresos</span>
                                </div>
                                <p className="text-slate-600 text-sm font-medium">Total Gastos/Costos Periodo</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">${report.totalExpense.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                            </div>

                            <div className={`bg-gradient-to-br p-6 rounded-xl border shadow-sm print:shadow-none print:border-slate-300 ${report.balance >= 0 ? 'from-blue-50 to-indigo-50 border-blue-100' : 'from-orange-50 to-red-50 border-orange-100'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className={`${report.balance >= 0 ? 'bg-blue-100' : 'bg-orange-100'} p-2 rounded-lg print:bg-transparent`}>
                                        <DollarSign className={`w-6 h-6 ${report.balance >= 0 ? 'text-blue-600' : 'text-orange-600'} print:text-black`} />
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full print:bg-transparent print:border print:border-black print:text-black ${report.balance >= 0 ? 'text-blue-600 bg-blue-100' : 'text-orange-600 bg-orange-100'}`}>Balance Neto</span>
                                </div>
                                <p className="text-slate-600 text-sm font-medium">Utilidad / Pérdida</p>
                                <p className={`text-3xl font-bold mt-1 ${report.balance >= 0 ? 'text-blue-900' : 'text-orange-900'} print:text-black`}>
                                    ${report.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {report && (report.conciliacion.excludedIncome > 0 || report.conciliacion.excludedExpense > 0) && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm mt-6">
                                <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-3">
                                    <AlertCircle className="w-4 h-4" /> Conciliación (Fondos de Terceros / Pasivos)
                                </h4>
                                <p className="text-xs text-amber-800 mb-4">
                                    El sistema ha excluido estas cifras de los ingresos/gastos operativos porque pertenecen a cuentas de terceros (Pasivos),
                                    lo cual es correcto para obtener tu utilidad real.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white p-3 rounded border border-amber-100 flex justify-between">
                                        <span className="text-xs font-bold text-slate-600">Fondos Recibidos (No Ingresos):</span>
                                        <span className="font-mono font-bold text-amber-700">${report.conciliacion.excludedIncome.toLocaleString('es-ES')}</span>
                                    </div>
                                    <div className="bg-white p-3 rounded border border-amber-100 flex justify-between">
                                        <span className="text-xs font-bold text-slate-600">Fondos Entregados (No Gastos):</span>
                                        <span className="font-mono font-bold text-amber-700">${report.conciliacion.excludedExpense.toLocaleString('es-ES')}</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        <div className="pt-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">Estado de Resultados (Por Categoría Contable)</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-green-600" /> Clasificación de Ingresos</h4>
                                    </div>
                                    <div className="divide-y">
                                        {report.incomeByCategory.length > 0 ? report.incomeByCategory.map((item, i) => (
                                            <div key={i} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                                <div className="flex items-center">
                                                    <div className="w-2 h-2 rounded-full bg-green-400 mr-3 print:hidden"></div>
                                                    <span className="text-sm font-medium text-slate-700 uppercase">{item.name}</span>
                                                </div>
                                                <span className="font-bold text-slate-900">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : <div className="p-6 text-center text-slate-400 text-sm">No hubo ingresos.</div>}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><TrendingDown className="w-4 h-4 mr-2 text-red-600" /> Clasificación de Egresos</h4>
                                    </div>
                                    <div className="divide-y">
                                        {report.expenseByCategory.length > 0 ? report.expenseByCategory.map((item, i) => (
                                            <div key={i} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                                <div className="flex items-center">
                                                    <div className="w-2 h-2 rounded-full bg-red-400 mr-3 print:hidden"></div>
                                                    <span className="text-sm font-medium text-slate-700 uppercase">{item.name}</span>
                                                </div>
                                                <span className="font-bold text-slate-900">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : <div className="p-6 text-center text-slate-400 text-sm">No hubo egresos.</div>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">Flujo de Efectivo (Afectación a Cajas y Bancos)</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><Wallet className="w-4 h-4 mr-2 text-blue-600" /> Dinero Recibido En</h4>
                                    </div>
                                    <div className="divide-y">
                                        {report.incomeByDestination.length > 0 ? report.incomeByDestination.map((item, i) => (
                                            <div key={i} className="p-3 flex justify-between items-center">
                                                <span className="text-sm text-slate-600">{item.name}</span>
                                                <span className="font-semibold text-slate-800">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : <div className="p-4 text-center text-slate-400 text-sm">Sin entradas.</div>}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><Landmark className="w-4 h-4 mr-2 text-orange-600" /> Dinero Pagado Desde</h4>
                                    </div>
                                    <div className="divide-y">
                                        {report.expenseByDestination.length > 0 ? report.expenseByDestination.map((item, i) => (
                                            <div key={i} className="p-3 flex justify-between items-center">
                                                <span className="text-sm text-slate-600">{item.name}</span>
                                                <span className="font-semibold text-slate-800">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : <div className="p-4 text-center text-slate-400 text-sm">Sin salidas.</div>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="hidden print:flex justify-between mt-24 pt-12">
                            <div className="w-64 border-t border-black text-center pt-2">
                                <p className="font-bold text-sm">Elaborado por:</p>
                                <p className="text-xs text-gray-600 mt-1">Firma / Sello</p>
                            </div>
                            <div className="w-64 border-t border-black text-center pt-2">
                                <p className="font-bold text-sm">Revisado / Aprobado por:</p>
                                <p className="text-xs text-gray-600 mt-1">Firma / Sello</p>
                            </div>
                        </div>

                    </motion.div>
                )}
            </div>
        </>
    );
}

export default BookClosings;