import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
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
    AlertCircle,
    ArrowUpRight,
    Lock,
    Unlock,
    ShieldAlert,
    FileCheck
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
    const [bankAccounts] = useCompanyData('bankAccounts');
    const [cashAccounts] = useCompanyData('cash_accounts');
    const { toast } = useToast();

    // --- NUEVOS ESTADOS PARA EL CIERRE ANUAL ---
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [confirmWord, setConfirmWord] = useState('');
    const [annualAudit, setAnnualAudit] = useState(null);

    const availableYears = React.useMemo(() => {
        const years = new Set((transactions || []).map(t => new Date(t.date).getFullYear()));
        const current = new Date().getFullYear();
        years.add(current);
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions]);

    // --- LÓGICA DE ESTADO DEL AÑO (Abierto/Cerrado) ---
    const yearTransactions = React.useMemo(() => {
        return (transactions || []).filter(t => new Date(t.date).getFullYear() === parseInt(selectedYear));
    }, [transactions, selectedYear]);

    // Verificamos si ya existe un asiento de cierre para este año
    const isYearClosed = React.useMemo(() => {
        return yearTransactions.some(t => 
            t.description?.toUpperCase().includes(`CIERRE FISCAL ${selectedYear}`) || 
            t.isClosingEntry === true
        );
    }, [yearTransactions, selectedYear]);

    // Validar si hay borradores (Pre-flight check)
    const hasDrafts = React.useMemo(() => {
        return yearTransactions.some(t => ['borrador', 'pendiente'].includes(t.status?.toLowerCase()));
    }, [yearTransactions]);


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

        allRelevant.sort((a, b) => new Date(a.date) - new Date(b.date));

        let totalIncome = 0;
        let totalExpense = 0;
        let tercerosIn = 0;
        let tercerosOut = 0;
        let capitalizacion = 0;

        const incomeMap = {};
        const expenseMap = {};

        const monthlySummary = Array.from({ length: 12 }, (_, i) => ({
            mes: months[i].toUpperCase(),
            ingresos: 0,
            gastos: 0,
            utilidad: 0
        }));

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
                const drPrefix = drCode.charAt(0);
                const crPrefix = crCode.charAt(0);

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

                if (drPrefix === '1' && !drCode.startsWith('11') && !drCode.startsWith('1295')) {
                    capitalizacion += amount;
                }
                if (crPrefix === '1' && !crCode.startsWith('11') && !crCode.startsWith('1295')) {
                    capitalizacion -= amount;
                }
                return;
            }

            const accountObj = (accounts || []).find(a => a.name === t.category);
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

        const flowIn = {};
        const flowOut = {};

        const isCashOrBank = (destStr) => {
            if (!destStr) return true;
            const [id, name] = destStr.split('|');
            if (id === 'caja_principal' || id === '11201501' || id === '12950501') return true;
            if (cashAccounts && cashAccounts.some(c => c.id === id)) return true;
            if (bankAccounts && bankAccounts.some(b => b.id === id)) return true;
            const upperName = (name || id || '').toUpperCase();
            if (upperName.includes('CAJA') || upperName.includes('COOPERATIVA') || upperName.includes('BANCO')) return true;
            return false;
        };

        allRelevant.forEach(t => {
            const amount = parseFloat(t.amount || 0);

            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                const drName = (t.debitAccount.name || '').toUpperCase();
                const crName = (t.creditAccount.name || '').toUpperCase();

                if (drCode.startsWith('11') || drCode.startsWith('1295') || drName.includes('CAJA') || drName.includes('COOPERATIVA')) {
                    flowIn[drName] = (flowIn[drName] || 0) + amount;
                }
                if (crCode.startsWith('11') || crCode.startsWith('1295') || crName.includes('CAJA') || crName.includes('COOPERATIVA')) {
                    flowOut[crName] = (flowOut[crName] || 0) + amount;
                }
                return;
            }

            const extractTargetName = (str) => {
                if (!str) return 'CAJA PRINCIPAL';
                const parts = str.split('|');
                let name = (parts[1] || parts[0]).toUpperCase();
                if (name === 'CAJA_PRINCIPAL' || parts[0] === 'caja_principal') return 'CAJA PRINCIPAL';
                if (name === '11201501' || parts[0] === '11201501') return 'COOPERATIVA FRATERNIDAD SACERDOTAL';
                return name;
            };

            if (isCashOrBank(t.destination)) {
                const destName = extractTargetName(t.destination);
                
                if (t.isInternalTransfer) {
                    if (t.type === 'expense') flowOut[`${destName} (Transferencia)`] = (flowOut[`${destName} (Transferencia)`] || 0) + amount;
                    else if (t.type === 'income') flowIn[`${destName} (Transferencia)`] = (flowIn[`${destName} (Transferencia)`] || 0) + amount;
                } else {
                    if (t.type === 'income') flowIn[destName] = (flowIn[destName] || 0) + amount;
                    else if (t.type === 'expense') flowOut[destName] = (flowOut[destName] || 0) + amount;
                }
            }
        });

        const exportTransactions = allRelevant.filter(t => !t.isInternalTransfer || (t.isInternalTransfer && t.category !== 'Transferencia Interna'));

        setReport({
            period: { start, end },
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            monthlySummary,
            incomeByCategory: sortMap(incomeMap),
            expenseByCategory: sortMap(expenseMap),
            incomeByDestination: sortMap(flowIn),
            expenseByDestination: sortMap(flowOut),
            transactions: exportTransactions,
            conciliacion: { tercerosIn, tercerosOut, capitalizacion }
        });

        toast({ title: "Cierre Generado", description: "Movimientos detallados y procesados correctamente." });
    };

    // --- LÓGICA DE EJECUCIÓN DEL CIERRE ANUAL ---
    const executeAnnualClose = () => {
        if (confirmWord !== 'CERRAR') return;

        // Paso 1: Pre-flight checks
        if (hasDrafts) {
            toast({ variant: 'destructive', title: "Operación Bloqueada", description: "Existen comprobantes en estado Borrador o Pendiente para este año." });
            setShowCloseModal(false);
            return;
        }

        const relevant = yearTransactions.filter(t => !['eliminado', 'anulado', 'cancelado'].includes(t.status?.toLowerCase()));
        
        let totalIncome = 0;
        let totalExpense = 0;

        // Paso 2: Simulación del Resultado
        relevant.forEach(t => {
            if (t.debitAccount && t.creditAccount && String(t.id).endsWith('-inc')) return;
            const amount = parseFloat(t.amount || 0);

            if (t.debitAccount && t.creditAccount) {
                const drPrefix = String(t.debitAccount.code || '').charAt(0);
                const crPrefix = String(t.creditAccount.code || '').charAt(0);
                if (crPrefix === '4') totalIncome += amount;
                if (['5', '6', '7', '4'].includes(drPrefix)) totalExpense += amount;
            } else {
                let prefix = '0';
                const accountObj = (accounts || []).find(a => a.name === t.category);
                if (accountObj) prefix = String(accountObj.number).charAt(0);
                else prefix = t.type === 'income' ? '4' : '5';

                if (!t.isInternalTransfer) {
                    if (prefix === '4') {
                        if (t.type === 'income') totalIncome += amount;
                        else totalExpense += amount;
                    } else if (['5', '6', '7'].includes(prefix)) {
                        totalExpense += amount;
                    }
                }
            }
        });

        const utilidad = totalIncome - totalExpense;

        // Pasos 3, 4 y 5: Construcción del Payload para el Backend
        const closingPayload = {
            year: selectedYear,
            voucherNumber: `CE-${selectedYear}`,
            date: `${selectedYear}-12-31T23:59:59`,
            ingresosCancelados: totalIncome,
            gastosCancelados: totalExpense,
            resultadoEjercicio: utilidad,
            cuentaPatrimonio: utilidad >= 0 ? '360505 (Utilidad)' : '361005 (Pérdida)',
            status: 'CERRADO'
        };

        /* 
          ===============================================================
          AQUÍ DEBES LLAMAR A TU API (BACKEND/SUPABASE) PARA GUARDAR EL ASIENTO 
          Y BLOQUEAR LA BASE DE DATOS (MIDDLEWARE).
          Ejemplo:
          await api.post('/api/cierre-anual', closingPayload);
          ===============================================================
        */

        setAnnualAudit(closingPayload);
        setShowCloseModal(false);
        setConfirmWord('');
        
        toast({ 
            title: "Cierre Anual Exitoso", 
            description: `Se han cancelado las cuentas de resultado y se bloqueó el año ${selectedYear}.` 
        });
    };


    const handleExport = () => {
        if (!report) return;

        const detailData = report.transactions.map(t => {
            const dateObj = new Date(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);

            let destName = t.destination ? t.destination.split('|')[1] || t.destination.split('|')[0] : 'N/A';
            if (destName === 'caja_principal') destName = 'Caja Principal';

            let accCat = t.category;
            if (t.debitAccount && t.creditAccount) {
                accCat = t.type === 'income' ? t.creditAccount.name : t.debitAccount.name;
            }

            return {
                'Comprobante': t.voucherNumber || '-',
                'Fecha': format(adjustedDate, 'dd/MM/yyyy'),
                'Tipo': t.type === 'income' ? 'Ingreso' : 'Egreso',
                'Categoría Contable': accCat || 'Sin Categoría',
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

        const printWindow = window.open('', '_blank', 'width=900,height=800');
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

        const hasConciliacion = report.conciliacion.tercerosIn > 0 || report.conciliacion.tercerosOut > 0 || report.conciliacion.capitalizacion > 0;
        const saldoNetoTerceros = report.conciliacion.tercerosIn - report.conciliacion.tercerosOut;

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
    td { padding: 5px 6px !important; border: 1px solid #e2e8f0; font-size: 10px !important; text-transform: uppercase; }
    .signatures { margin-top: 35px; display: flex; justify-content: space-between; padding: 0 40px; page-break-inside: avoid; }
    .sig-block { width: 40%; text-align: center; }
    .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11px; font-weight: bold; }
</style>
            </head>
            <body>
                <div class="header">
                    <h1>${activeCompany?.name || 'PARROQUIA PADRE MISERICORDIOSO'}</h1>
                    <p>NIT: ${activeCompany?.doc || '802012765'}</p>
                    <p>${activeCompany?.address || 'CRA 9G # 77 - 42'} - Tel: ${activeCompany?.phone || '3167630763'}</p>
                </div>
                
                <div class="title">ACTA DE CIERRE CONTABLE</div>
                <p class="period">Periodo: ${formattedStart} al ${formattedEnd}</p>

                <div class="summary-box">
                    <div class="summary-item">
                        <div class="summary-label">Total Ingresos Operativos</div>
                        <div class="summary-value" style="color: #16a34a;">$${report.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Total Gastos Operativos</div>
                        <div class="summary-value" style="color: #dc2626;">$${report.totalExpense.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Utilidad / Pérdida</div>
                        <div class="summary-value" style="color: #2563eb;">$${report.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>
        
        <div class="section-title">Resumen Mensual</div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f1f5f9; color: #000; font-weight: bold;">MES</th>
                            <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f1f5f9; color: #000; font-weight: bold;">INGRESOS</th>
                            <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f1f5f9; color: #000; font-weight: bold;">GASTOS</th>
                            <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f1f5f9; color: #000; font-weight: bold;">UTILIDAD DEL MES</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${report.monthlySummary.map(m => `
                            <tr>
                                <td style="border: 1px solid #000; padding: 6px; font-weight: normal; font-size: 11px;">${m.mes}</td>
                                <td style="border: 1px solid #000; padding: 6px; font-size: 11px;">$ ${m.ingresos.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</td>
                                <td style="border: 1px solid #000; padding: 6px; font-size: 11px;">$ ${m.gastos.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</td>
                                <td style="border: 1px solid #000; padding: 6px; font-size: 11px;">$ ${m.utilidad.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</td>
                            </tr>
                        `).join('')}
                        <tr style="background-color: #f8fafc;">
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">TOTAL</td>
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">$ ${report.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</td>
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">$ ${report.totalExpense.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</td>
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">$ ${report.balance.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="section-title">1. Estado de Resultados (Por Concepto Operativo)</div>
                <div class="grid-2">
                    <div class="col">
                        <table>
                            <thead><tr><th>Ingresos Clasificados</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.incomeByCategory)}</tbody>
                        </table>
                    </div>
                    <div class="col">
                        <table>
                            <thead><tr><th>Gastos Clasificados</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.expenseByCategory)}</tbody>
                        </table>
                    </div>
                </div>

                <div class="section-title">2. Flujo de Efectivo Real (Entradas y Salidas de Caja/Bancos)</div>
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

                ${hasConciliacion ? `
                <div class="section-title">3. Conciliación (Capitalizaciones y Terceros)</div>
                <div style="font-size: 10px; color: #475569; margin-bottom: 5px;">Estos valores representan inversiones en el patrimonio o administración de pasivos. No afectan la utilidad de la parroquia.</div>
                <table style="width: 100%; margin-bottom: 15px;">
                    <tbody>
                        ${report.conciliacion.capitalizacion > 0 ? `<tr><td style="font-weight: bold; background-color: #ecfdf5;">Capitalización de Activos (Anticipos, Obras, Equipos):</td><td style="text-align: right; font-weight: bold; background-color: #ecfdf5; width: 35%;">$${report.conciliacion.capitalizacion.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${report.conciliacion.tercerosIn > 0 ? `<tr><td style="font-weight: bold; background-color: #fffbeb;">Fondos de Terceros Recibidos (Cuentas por Pagar creadas):</td><td style="text-align: right; font-weight: bold; background-color: #fffbeb; width: 35%;">$${report.conciliacion.tercerosIn.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${report.conciliacion.tercerosOut > 0 ? `<tr><td style="font-weight: bold; background-color: #fffbeb;">Fondos de Terceros Pagados (Deudas Canceladas a la DIAN/Terceros):</td><td style="text-align: right; font-weight: bold; background-color: #fffbeb; width: 35%;">$${report.conciliacion.tercerosOut.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        ${(report.conciliacion.tercerosIn > 0 || report.conciliacion.tercerosOut > 0) ? `<tr><td style="font-weight: bold; background-color: #fef3c7; color: #92400e;">Saldo Pendiente (Deuda Viva del Periodo):</td><td style="text-align: right; font-weight: bold; background-color: #fef3c7; color: #92400e; width: 35%;">$${saldoNetoTerceros.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                    </tbody>
                </table>
                ` : ''}

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

            {/* --- MODAL DE CONFIRMACIÓN CRÍTICA (Tailwind Puro, cero fallos de importación) --- */}
            <AnimatePresence>
                {showCloseModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-red-200 overflow-hidden"
                        >
                            <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
                                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                                    <ShieldAlert className="w-8 h-8" />
                                </div>
                                <h2 className="text-xl font-bold text-red-900 mb-2">¡Atención! Operación Crítica</h2>
                                <p className="text-sm text-red-700">
                                    Esta operación cancelará las cuentas de resultado e iniciará el nuevo año fiscal de forma irreversible. Se bloquearán los comprobantes del año {selectedYear}.
                                </p>
                            </div>
                            
                            <div className="p-6">
                                <Label className="text-slate-700 mb-2 block">
                                    Para confirmar, escriba la palabra <strong className="text-red-600 font-bold select-none">CERRAR</strong>
                                </Label>
                                <input 
                                    type="text" 
                                    value={confirmWord}
                                    onChange={(e) => setConfirmWord(e.target.value)}
                                    placeholder="Escriba CERRAR"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors uppercase font-bold text-center tracking-widest"
                                />
                                
                                <div className="flex gap-3 mt-6">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => { setShowCloseModal(false); setConfirmWord(''); }} 
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button 
                                        onClick={executeAnnualClose} 
                                        disabled={confirmWord !== 'CERRAR'}
                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                                    >
                                        Sí, Ejecutar Cierre
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="space-y-6 max-w-7xl mx-auto relative z-10">
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
                                onClick={() => { setActiveTab(tab.id); setAnnualAudit(null); }}
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
                            <div className="flex-1 flex flex-col md:flex-row gap-4 items-end justify-between">
                                <div className="space-y-2 flex-1 min-w-[200px]">
                                    <Label>Año Fiscal</Label>
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                {/* --- INDICADORES Y BOTONERA DE CIERRE ANUAL --- */}
                                <div className="flex flex-wrap items-center gap-4 pb-1">
                                    {isYearClosed ? (
                                        <div className="flex items-center text-sm font-bold text-red-700 bg-red-100 border border-red-200 px-4 py-2 rounded-lg">
                                            <Lock className="w-4 h-4 mr-2" /> Año Cerrado
                                        </div>
                                    ) : (
                                        <div className="flex items-center text-sm font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-lg">
                                            <Unlock className="w-4 h-4 mr-2" /> Año Abierto
                                        </div>
                                    )}
                                    
                                    <Button 
                                        onClick={() => setShowCloseModal(true)} 
                                        disabled={isYearClosed}
                                        className="bg-slate-900 hover:bg-black text-white min-w-[220px]"
                                    >
                                        <BookOpen className="w-4 h-4 mr-2" /> Ejecutar Asiento de Cierre Anual
                                    </Button>
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

                        <Button onClick={generateReport} className="bg-blue-600 hover:bg-blue-700 min-w-[140px]">
                            <PieChart className="w-4 h-4 mr-2" /> Calcular Informe
                        </Button>
                    </div>
                </motion.div>

                {/* --- VISOR DE AUDITORÍA POST-CIERRE --- */}
                {annualAudit && activeTab === 'year' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-6 pb-6 border-b">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 flex items-center">
                                    <FileCheck className="w-6 h-6 mr-2 text-green-600" /> Auditoría de Cierre Fiscal {annualAudit.year}
                                </h2>
                                <p className="text-slate-500 mt-1">Comprobante generado: <strong>{annualAudit.voucherNumber}</strong></p>
                            </div>
                            <span className="bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                {annualAudit.status}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-slate-50 p-5 rounded-lg border">
                                <p className="text-sm text-slate-500 font-medium mb-1">Total Ingresos Cancelados (Clase 4)</p>
                                <p className="text-2xl font-bold text-slate-800">${annualAudit.ingresosCancelados.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-slate-50 p-5 rounded-lg border">
                                <p className="text-sm text-slate-500 font-medium mb-1">Total Gastos Cancelados (Clases 5, 6, 7)</p>
                                <p className="text-2xl font-bold text-slate-800">${annualAudit.gastosCancelados.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className={`p-5 rounded-lg border ${annualAudit.resultadoEjercicio >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                                <p className="text-sm font-medium mb-1 flex items-center justify-between">
                                    <span className={annualAudit.resultadoEjercicio >= 0 ? 'text-blue-700' : 'text-red-700'}>Resultado a Patrimonio</span>
                                    <span className="text-xs opacity-70">Cta: {annualAudit.cuentaPatrimonio}</span>
                                </p>
                                <p className={`text-2xl font-bold ${annualAudit.resultadoEjercicio >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
                                    ${annualAudit.resultadoEjercicio.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button variant="outline" className="border-slate-300" onClick={() => toast({ description: "La descarga de PDF de Auditoría estará disponible en breve." })}>
                                <Download className="w-4 h-4 mr-2" /> Descargar Acta de Cierre (PDF)
                            </Button>
                        </div>
                    </motion.div>
                )}


                {/* RESTO DEL CÓDIGO (EL REPORTE DE FLUJO/P&L ORIGINAL) */}
                {report && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="space-y-6 pb-12">
                        {/* Se mantiene intacta la vista del reporte anterior */}
                        <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 bg-white p-6 rounded-xl border shadow-sm">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 uppercase">Informe de Resultados</h1>
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
                                <p className="text-slate-600 text-sm font-medium">Total Ingresos Operativos</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">${report.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                            </div>

                            <div className="bg-gradient-to-br from-red-50 to-pink-50 p-6 rounded-xl border border-red-100 shadow-sm print:shadow-none print:border-slate-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="bg-red-100 p-2 rounded-lg print:bg-transparent"><TrendingDown className="w-6 h-6 text-red-600 print:text-black" /></div>
                                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full print:bg-transparent print:border print:border-black print:text-black">Egresos</span>
                                </div>
                                <p className="text-slate-600 text-sm font-medium">Total Gastos Operativos</p>
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

                        {report && (report.conciliacion.tercerosIn > 0 || report.conciliacion.tercerosOut > 0 || report.conciliacion.capitalizacion > 0) && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                
                                {report.conciliacion.capitalizacion > 0 && (
                                    <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-200 shadow-sm">
                                        <h4 className="font-bold text-emerald-900 flex items-center gap-2 mb-2">
                                            <ArrowUpRight className="w-4 h-4" /> Inversión y Capitalización
                                        </h4>
                                        <p className="text-xs text-emerald-800 mb-4">
                                            Dinero ejecutado en Activos Fijos, Construcciones o Anticipos a Contratistas. Aumentan tu patrimonio.
                                        </p>
                                        <div className="bg-white p-3 rounded border border-emerald-100 flex justify-between">
                                            <span className="text-sm font-bold text-slate-600">Total Capitalizado:</span>
                                            <span className="font-mono font-bold text-emerald-700">${report.conciliacion.capitalizacion.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}

                                {(report.conciliacion.tercerosIn > 0 || report.conciliacion.tercerosOut > 0) && (
                                    <div className="bg-amber-50 p-5 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                                                <AlertCircle className="w-4 h-4" /> Fondos de Terceros (Pasivos)
                                            </h4>
                                            <p className="text-xs text-amber-800 mb-4">
                                                Dinero donde tu caja es solo un puente (ej. retenciones, recaudos) o deudas que creaste/pagaste.
                                            </p>
                                            <div className="space-y-2">
                                                {report.conciliacion.tercerosIn > 0 && (
                                                    <div className="bg-white p-2.5 rounded border border-amber-100 flex justify-between">
                                                        <span className="text-xs font-bold text-slate-600">Recibido (CxP a pagar):</span>
                                                        <span className="font-mono font-bold text-amber-700">${report.conciliacion.tercerosIn.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                )}
                                                {report.conciliacion.tercerosOut > 0 && (
                                                    <div className="bg-white p-2.5 rounded border border-amber-100 flex justify-between">
                                                        <span className="text-xs font-bold text-slate-600">Pagado (Deuda Cancelada a la DIAN/Terceros):</span>
                                                        <span className="font-mono font-bold text-amber-700">${report.conciliacion.tercerosOut.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="mt-4 pt-3 border-t border-amber-200 flex justify-between">
                                            <span className="text-sm font-bold text-amber-900">Saldo Pendiente (Deuda Viva):</span>
                                            <span className="font-mono font-bold text-amber-900 text-lg">
                                                ${(report.conciliacion.tercerosIn - report.conciliacion.tercerosOut).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                )}

                            </motion.div>
                        )}

                        <div className="pt-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">Estado de Resultados (Por Categoría Operativa)</h3>
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
                                        )) : <div className="p-6 text-center text-slate-400 text-sm">No hubo ingresos operativos.</div>}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><TrendingDown className="w-4 h-4 mr-2 text-red-600" /> Clasificación de Gastos</h4>
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
                                        )) : <div className="p-6 text-center text-slate-400 text-sm">No hubo gastos operativos.</div>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">Flujo de Efectivo Real (Cajas y Bancos)</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><Wallet className="w-4 h-4 mr-2 text-blue-600" /> Dinero Recibido En</h4>
                                    </div>
                                    <div className="divide-y">
                                        {report.incomeByDestination.length > 0 ? report.incomeByDestination.map((item, i) => (
                                            <div key={i} className="p-3 flex justify-between items-center">
                                                <span className="text-sm font-medium text-slate-600">{item.name}</span>
                                                <span className="font-semibold text-slate-800">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : <div className="p-4 text-center text-slate-400 text-sm">Sin entradas a caja o bancos.</div>}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center"><Landmark className="w-4 h-4 mr-2 text-orange-600" /> Dinero Pagado Desde</h4>
                                    </div>
                                    <div className="divide-y">
                                        {report.expenseByDestination.length > 0 ? report.expenseByDestination.map((item, i) => (
                                            <div key={i} className="p-3 flex justify-between items-center">
                                                <span className="text-sm font-medium text-slate-600">{item.name}</span>
                                                <span className="font-semibold text-slate-800">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )) : <div className="p-4 text-center text-slate-400 text-sm">Sin salidas de caja o bancos.</div>}
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