import { parseAccountingDate, getAccountingYear, accountingDateValue } from '@/lib/accountingDate';
import { getMonthlyClosing, isFiscalYearClosed } from '@/lib/accountingPeriod';
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
    AlertCircle,
    ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportToExcel, exportProfessionalTable, exportProfessionalWorkbook } from '@/lib/excel';
import { expandTransactionsByAllocation, getTransactionCategoryLabel } from '@/lib/transactionAllocations';
import { calculateLiquidityBalances } from '@/lib/financialMovements';
import { getOpenItemDate, getOutstandingBalance } from '@/lib/outstandingBalance';
import { useCompanyData } from '@/hooks/useCompanyData';
import { createPrintTarget } from '@/lib/nativePrint';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';
import { getCompanyScopeIds } from '@/lib/companyHierarchy';
import { summarizePatrimonialAtCutoff, PATRIMONIAL_ASSET_TYPES } from '@/lib/patrimonialAssets';
import { resolveAccountForTransaction, getRecordCompanyId } from '@/lib/accountScope';
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

const hasClosingValue = value => Number.isFinite(Number(value)) && Math.abs(Number(value)) >= 0.005;
const closingAccountDisplay = (code, name, fallback = 'CUENTA CONTABLE') => {
    const cleanCode = String(code || '').trim();
    const cleanName = String(name || fallback).replace(/_/g, ' ').trim().toUpperCase();
    return cleanCode ? `${cleanCode} · ${cleanName}` : cleanName;
};

const BookClosings = () => {
    const { activeCompany, isConsolidated, companies } = useCompany();
    const { canEdit, isReadOnly } = usePermission();
    const companyScopeIds = React.useMemo(
        () => getCompanyScopeIds(companies, activeCompany?.id),
        [companies, activeCompany?.id]
    );

    const isRelevantCompany = React.useCallback((item) => {
        if (!item) return false;
        const cid = item.company_id || item._companyId || item.companyId;
        if (!isConsolidated) return !cid || String(cid) === String(activeCompany?.id);
        return !cid || companyScopeIds.has(String(cid));
    }, [activeCompany, isConsolidated, companyScopeIds]);
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
    const [initialBalance] = useCompanyData('initialBalance');
    const [fixedAssets] = useCompanyData('fixedAssets');
    const [realEstates] = useCompanyData('realEstates');
    const [accountsReceivable] = useCompanyData('accountsReceivable');
    const [accountsPayable] = useCompanyData('accountsPayable');
    const [inventory] = useCompanyData('inventory');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    const [fiscalYears, saveFiscalYears] = useCompanyData('fiscal_years');
    const { toast } = useToast();
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [signatures, setSignatures] = useState({ elaborado: '', revisado: '' });
    
    const [isExecutiveReportModalOpen, setIsExecutiveReportModalOpen] = useState(false);
    const [executiveData, setExecutiveData] = useState({
        destinatarioCuria: 'Monseñor',
        cargoDestinatario: 'Vicario General y Moderador de la Curia',
        logrosPastorales: '',
        proximosProyectos: '',
        notasAclaratorias: ''
    });


    const availableYears = React.useMemo(() => {
        const years = new Set((transactions || []).filter(isRelevantCompany).map(t => parseAccountingDate(t.date).getFullYear()));
        const current = new Date().getFullYear();
        years.add(current);
        return Array.from(years).sort((a, b) => b - a).map(String);
    }, [transactions, isRelevantCompany]);

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
                // En el mes en curso el cierre llega solo hasta hoy, nunca al último día futuro del mes.
                if (
                    parseInt(selectedYear) === new Date().getFullYear() &&
                    parseInt(selectedMonth) === new Date().getMonth() &&
                    end > new Date()
                ) {
                    end = new Date();
                }
                break;
            case 'year':
                const yearDate = new Date(parseInt(selectedYear), 0, 1);
                start = startOfYear(yearDate);
                end = endOfYear(yearDate);
                // En el año en curso el cierre llega solo hasta hoy, nunca hasta meses futuros.
                if (parseInt(selectedYear) === new Date().getFullYear() && end > new Date()) {
                    end = new Date();
                }
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

        const allRelevantBase = transactions.filter(t => {
            if (!isRelevantCompany(t)) return false;
            const dateObj = parseAccountingDate(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            const isValidStatus = !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(String(t.status || '').toLowerCase());
            return isWithinInterval(adjustedDate, { start, end }) && isValidStatus;
        });
        const allRelevant = expandTransactionsByAllocation(allRelevantBase);

        allRelevant.sort((a, b) => accountingDateValue(a.date) - accountingDateValue(b.date));

        let totalIncome = 0;
        let totalExpense = 0;
        let tercerosIn = 0;
        let tercerosOut = 0;
        let capitalizacion = 0;

        const incomeMap = {};
        const expenseMap = {};
        const tercerosInMap = {};
        const tercerosOutMap = {};

        // 1. INTELIGENCIA PARA LA TABLA MENSUAL
        const monthlySummary = Array.from({ length: 12 }, (_, i) => ({
            mes: months[i].toUpperCase(),
            ingresos: 0,
            gastos: 0,
            utilidad: 0
        }));

        // 2. CLASIFICACIÓN DEL ESTADO DE RESULTADOS (P&L) Y CONCILIACIONES
        allRelevant.forEach(t => {
            if (t.debitAccount && t.creditAccount && String(t.id).endsWith('-inc')) return;

            const amount = parseFloat(t.amount || 0);
            
            const dateObj = parseAccountingDate(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            const mIndex = adjustedDate.getMonth();

            // Identificamos explícitamente si es un puente o cruce
            const catUpper = String(t.category || '').toUpperCase();
            const drUpper = String(t.debitAccount?.name || '').toUpperCase();
            const crUpper = String(t.creditAccount?.name || '').toUpperCase();
            
            const isPuenteOCruce = 
                t.isInternalTransfer || 
                catUpper.includes('PUENTE') || catUpper.includes('CRUCE') ||
                drUpper.includes('PUENTE') || drUpper.includes('CRUCE') ||
                crUpper.includes('PUENTE') || crUpper.includes('CRUCE');

            // A. Asiento manual de Partida Doble
            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                const drPrefix = drCode.charAt(0);
                const crPrefix = crCode.charAt(0);

                // BLOQUEO: Solo suma a Ingresos/Gastos Operativos si NO es puente/cruce
                if (!isPuenteOCruce) {
                    if (crPrefix === '4') { 
                        totalIncome += amount;
                        const incomeLabel = closingAccountDisplay(crCode, t.creditAccount.name || t.category, 'INGRESOS');
                        incomeMap[incomeLabel] = (incomeMap[incomeLabel] || 0) + amount;
                        monthlySummary[mIndex].ingresos += amount;
                    }
                    
                    if (['5', '6', '7', '4'].includes(drPrefix)) { 
                        totalExpense += amount;
                        const baseExpenseName = drPrefix === '4'
                            ? `${t.debitAccount.name || t.category || 'INGRESOS'} (SALIDA/DÉBITO)`
                            : (t.debitAccount.name || t.category || 'GASTOS');
                        const expenseName = closingAccountDisplay(drCode, baseExpenseName, 'GASTOS');
                        expenseMap[expenseName] = (expenseMap[expenseName] || 0) + amount; 
                        monthlySummary[mIndex].gastos += amount;
                    }
                }

                if (crPrefix === '2') {
                    tercerosIn += amount;
                    const name = closingAccountDisplay(crCode, t.creditAccount?.name, 'FONDO DE TERCEROS');
                    tercerosInMap[name] = (tercerosInMap[name] || 0) + amount;
                }
                if (drPrefix === '2') {
                    tercerosOut += amount;
                    const name = closingAccountDisplay(drCode, t.debitAccount?.name, 'FONDO DE TERCEROS');
                    tercerosOutMap[name] = (tercerosOutMap[name] || 0) + amount;
                }

                if (drPrefix === '1' && !drCode.startsWith('11') && !drCode.startsWith('1295')) {
                    capitalizacion += amount;
                }
                if (crPrefix === '1' && !crCode.startsWith('11') && !crCode.startsWith('1295')) {
                    capitalizacion -= amount;
                }
                return;
            }

            // B. Transacciones Normales o Cruces Internos Automáticos
            const accountObj = resolveAccountForTransaction(accounts || [], t);
            let prefix = '0';
            
            if (accountObj) {
                prefix = String(accountObj.number).charAt(0);
            } else if (t.category === 'Transferencia Interna' || isPuenteOCruce) {
                prefix = '0'; // Lo forzamos a 0 para que no caiga en las reglas de 4 o 5
            } else {
                prefix = t.type === 'income' ? '4' : '5';
            }
            
            // BLOQUEO: Solo suma a Ingresos/Gastos Operativos si NO es puente/cruce
            if (!isPuenteOCruce) {
                const accountLabel = closingAccountDisplay(accountObj?.number, accountObj?.name || t.category, t.type === 'income' ? 'INGRESOS' : 'GASTOS');
                if (prefix === '4') {
                    if (t.type === 'income') {
                        totalIncome += amount;
                        incomeMap[accountLabel] = (incomeMap[accountLabel] || 0) + amount;
                        monthlySummary[mIndex].ingresos += amount;
                    } else {
                        totalExpense += amount;
                        expenseMap[accountLabel] = (expenseMap[accountLabel] || 0) + amount;
                        monthlySummary[mIndex].gastos += amount;
                    }
                } else if (['5', '6', '7'].includes(prefix)) {
                    totalExpense += amount;
                    expenseMap[accountLabel] = (expenseMap[accountLabel] || 0) + amount;
                    monthlySummary[mIndex].gastos += amount;
                }
            }

            if (prefix === '2' || isPuenteOCruce) {
                const accName = closingAccountDisplay(
                    accountObj?.number,
                    accountObj?.name || t.category,
                    isPuenteOCruce ? 'MOVIMIENTO PUENTE' : 'FONDO DE TERCEROS'
                );
                if (t.type === 'income') {
                    tercerosIn += amount;
                    tercerosInMap[accName] = (tercerosInMap[accName] || 0) + amount;
                }
                if (t.type === 'expense') {
                    tercerosOut += amount;
                    tercerosOutMap[accName] = (tercerosOutMap[accName] || 0) + amount;
                }
            } else if (prefix === '1' || prefix === '3') {
                const accNum = accountObj ? String(accountObj.number) : '';
                if (!accNum.startsWith('11') && !accNum.startsWith('1295')) {
                    if (t.type === 'expense' && !isPuenteOCruce) capitalizacion += amount;
                    if (t.type === 'income' && !isPuenteOCruce) capitalizacion -= amount;
                }
            }
        });

        monthlySummary.forEach(m => m.utilidad = m.ingresos - m.gastos);
        const activeMonthlySummary = monthlySummary.filter(m =>
            hasClosingValue(m.ingresos) || hasClosingValue(m.gastos) || hasClosingValue(m.utilidad)
        );

        const sortMap = (map) => Object.entries(map)
            .map(([name, total]) => ({ name, total }))
            .filter(item => hasClosingValue(item.total))
            .sort((a, b) => b.total - a.total);

        // Agrupar Terceros Neta
        const tercerosList = [];
        const allTercerosNames = new Set([...Object.keys(tercerosInMap), ...Object.keys(tercerosOutMap)]);
        
        allTercerosNames.forEach(name => {
            const inAmt = tercerosInMap[name] || 0;
            const outAmt = tercerosOutMap[name] || 0;
            const displayAmt = Math.max(inAmt, outAmt); 
            if (hasClosingValue(displayAmt)) {
                tercerosList.push({ name: name.toUpperCase(), total: displayAmt });
            }
        });
        tercerosList.sort((a, b) => b.total - a.total);

        // 3. CÁLCULO LIMPIO DEL FLUJO DE EFECTIVO
        const flowIn = {};
        const flowOut = {};

        const isCashOrBank = (destStr) => {
            if (!destStr) return true;
            const [id, name] = destStr.split('|');
            if (id === 'caja_principal' || id === '11201501' || id === '12950501') return true;
            if (cashAccounts && cashAccounts.some(c => String(c.id) === String(id) || String(c.accountingCode || '') === String(id))) return true;
            if (bankAccounts && bankAccounts.some(b => String(b.id) === String(id) || String(b.accountingCode || '') === String(id))) return true;
            const upperName = (name || id || '').toUpperCase();
            if (upperName.includes('CAJA') || upperName.includes('COOPERATIVA') || upperName.includes('BANCO')) return true;
            return false;
        };

        const resolveLiquidAccountLabel = (destStr, fallback = 'CAJA PRINCIPAL') => {
            if (!destStr) {
                const mainCash = (accounts || []).find(a => String(a.number || '') === '11050501')
                    || (accounts || []).find(a => String(a.number || '').startsWith('1105'));
                return closingAccountDisplay(mainCash?.number || '11050501', mainCash?.name || fallback, fallback);
            }

            const [rawId, rawName] = String(destStr).split('|');
            const id = String(rawId || '').trim();
            const name = String(rawName || '').trim();

            if (id === 'caja_principal') {
                const mainCash = (accounts || []).find(a => String(a.number || '') === '11050501')
                    || (accounts || []).find(a => String(a.number || '').startsWith('1105'));
                return closingAccountDisplay(mainCash?.number || '11050501', mainCash?.name || name || fallback, fallback);
            }

            const bank = (bankAccounts || []).find(item =>
                String(item.id) === id || String(item.accountingCode || '') === id
            );
            if (bank) {
                return closingAccountDisplay(
                    bank.accountingCode,
                    bank.accountingConcept || bank.bankName || name,
                    'CUENTA BANCARIA'
                );
            }

            const cash = (cashAccounts || []).find(item =>
                String(item.id) === id || String(item.accountingCode || '') === id
            );
            if (cash) {
                return closingAccountDisplay(
                    cash.accountingCode,
                    cash.accountingConcept || cash.name || name,
                    'CAJA'
                );
            }

            const puc = (accounts || []).find(item =>
                String(item.id) === id || String(item.number || '') === id || String(item.name || '').toUpperCase() === name.toUpperCase()
            );
            if (puc) return closingAccountDisplay(puc.number, puc.name, name || fallback);

            if (id === '12950501') {
                return closingAccountDisplay('12950501', name || 'APORTES ORDINARIOS', 'APORTES ORDINARIOS');
            }

            return closingAccountDisplay(id, name || id || fallback, fallback);
        };

        allRelevant.forEach(t => {
            const amount = parseFloat(t.amount || 0);

            // Identificar explícitamente si es una transferencia interna
            const catUpper = String(t.category || '').toUpperCase();
            const isPureTransfer = t.isInternalTransfer || catUpper === 'TRANSFERENCIA INTERNA' || catUpper.includes('TRANSFERENCIA');
            const transferSuffix = isPureTransfer ? ' (TRANS. INTERNA)' : '';

            // A. Asientos Manuales
            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                const drName = (t.debitAccount.name || '').toUpperCase();
                const crName = (t.creditAccount.name || '').toUpperCase();

                // Entrada a Banco/Caja
                if (drCode.startsWith('11') || drCode.startsWith('1295') || drName.includes('CAJA') || drName.includes('COOPERATIVA')) {
                    const liquidLabel = closingAccountDisplay(drCode, drName, 'CUENTA DE LIQUIDEZ');
                    let nameKey = `${liquidLabel}${transferSuffix}`;
                    if (crCode.startsWith('2') && !isPureTransfer) {
                        nameKey = `${liquidLabel} (PUENTE: ${closingAccountDisplay(crCode, crName, 'FONDO DE TERCEROS')})`;
                    }
                    flowIn[nameKey] = (flowIn[nameKey] || 0) + amount;
                }
                
                // Salida de Banco/Caja
                if (crCode.startsWith('11') || crCode.startsWith('1295') || crName.includes('CAJA') || crName.includes('COOPERATIVA')) {
                    const liquidLabel = closingAccountDisplay(crCode, crName, 'CUENTA DE LIQUIDEZ');
                    let nameKey = `${liquidLabel}${transferSuffix}`;
                    if (drCode.startsWith('2') && !isPureTransfer) {
                        nameKey = `${liquidLabel} (PUENTE: ${closingAccountDisplay(drCode, drName, 'FONDO DE TERCEROS')})`;
                    }
                    flowOut[nameKey] = (flowOut[nameKey] || 0) + amount;
                }
                return;
            }

            // B. Transacciones Automáticas 
            const extractTargetNameWithPuente = (tObj) => {
                const baseDestName = resolveLiquidAccountLabel(tObj.destination);

                // Si es transferencia, le agregamos el sufijo y evitamos lógica de puentes
                if (isPureTransfer) return `${baseDestName}${transferSuffix}`;

                // Identificamos si es un movimiento de terceros
                const accObj = resolveAccountForTransaction(accounts || [], tObj);
                if (accObj && String(accObj.number).startsWith('2')) {
                    const terceroName = closingAccountDisplay(accObj.number, accObj.name || tObj.category, 'FONDO DE TERCEROS');
                    return `${baseDestName} (PUENTE: ${terceroName})`;
                }

                return baseDestName;
            };

            const scopedCategoryAccount = resolveAccountForTransaction(accounts || [], t);
            if (isCashOrBank(t.destination) || (scopedCategoryAccount && String(scopedCategoryAccount.number).startsWith('2'))) {
                const destName = extractTargetNameWithPuente(t);
                
                if (t.type === 'income') {
                    flowIn[destName] = (flowIn[destName] || 0) + amount;
                } else if (t.type === 'expense') {
                    flowOut[destName] = (flowOut[destName] || 0) + amount;
                }
            }
        });

        const exportTransactions = allRelevantBase
            .filter(t => !t.isInternalTransfer || (t.isInternalTransfer && t.category !== 'Transferencia Interna'))
            .sort((a, b) => {
                const dateA = String(a.date || '').slice(0, 10);
                const dateB = String(b.date || '').slice(0, 10);
                const dateCompare = dateA.localeCompare(dateB);
                if (dateCompare !== 0) return dateCompare;

                const prefixA = String(a.voucherPrefix || '').toUpperCase();
                const prefixB = String(b.voucherPrefix || '').toUpperCase();
                const prefixCompare = prefixA.localeCompare(prefixB, 'es', { sensitivity: 'base' });
                if (prefixCompare !== 0) return prefixCompare;

                const numberA = Number.isFinite(Number(a.voucherNumber)) ? Number(a.voucherNumber) : Number.MAX_SAFE_INTEGER;
                const numberB = Number.isFinite(Number(b.voucherNumber)) ? Number(b.voucherNumber) : Number.MAX_SAFE_INTEGER;
                if (numberA !== numberB) return numberA - numberB;

                return String(a.id || '').localeCompare(String(b.id || ''));
            });

        setReport({
            period: { start, end },
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            monthlySummary: activeMonthlySummary,
            incomeByCategory: sortMap(incomeMap),
            expenseByCategory: sortMap(expenseMap),
            incomeByDestination: sortMap(flowIn),
            expenseByDestination: sortMap(flowOut),
            transactions: exportTransactions,
            conciliacion: { tercerosIn, tercerosOut, capitalizacion, tercerosList }
        });

        toast({ title: "Cierre Generado", description: "Movimientos detallados y procesados correctamente." });
    };

    const handleExport = () => {
        if (!report) return;

        const fileName = `Acta_Cierre_${format(report.period.start, 'yyyy-MM-dd')}_al_${format(report.period.end, 'yyyy-MM-dd')}`;
        const periodText = `DEL ${format(report.period.start, 'dd/MM/yyyy')} AL ${format(report.period.end, 'dd/MM/yyyy')}`;

        const summaryRows = [
            { Concepto: 'RESUMEN GENERAL', Ingresos: null, Gastos: null, Resultado: null, __style: 'section' },
            ...(hasClosingValue(report.totalIncome) ? [{
                Concepto: 'TOTAL INGRESOS OPERATIVOS',
                Ingresos: Number(report.totalIncome || 0),
                Gastos: null,
                Resultado: null,
                __style: 'subtotal'
            }] : []),
            ...(hasClosingValue(report.totalExpense) ? [{
                Concepto: 'TOTAL GASTOS OPERATIVOS',
                Ingresos: null,
                Gastos: Number(report.totalExpense || 0),
                Resultado: null,
                __style: 'subtotal'
            }] : []),
            { Concepto: 'UTILIDAD / PÉRDIDA DEL PERÍODO', Ingresos: null, Gastos: null, Resultado: Number(report.balance || 0), __style: 'total' },
            ...((report.monthlySummary || []).length > 0 ? [
                { Concepto: 'RESUMEN MENSUAL', Ingresos: null, Gastos: null, Resultado: null, __style: 'section' },
                ...(report.monthlySummary || []).map(item => ({
                    Concepto: item.mes,
                    Ingresos: hasClosingValue(item.ingresos) ? Number(item.ingresos) : null,
                    Gastos: hasClosingValue(item.gastos) ? Number(item.gastos) : null,
                    Resultado: hasClosingValue(item.utilidad) ? Number(item.utilidad) : null
                }))
            ] : [])
        ];

        const pnlRows = [
            ...((report.incomeByCategory || []).length > 0 ? [
                { Concepto: 'INGRESOS OPERACIONALES', Valor: null, __style: 'section' },
                ...(report.incomeByCategory || []).map(item => ({ Concepto: item.name, Valor: Number(item.total || 0) })),
                { Concepto: 'TOTAL INGRESOS', Valor: Number(report.totalIncome || 0), __style: 'total' },
            ] : []),
            ...((report.expenseByCategory || []).length > 0 ? [
                { Concepto: 'GASTOS OPERACIONALES', Valor: null, __style: 'section' },
                ...(report.expenseByCategory || []).map(item => ({ Concepto: item.name, Valor: Number(item.total || 0) })),
                { Concepto: 'TOTAL GASTOS', Valor: Number(report.totalExpense || 0), __style: 'subtotal' },
            ] : []),
            { Concepto: 'UTILIDAD / PÉRDIDA', Valor: Number(report.balance || 0), __style: 'total' }
        ];

        const netThirdParties = Number(report.conciliacion?.tercerosIn || 0) - Number(report.conciliacion?.tercerosOut || 0);
        const hasReconciliationRows =
            (report.conciliacion?.tercerosList || []).length > 0 ||
            hasClosingValue(report.conciliacion?.capitalizacion) ||
            hasClosingValue(netThirdParties);

        const cashRows = [
            ...((report.incomeByDestination || []).length > 0 ? [
                { Concepto: 'DINERO RECIBIDO EN', Entrada: null, Salida: null, __style: 'section' },
                ...(report.incomeByDestination || []).map(item => ({ Concepto: item.name, Entrada: Number(item.total || 0), Salida: null })),
            ] : []),
            ...((report.expenseByDestination || []).length > 0 ? [
                { Concepto: 'DINERO PAGADO DESDE', Entrada: null, Salida: null, __style: 'section' },
                ...(report.expenseByDestination || []).map(item => ({ Concepto: item.name, Entrada: null, Salida: Number(item.total || 0) })),
            ] : []),
            ...(hasReconciliationRows ? [
                { Concepto: 'CONCILIACIÓN: CAPITALIZACIONES Y TERCEROS', Entrada: null, Salida: null, __style: 'section' },
                ...(report.conciliacion?.tercerosList || []).map(item => ({
                    Concepto: item.name,
                    Entrada: Number(item.total || 0),
                    Salida: Number(item.total || 0)
                })),
                ...(hasClosingValue(report.conciliacion?.capitalizacion) ? [{
                    Concepto: 'CAPITALIZACIONES / TRASLADOS A INVERSIÓN',
                    Entrada: null,
                    Salida: Number(report.conciliacion?.capitalizacion || 0),
                    __style: 'subtotal'
                }] : []),
                ...(hasClosingValue(netThirdParties) ? [{
                    Concepto: 'SALDO PENDIENTE DE TERCEROS',
                    Entrada: Number(report.conciliacion?.tercerosIn || 0),
                    Salida: Number(report.conciliacion?.tercerosOut || 0),
                    __style: 'subtotal'
                }] : [])
            ] : [])
        ];

        const detailRows = (report.transactions || []).map(t => {
            const dateObj = parseAccountingDate(t.date);
            const userTimezoneOffset = dateObj.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(dateObj.getTime() + userTimezoneOffset);
            const amount = Number(t.amount || 0);
            const isInternalMovement = Boolean(t.isInternalTransfer || t.type === 'transfer');

            const parseAccountName = (value, fallback = '-') => {
                if (!value) return fallback;
                const parts = String(value).split('|');
                return (parts[1] || parts[0] || fallback).replace(/_/g, ' ').trim();
            };

            let movementAccount = parseAccountName(t.destination, 'Caja Principal');
            if (movementAccount.toLowerCase() === 'caja principal') movementAccount = 'Caja Principal';

            let sourceName = '-';
            let targetName = '-';

            if (isInternalMovement) {
                sourceName = parseAccountName(t.fromAccount, t.creditAccount?.name || 'Origen no identificado');
                targetName = parseAccountName(t.toAccount || t.destination, t.debitAccount?.name || 'Destino no identificado');
            } else if (t.type === 'income') {
                targetName = movementAccount;
            } else if (t.type === 'expense') {
                sourceName = movementAccount;
            } else if (t.debitAccount && t.creditAccount) {
                sourceName = t.creditAccount.name || '-';
                targetName = t.debitAccount.name || '-';
            }

            let accCat = getTransactionCategoryLabel(t);
            if (t.debitAccount && t.creditAccount) {
                accCat = t.type === 'income' ? t.creditAccount.name : t.debitAccount.name;
            }

            const voucher = t.voucherNumber
                ? `${t.voucherPrefix || (t.type === 'income' ? 'I' : (t.type === 'expense' ? 'E' : 'T'))}-${String(t.voucherNumber).padStart(4, '0')}`
                : '-';

            return {
                Fecha: format(adjustedDate, 'dd/MM/yyyy'),
                Comprobante: voucher,
                Tipo: isInternalMovement ? 'Traslado Interno' : (t.type === 'income' ? 'Ingreso' : (t.type === 'expense' ? 'Egreso' : 'Movimiento')),
                'Categoría Contable': accCat || 'Sin Categoría',
                Descripción: t.description || '',
                'Cuenta / Origen': String(sourceName || '-').toUpperCase(),
                'Cuenta / Destino': String(targetName || '-').toUpperCase(),
                'Movimiento Interno': isInternalMovement ? amount : null,
                Ingreso: !isInternalMovement && t.type === 'income' ? amount : null,
                Egreso: !isInternalMovement && t.type === 'expense' ? amount : null,
                _sortDate: String(t.date || '').slice(0, 10),
                _sortPrefix: String(t.voucherPrefix || (t.type === 'income' ? 'I' : (t.type === 'expense' ? 'E' : 'T'))).toUpperCase(),
                _sortNumber: Number.isFinite(Number(t.voucherNumber)) ? Number(t.voucherNumber) : Number.MAX_SAFE_INTEGER
            };
        }).sort((a, b) => {
            const dateCompare = a._sortDate.localeCompare(b._sortDate);
            if (dateCompare !== 0) return dateCompare;

            const prefixCompare = a._sortPrefix.localeCompare(b._sortPrefix, 'es', { sensitivity: 'base' });
            if (prefixCompare !== 0) return prefixCompare;

            return a._sortNumber - b._sortNumber;
        });

        const totalInternalMovements = detailRows.reduce(
            (sum, row) => sum + (Number(row['Movimiento Interno']) || 0),
            0
        );

        exportProfessionalWorkbook({
            fileName,
            companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
            nit: activeCompany?.doc || '',
            title: 'ACTA DE CIERRE CONTABLE',
            period: periodText,
            sheets: [
                {
                    name: 'Resumen',
                    title: 'ACTA DE CIERRE CONTABLE - RESUMEN',
                    columns: [
                        { key: 'Concepto', label: 'CONCEPTO / MES', width: 38, type: 'text' },
                        { key: 'Ingresos', label: 'INGRESOS', width: 18, type: 'currency' },
                        { key: 'Gastos', label: 'GASTOS', width: 18, type: 'currency' },
                        { key: 'Resultado', label: 'RESULTADO', width: 18, type: 'currency' }
                    ],
                    rows: summaryRows,
                    notes: ['La utilidad del período excluye movimientos puente de terceros y traslados internos.']
                },
                {
                    name: 'Estado Resultados',
                    title: 'ESTADO DE RESULTADOS DEL CIERRE',
                    columns: [
                        { key: 'Concepto', label: 'CONCEPTO', width: 55, type: 'text' },
                        { key: 'Valor', label: 'VALOR (COP)', width: 20, type: 'currency' }
                    ],
                    rows: pnlRows
                },
                {
                    name: 'Flujo Conciliación',
                    title: 'FLUJO REAL Y CONCILIACIÓN',
                    columns: [
                        { key: 'Concepto', label: 'CONCEPTO', width: 58, type: 'text' },
                        { key: 'Entrada', label: 'ENTRADA', width: 19, type: 'currency' },
                        { key: 'Salida', label: 'SALIDA', width: 19, type: 'currency' }
                    ],
                    rows: cashRows,
                    notes: ['Los recursos de terceros se muestran como movimientos de conciliación y no afectan la utilidad.']
                },
                {
                    name: 'Detalle',
                    title: 'DETALLE DE MOVIMIENTOS DEL CIERRE',
                    orientation: 'landscape',
                    columns: [
                        { key: 'Fecha', label: 'FECHA', width: 13, type: 'text' },
                        { key: 'Comprobante', label: 'COMP.', width: 13, type: 'text' },
                        { key: 'Tipo', label: 'TIPO', width: 16, type: 'text' },
                        { key: 'Categoría Contable', label: 'CATEGORÍA CONTABLE', width: 30, type: 'text' },
                        { key: 'Descripción', label: 'DESCRIPCIÓN', width: 42, type: 'text' },
                        { key: 'Cuenta / Origen', label: 'CUENTA / ORIGEN', width: 28, type: 'text' },
                        { key: 'Cuenta / Destino', label: 'CUENTA / DESTINO', width: 28, type: 'text' },
                        { key: 'Movimiento Interno', label: 'TRASLADO INTERNO', width: 19, type: 'currency' },
                        { key: 'Ingreso', label: 'INGRESO', width: 18, type: 'currency' },
                        { key: 'Egreso', label: 'EGRESO', width: 18, type: 'currency' }
                    ],
                    rows: detailRows,
                    summaryRows: [
                        {
                            Descripción: 'TOTALES OPERATIVOS DEL PERÍODO',
                            Ingreso: Number(report.totalIncome || 0),
                            Egreso: Number(report.totalExpense || 0),
                            __style: 'total'
                        },
                        {
                            Descripción: 'TRASLADOS INTERNOS (NO AFECTAN RESULTADO)',
                            'Movimiento Interno': totalInternalMovements,
                            __style: 'subtotal'
                        }
                    ]
                }
            ]
        });
        toast({ title: "Excel profesional generado", description: "El Acta de Cierre se exportó como expediente contable de varias hojas." });
    };

    const handlePrint = () => {
        if (!report) return;
        setIsPrintModalOpen(true);
    };

    const executePrint = () => {
        setIsPrintModalOpen(false);
        const printWindow = createPrintTarget('width=900,height=800');
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

        const saldoNetoTerceros = report.conciliacion.tercerosIn - report.conciliacion.tercerosOut;
        const hasConciliacion =
            (report.conciliacion?.tercerosList || []).length > 0 ||
            hasClosingValue(report.conciliacion?.capitalizacion) ||
            hasClosingValue(saldoNetoTerceros);

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
                    
                    /* Estilos para las firmas dinámicas */
                    .signatures { margin-top: 35px; display: flex; justify-content: space-between; padding: 0 40px; page-break-inside: avoid; }
                    .sig-block { width: 40%; text-align: center; }
                    .sig-name { font-size: 12px; font-weight: bold; margin-bottom: 2px; min-height: 16px; text-transform: uppercase; }
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
        
                ${(report.monthlySummary || []).length > 0 ? `
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
                                <td style="border: 1px solid #000; padding: 6px; font-size: 11px;">${hasClosingValue(m.ingresos) ? `$ ${m.ingresos.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : ''}</td>
                                <td style="border: 1px solid #000; padding: 6px; font-size: 11px;">${hasClosingValue(m.gastos) ? `$ ${m.gastos.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : ''}</td>
                                <td style="border: 1px solid #000; padding: 6px; font-size: 11px;">${hasClosingValue(m.utilidad) ? `$ ${m.utilidad.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : ''}</td>
                            </tr>
                        `).join('')}
                        <tr style="background-color: #f8fafc;">
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">TOTAL</td>
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">${hasClosingValue(report.totalIncome) ? `$ ${report.totalIncome.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : ''}</td>
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">${hasClosingValue(report.totalExpense) ? `$ ${report.totalExpense.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : ''}</td>
                            <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11px;">${hasClosingValue(report.balance) ? `$ ${report.balance.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : ''}</td>
                        </tr>
                    </tbody>
                </table>
                ` : ''}

                ${((report.incomeByCategory || []).length > 0 || (report.expenseByCategory || []).length > 0) ? `
                <div class="section-title">1. Estado de Resultados (Por Cuenta PUC)</div>
                <div class="grid-2">
                    ${(report.incomeByCategory || []).length > 0 ? `
                    <div class="col">
                        <table>
                            <thead><tr><th>Ingresos Clasificados</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.incomeByCategory)}</tbody>
                        </table>
                    </div>` : ''}
                    ${(report.expenseByCategory || []).length > 0 ? `
                    <div class="col">
                        <table>
                            <thead><tr><th>Gastos Clasificados</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.expenseByCategory)}</tbody>
                        </table>
                    </div>` : ''}
                </div>
                ` : ''}

                ${((report.incomeByDestination || []).length > 0 || (report.expenseByDestination || []).length > 0) ? `
                <div class="section-title">2. Flujo de Efectivo Real (Entradas y Salidas)</div>
                <div class="grid-2">
                    ${(report.incomeByDestination || []).length > 0 ? `
                    <div class="col">
                        <table>
                            <thead><tr><th>Dinero Recibido En</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.incomeByDestination)}</tbody>
                        </table>
                    </div>` : ''}
                    ${(report.expenseByDestination || []).length > 0 ? `
                    <div class="col">
                        <table>
                            <thead><tr><th>Dinero Pagado Desde</th><th style="text-align: right; width: 35%;">Monto</th></tr></thead>
                            <tbody>${generateTableRows(report.expenseByDestination)}</tbody>
                        </table>
                    </div>` : ''}
                </div>
                ` : ''}

                ${hasConciliacion ? `
                <div class="section-title">3. Conciliación (Capitalizaciones y Terceros)</div>
                <div style="font-size: 10px; color: #475569; margin-bottom: 5px;">Estos valores representan inversiones en el patrimonio o administración de pasivos. No afectan la utilidad de la parroquia.</div>
                <table style="width: 100%; margin-bottom: 15px;">
                    <tbody>
                        ${hasClosingValue(report.conciliacion?.capitalizacion) ? `<tr><td style="font-weight: bold; background-color: #ecfdf5;">Capitalización de Activos (Anticipos, Obras, Equipos):</td><td style="text-align: right; font-weight: bold; background-color: #ecfdf5; width: 35%;">$${report.conciliacion.capitalizacion.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                        
                        ${report.conciliacion.tercerosList.map(item => `
                            <tr>
                                <td style="font-weight: bold; background-color: #fffbeb;">${item.name}:</td>
                                <td style="text-align: right; font-weight: bold; background-color: #fffbeb; width: 35%;">$${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}

                        ${hasClosingValue(saldoNetoTerceros) ? `<tr><td style="font-weight: bold; background-color: #fef3c7; color: #92400e;">Saldo Pendiente (Deuda Viva del Periodo):</td><td style="text-align: right; font-weight: bold; background-color: #fef3c7; color: #92400e; width: 35%;">$${saldoNetoTerceros.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                    </tbody>
                </table>
                ` : ''}

                <div class="signatures">
                    <div class="sig-block">
                        <div class="sig-name">${signatures.elaborado}</div>
                        <div class="sig-line">Elaborado por:</div>
                    </div>
                    <div class="sig-block">
                        <div class="sig-name">${signatures.revisado}</div>
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

            // Función auxiliar para renderizar las tablas analíticas del informe
    const generateReportTableRows = (data) => {
        if (!data || data.length === 0) return `<tr><td colspan="2" style="text-align: center; color: #64748b; font-style: italic; padding: 6px;">No hay registros en el periodo</td></tr>`;
        return data.map(item => `
            <tr>
                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-size: 10pt; text-transform: uppercase;">${item.name}</td>
                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 10.5pt; font-weight: bold;">$${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
            </tr>
        `).join('');
    };

            const getSafeYear = (dateStr) => {
        if (!dateStr) return 0;
        if (typeof dateStr === 'string' && dateStr.includes('-')) return parseInt(dateStr.split('-')[0], 10);
        return new Date(dateStr).getFullYear();
    };

    const handleExportExecutiveReportExcel = () => {
        if (!report) return;

        const { start, end } = report.period;
        const periodText = `DEL ${format(start, 'dd/MM/yyyy')} AL ${format(end, 'dd/MM/yyyy')}`;
        const netThirdParties = Number(report.conciliacion?.tercerosIn || 0) - Number(report.conciliacion?.tercerosOut || 0);

        const executiveRows = [
            ...(hasClosingValue(report.totalIncome) ? [{
                Indicador: 'INGRESOS OPERATIVOS',
                Valor: Number(report.totalIncome || 0),
                __style: 'subtotal'
            }] : []),
            ...(hasClosingValue(report.totalExpense) ? [{
                Indicador: 'GASTOS OPERATIVOS',
                Valor: Number(report.totalExpense || 0),
                __style: 'subtotal'
            }] : []),
            { Indicador: 'UTILIDAD / PÉRDIDA', Valor: Number(report.balance || 0), __style: 'total' },
            ...((report.incomeByCategory || []).length > 0 ? [{
                Indicador: 'PRINCIPAL FUENTE DE INGRESO',
                Detalle: report.incomeByCategory[0].name,
                Valor: Number(report.incomeByCategory[0].total || 0)
            }] : []),
            ...((report.expenseByCategory || []).length > 0 ? [{
                Indicador: 'PRINCIPAL RUBRO DE GASTO',
                Detalle: report.expenseByCategory[0].name,
                Valor: Number(report.expenseByCategory[0].total || 0)
            }] : []),
            ...(hasClosingValue(report.conciliacion?.tercerosIn) ? [{
                Indicador: 'RECURSOS DE TERCEROS RECIBIDOS',
                Valor: Number(report.conciliacion?.tercerosIn || 0)
            }] : []),
            ...(hasClosingValue(report.conciliacion?.tercerosOut) ? [{
                Indicador: 'RECURSOS DE TERCEROS ENTREGADOS',
                Valor: Number(report.conciliacion?.tercerosOut || 0)
            }] : []),
            ...(hasClosingValue(netThirdParties) ? [{
                Indicador: 'SALDO NETO DE TERCEROS',
                Valor: netThirdParties,
                __style: 'subtotal'
            }] : []),
            ...(hasClosingValue(report.conciliacion?.capitalizacion) ? [{
                Indicador: 'CAPITALIZACIONES / TRASLADOS A INVERSIÓN',
                Valor: Number(report.conciliacion?.capitalizacion || 0)
            }] : [])
        ];

        const incomeRows = (report.incomeByCategory || [])
            .filter(item => hasClosingValue(item.total))
            .map(item => ({
                Concepto: item.name,
                Valor: Number(item.total || 0)
            }));
        const expenseRows = (report.expenseByCategory || [])
            .filter(item => hasClosingValue(item.total))
            .map(item => ({
                Concepto: item.name,
                Valor: Number(item.total || 0)
            }));
        const cashRows = [
            ...((report.incomeByDestination || []).length > 0 ? [
                { Concepto: 'ENTRADAS REALES', Entrada: null, Salida: null, __style: 'section' },
                ...(report.incomeByDestination || []).map(item => ({ Concepto: item.name, Entrada: Number(item.total || 0), Salida: null }))
            ] : []),
            ...((report.expenseByDestination || []).length > 0 ? [
                { Concepto: 'SALIDAS REALES', Entrada: null, Salida: null, __style: 'section' },
                ...(report.expenseByDestination || []).map(item => ({ Concepto: item.name, Entrada: null, Salida: Number(item.total || 0) }))
            ] : [])
        ];

        exportProfessionalWorkbook({
            fileName: `Informe_Curia_${format(start, 'yyyy-MM-dd')}_al_${format(end, 'yyyy-MM-dd')}`,
            companyName: activeCompany?.name || 'ENTIDAD CONTABLE',
            nit: activeCompany?.doc || '',
            title: 'INFORME EJECUTIVO A LA CURIA',
            period: periodText,
            sheets: [
                {
                    name: 'Resumen Ejecutivo',
                    title: 'INFORME EJECUTIVO A LA CURIA',
                    columns: [
                        { key: 'Indicador', label: 'INDICADOR', width: 42, type: 'text' },
                        { key: 'Detalle', label: 'DETALLE', width: 46, type: 'text' },
                        { key: 'Valor', label: 'VALOR (COP)', width: 20, type: 'currency' }
                    ],
                    rows: executiveRows,
                    notes: [
                        'El resultado operativo excluye movimientos puente de terceros y traslados internos.',
                        'El saldo neto de terceros debe revisarse con los respectivos soportes y remisiones.'
                    ]
                },
                ...(incomeRows.length > 0 ? [{
                    name: 'Ingresos',
                    title: 'INGRESOS POR CUENTA PUC',
                    columns: [
                        { key: 'Concepto', label: 'CUENTA / CONCEPTO', width: 55, type: 'text' },
                        { key: 'Valor', label: 'VALOR (COP)', width: 20, type: 'currency' }
                    ],
                    rows: incomeRows,
                    summaryRows: [{ Concepto: 'TOTAL INGRESOS', Valor: Number(report.totalIncome || 0), __style: 'total' }]
                }] : []),
                ...(expenseRows.length > 0 ? [{
                    name: 'Gastos',
                    title: 'GASTOS POR CUENTA PUC',
                    columns: [
                        { key: 'Concepto', label: 'CUENTA / CONCEPTO', width: 55, type: 'text' },
                        { key: 'Valor', label: 'VALOR (COP)', width: 20, type: 'currency' }
                    ],
                    rows: expenseRows,
                    summaryRows: [{ Concepto: 'TOTAL GASTOS', Valor: Number(report.totalExpense || 0), __style: 'total' }]
                }] : []),
                ...(cashRows.length > 0 ? [{
                    name: 'Flujo Real',
                    title: 'MOVIMIENTOS REALES DE EFECTIVO',
                    columns: [
                        { key: 'Concepto', label: 'CUENTA / DESTINO', width: 58, type: 'text' },
                        { key: 'Entrada', label: 'ENTRADA', width: 19, type: 'currency' },
                        { key: 'Salida', label: 'SALIDA', width: 19, type: 'currency' }
                    ],
                    rows: cashRows
                }] : [])
            ]
        });
        toast({ title: 'Excel profesional generado', description: 'Informe ejecutivo para la Curia exportado correctamente.' });
    };

    const executeExecutiveReportPrint = () => {
        setIsExecutiveReportModalOpen(false);
        const printWindow = createPrintTarget('width=950,height=850');
        const { start, end } = report.period;
        const formattedStart = format(start, "d 'de' MMMM 'de' yyyy", { locale: es });
        const formattedEnd = format(end, "d 'de' MMMM 'de' yyyy", { locale: es });

        const saldoNetoTerceros = (report.conciliacion?.tercerosIn || 0) - (report.conciliacion?.tercerosOut || 0);
        const hasConciliacion =
            (report.conciliacion?.tercerosList || []).length > 0 ||
            hasClosingValue(report.conciliacion?.capitalizacion) ||
            hasClosingValue(saldoNetoTerceros);
        
        // BALANCE GENERAL: esta sección replica la metodología contable de Reports.jsx
        // para que el Informe Ejecutivo utilice exactamente la misma fuente de saldos.
        const safeParseFloat = (value) => {
            const parsed = parseFloat(value);
            return Number.isNaN(parsed) ? 0 : parsed;
        };
        const endStr = format(end, 'yyyy-MM-dd');
        const currentYear = end.getFullYear();

        const baseValidTransactions = (transactions || []).filter(t =>
            isRelevantCompany(t) &&
            !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(String(t.status || '').toLowerCase())
        );
        const validTransactions = expandTransactionsByAllocation(baseValidTransactions);
        const bsTransactions = validTransactions.filter(t => {
            const tDate = t.date?.substring(0, 10) || '';
            return tDate <= endStr;
        });
        const allAccounts = Array.from(new Map((accounts || []).filter(a => a?.name).map(a => [`${getRecordCompanyId(a)}|${String(a.number || '').trim()}|${String(a.name).trim().toUpperCase()}`, a])).values());

        const getAccountCreationYear = (accountId, defaultDate) => {
            if (defaultDate && isValid(parseISO(defaultDate))) return getAccountingYear(defaultDate);
            const accountTransactions = validTransactions.filter(t =>
                t.destination?.startsWith(accountId) ||
                t.fromAccount?.startsWith(accountId) ||
                t.toAccount?.startsWith(accountId) ||
                (t.debitAccount && t.debitAccount.code === accountId) ||
                (t.creditAccount && t.creditAccount.code === accountId)
            );
            if (accountTransactions.length > 0) {
                const oldestDate = accountTransactions.reduce((min, t) => t.date < min ? t.date : min, accountTransactions[0].date);
                return getAccountingYear(oldestDate);
            }
            return currentYear;
        };

        const isAccountMatch = (targetId, accountIdOrString) => {
            if (!accountIdOrString) return false;
            if (accountIdOrString === targetId) return true;
            if (accountIdOrString.startsWith(`${targetId}|`)) return true;
            if (targetId === 'caja_principal' && accountIdOrString.toLowerCase().includes('caja principal')) return true;
            return false;
        };

        // Motor único de liquidez compartido con Balance, Dashboard y Tributarios.
        const liquidity = calculateLiquidityBalances({
            transactions: baseValidTransactions,
            initialBalances: initialBalance || [],
            bankAccounts: bankAccounts || [],
            cashAccounts: cashAccounts || [],
            accounts: allAccounts,
            cutoffDate: endStr,
        });

        const cajaPrincipalBalance = liquidity.mainCash;
        const totalBankBalances = liquidity.totalBanks;
        const totalInvestmentBalances = liquidity.investments;
        const customCashBalance = liquidity.totalCustomCash;

        let anticiposValue = 0;
        let construccionesValue = 0;
        let otherAssetsValue = 0;
        let otherLiabilitiesValue = 0;
        let legacyIntangiblesValue = 0;
        const isMasterIntangibleTransaction = t => Boolean(t?.isPatrimonialAsset || t?.isFixedAsset) && (
            t?.patrimonialAssetType === PATRIMONIAL_ASSET_TYPES.INTANGIBLE ||
            String(t?.fixedAssetAccountCode || '').startsWith('16')
        );

        bsTransactions.forEach(t => {
            const amount = safeParseFloat(t.amount);

            if (t.debitAccount && t.creditAccount) {
                if (String(t.id).endsWith('-inc')) return;
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');

                if (drCode.startsWith('1330')) anticiposValue += amount;
                else if (drCode.startsWith('1508')) construccionesValue += amount;
                else if (drCode.startsWith('16') && !isMasterIntangibleTransaction(t)) legacyIntangiblesValue += amount;
                else if (drCode.startsWith('1') && !drCode.startsWith('11') && !drCode.startsWith('1295') && !drCode.startsWith('1305') && !drCode.startsWith('14') && !drCode.startsWith('15')) otherAssetsValue += amount;
                else if (drCode.startsWith('2') && !drCode.startsWith('2305')) otherLiabilitiesValue -= amount;

                if (crCode.startsWith('1330')) anticiposValue -= amount;
                else if (crCode.startsWith('1508')) construccionesValue -= amount;
                else if (crCode.startsWith('16') && !isMasterIntangibleTransaction(t)) legacyIntangiblesValue -= amount;
                else if (crCode.startsWith('1') && !crCode.startsWith('11') && !crCode.startsWith('1295') && !crCode.startsWith('1305') && !crCode.startsWith('14') && !crCode.startsWith('15')) otherAssetsValue -= amount;
                else if (crCode.startsWith('2') && !crCode.startsWith('2305')) otherLiabilitiesValue += amount;
                return;
            }

            const acc = resolveAccountForTransaction(allAccounts, t);
            if (!acc) return;
            const num = String(acc.number);
            const assetImpact = t.type === 'expense' ? amount : -amount;
            const liabilityImpact = t.type === 'income' ? amount : -amount;

            if (num.startsWith('1330')) anticiposValue += assetImpact;
            else if (num.startsWith('1508')) construccionesValue += assetImpact;
            else if (num.startsWith('16') && !isMasterIntangibleTransaction(t)) legacyIntangiblesValue += assetImpact;
            else if (num.startsWith('1') && !num.startsWith('11') && !num.startsWith('1295') && !num.startsWith('1305') && !num.startsWith('14') && !num.startsWith('15')) otherAssetsValue += assetImpact;
            else if (num.startsWith('2') && !num.startsWith('2305')) otherLiabilitiesValue += liabilityImpact;
        });

        const totalCashBalance = liquidity.totalCash;
        const cajaGeneralValue = totalCashBalance + totalBankBalances + totalInvestmentBalances;

        const inventoryValue = (inventory || []).reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);
        const patrimonialSummary = summarizePatrimonialAtCutoff(
            fixedAssets || [],
            realEstates || [],
            endStr,
            baseValidTransactions
        );
        const manualFixedAssetsValue = patrimonialSummary.tangible.grossCost;
        const realEstatesValue = patrimonialSummary.realEstate.grossCost;
        const intangiblesValue = legacyIntangiblesValue + patrimonialSummary.intangible.grossCost;
        const totalDepreciacionInventario = patrimonialSummary.tangible.accumulatedDepreciation;
        const totalDepreciacionPropiedades = patrimonialSummary.realEstate.accumulatedDepreciation;
        const totalAmortizacionIntangibles = patrimonialSummary.intangible.accumulatedAmortization;
        const depreciacionAcumuladaValue = -Math.abs(totalDepreciacionInventario + totalDepreciacionPropiedades);
        const amortizacionAcumuladaValue = -Math.abs(totalAmortizacionIntangibles);
        const accountsReceivableValue = (accountsReceivable || []).reduce((sum, r) => {
            const rDate = getOpenItemDate(r);
            const rYear = rDate ? getSafeYear(rDate) : (r.year ? parseInt(r.year) : currentYear);
            if (rYear > currentYear) return sum;
            return sum + getOutstandingBalance(r, endStr);
        }, 0);
        const accountsPayableValue = (accountsPayable || []).reduce((sum, p) => {
            const pDate = getOpenItemDate(p);
            const pYear = pDate ? getSafeYear(pDate) : (p.year ? parseInt(p.year) : currentYear);
            if (pYear > currentYear) return sum;
            return sum + getOutstandingBalance(p, endStr);
        }, 0);

        const balanceNetProfit = report.balance;
        const totalActivoCorriente = cajaGeneralValue + accountsReceivableValue + anticiposValue + otherAssetsValue;
        const totalActivoNoCorriente = intangiblesValue + construccionesValue + realEstatesValue + manualFixedAssetsValue + inventoryValue + depreciacionAcumuladaValue + amortizacionAcumuladaValue;
        const totalAssets = totalActivoCorriente + totalActivoNoCorriente;
        const totalLiabilities = accountsPayableValue + otherLiabilitiesValue;
        const totalEquity = totalAssets - totalLiabilities;
        const retainedEquity = totalEquity - balanceNetProfit;

        const balanceGeneral = {
            assets: [
                { item: 'ACTIVO CORRIENTE', isBold: true },
                { item: '  Efectivo y Equivalentes', isBold: true },
                { item: '    Total Caja, Bancos y Aportes', amount: cajaGeneralValue, isSubtotal: true },
                { item: '      Caja Principal', amount: cajaPrincipalBalance },
                { item: '      Cuentas Bancarias', amount: totalBankBalances },
                { item: '      Aportes Ordinarios', amount: totalInvestmentBalances },
                { item: '  Cuentas por Cobrar', amount: accountsReceivableValue },
                { item: '  Anticipos a Proveedores', amount: anticiposValue },
                { item: '  Otros Activos Corrientes', amount: otherAssetsValue },
                { item: 'TOTAL ACTIVO CORRIENTE', amount: totalActivoCorriente, isSubtotal: true },
                { item: 'ACTIVO NO CORRIENTE', isBold: true },
                { item: '  Activos Intangibles (Licencias)', amount: intangiblesValue },
                { item: '  Construcciones en Curso', amount: construccionesValue },
                { item: '  Propiedades, Planta y Equipo', amount: realEstatesValue },
                { item: '  Activos Fijos (Oficina y Equipos)', amount: manualFixedAssetsValue },
                { item: '  Inventario', amount: inventoryValue },
                { item: '  Depreciación Acumulada (Tangibles e Inmuebles)', amount: depreciacionAcumuladaValue },
                { item: '  Amortización Acumulada de Intangibles', amount: amortizacionAcumuladaValue },
                { item: 'TOTAL ACTIVO NO CORRIENTE', amount: totalActivoNoCorriente, isSubtotal: true }
            ],
            liabilities: [
                { item: 'PASIVO', isBold: true },
                { item: '  Cuentas por Pagar', amount: accountsPayableValue },
                { item: '  Otros Pasivos (Fondos de Terceros)', amount: otherLiabilitiesValue }
            ],
            equity: [
                { item: 'PATRIMONIO', isBold: true },
                { item: '  Patrimonio Institucional (Inc. Utilidades Acum.)', amount: retainedEquity },
                { item: '  Utilidad del Ejercicio', amount: balanceNetProfit }
            ],
            totals: {
                assets: totalAssets,
                liabilities: totalLiabilities,
                equity: totalEquity,
                liabilitiesAndEquity: totalLiabilities + totalEquity
            }
        };

        const fmtMoney = (value) => Number(value || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const cuadre = Math.abs(balanceGeneral.totals.assets - balanceGeneral.totals.liabilitiesAndEquity) < 0.01;

        const mainCashAccount = allAccounts.find(account => String(account.number || '') === '11050501')
            || allAccounts.find(account => String(account.number || '').startsWith('1105'));
        const investmentAccount = allAccounts.find(account => String(account.number || '') === '12950501')
            || allAccounts.find(account => String(account.number || '').startsWith('1295'));

        const financialPositionRows = [
            ...(hasClosingValue(totalActivoCorriente) ? [
                `<tr><td>Activo corriente</td><td>$ ${fmtMoney(totalActivoCorriente)}</td></tr>`
            ] : []),
            ...(hasClosingValue(totalActivoNoCorriente) ? [
                `<tr><td>Activo no corriente</td><td>$ ${fmtMoney(totalActivoNoCorriente)}</td></tr>`
            ] : []),
            `<tr class="total"><td>Total activo</td><td>$ ${fmtMoney(balanceGeneral.totals.assets)}</td></tr>`,
            ...(hasClosingValue(balanceGeneral.totals.liabilities) ? [
                `<tr><td>Total pasivo</td><td>$ ${fmtMoney(balanceGeneral.totals.liabilities)}</td></tr>`
            ] : []),
            ...(hasClosingValue(retainedEquity) ? [
                `<tr><td>Patrimonio institucional</td><td>$ ${fmtMoney(retainedEquity)}</td></tr>`
            ] : []),
            ...(hasClosingValue(balanceNetProfit) ? [
                `<tr><td>Utilidad del ejercicio</td><td>$ ${fmtMoney(balanceNetProfit)}</td></tr>`
            ] : []),
            `<tr class="total"><td>Total pasivo + patrimonio</td><td>$ ${fmtMoney(balanceGeneral.totals.liabilitiesAndEquity)}</td></tr>`
        ].join('');

        const liquidityRows = [
            ...(hasClosingValue(cajaPrincipalBalance) ? [
                `<tr><td>${closingAccountDisplay(mainCashAccount?.number || '11050501', mainCashAccount?.name || 'CAJA PRINCIPAL')}</td><td>$ ${fmtMoney(cajaPrincipalBalance)}</td></tr>`
            ] : []),
            ...(cashAccounts || []).map(account => {
                const value = liquidity.customCash?.[String(account.id)] || 0;
                if (!hasClosingValue(value)) return '';
                return `<tr><td>${closingAccountDisplay(account.accountingCode, account.accountingConcept || account.name, 'CAJA')}</td><td>$ ${fmtMoney(value)}</td></tr>`;
            }).filter(Boolean),
            ...(bankAccounts || []).map(account => {
                const value = liquidity.banks?.[String(account.id)] || 0;
                if (!hasClosingValue(value)) return '';
                return `<tr><td>${closingAccountDisplay(account.accountingCode, account.accountingConcept || account.bankName, 'CUENTA BANCARIA')}</td><td>$ ${fmtMoney(value)}</td></tr>`;
            }).filter(Boolean),
            ...(hasClosingValue(totalInvestmentBalances) ? [
                `<tr><td>${closingAccountDisplay(investmentAccount?.number || '12950501', investmentAccount?.name || 'APORTES ORDINARIOS')}</td><td>$ ${fmtMoney(totalInvestmentBalances)}</td></tr>`
            ] : []),
            `<tr class="total"><td>Efectivo, bancos y aportes</td><td>$ ${fmtMoney(cajaGeneralValue)}</td></tr>`
        ].join('');

        const hasOtherCurrentDetail =
            hasClosingValue(accountsReceivableValue) ||
            hasClosingValue(anticiposValue) ||
            hasClosingValue(otherAssetsValue);

        const otherCurrentRows = [
            ...(hasClosingValue(accountsReceivableValue) ? [
                `<tr><td>Cuentas por cobrar</td><td>$ ${fmtMoney(accountsReceivableValue)}</td></tr>`
            ] : []),
            ...(hasClosingValue(anticiposValue) ? [
                `<tr><td>Anticipos a proveedores</td><td>$ ${fmtMoney(anticiposValue)}</td></tr>`
            ] : []),
            ...(hasClosingValue(otherAssetsValue) ? [
                `<tr><td>Otros activos corrientes</td><td>$ ${fmtMoney(otherAssetsValue)}</td></tr>`
            ] : []),
            ...(hasOtherCurrentDetail ? [
                `<tr class="total"><td>Activo corriente</td><td>$ ${fmtMoney(totalActivoCorriente)}</td></tr>`
            ] : [])
        ].join('');

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Informe Ejecutivo - ${activeCompany?.name || 'Parroquia'}</title>
                <style>
                    @page { size: letter; margin: 17mm 18mm; }
                    * { box-sizing: border-box; }
                    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.4; }
                    .header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #1f2937; }
                    .header h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15pt; letter-spacing: .3px; text-transform: uppercase; }
                    .header p { margin: 2px 0; font-size: 9pt; color: #4b5563; }
                    .meta { display: flex; justify-content: space-between; margin: 13px 0 16px; font-size: 9.5pt; }
                    .title { text-align: center; margin: 0 0 6px; font-family: Georgia, 'Times New Roman', serif; font-size: 14pt; font-weight: 700; text-transform: uppercase; }
                    .subtitle { text-align: center; margin: 0 0 18px; color: #4b5563; font-size: 9.5pt; }
                    .recipient { margin-bottom: 15px; line-height: 1.35; }
                    .recipient strong { text-transform: uppercase; }
                    .intro { text-align: justify; margin: 0 0 16px; }
                    .section { margin-top: 15px; page-break-inside: avoid; }
                    .section-title { margin: 0 0 7px; padding-bottom: 4px; border-bottom: 1px solid #9ca3af; font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border-bottom: 1px solid #d1d5db; padding: 6px 7px; }
                    th { text-align: left; font-size: 8.5pt; text-transform: uppercase; color: #4b5563; }
                    td:last-child, th:last-child { text-align: right; }
                    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0 3px; }
                    .metric { border: 1px solid #d1d5db; padding: 8px; text-align: center; }
                    .metric-label { font-size: 8pt; text-transform: uppercase; color: #6b7280; }
                    .metric-value { margin-top: 3px; font-size: 12.5pt; font-weight: 700; }
                    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
                    .total td { font-weight: 700; border-top: 1.5px solid #374151; }
                    .balance-ok { margin-top: 8px; padding: 7px 9px; border: 1px solid #9ca3af; font-size: 9pt; font-weight: 700; text-align: center; letter-spacing: .2px; }
                    .third-party { margin-top: 15px; border: 1px solid #d7dde5; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
                    .third-party-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #f6f8fb; border-bottom: 1px solid #d7dde5; }
                    .third-party-title { margin: 0; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .35px; color: #243447; }
                    .third-party-caption { margin: 0; font-size: 7.8pt; color: #6b7280; }
                    .third-party table { margin: 0; }
                    .third-party th { background: #ffffff; padding: 6px 8px; border-bottom: 1px solid #d7dde5; }
                    .third-party td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
                    .third-party td:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
                    .third-party .pending td { border-top: 1.5px solid #374151; border-bottom: 0; font-weight: 700; }
                    .note { margin-top: 14px; font-size: 9pt; color: #4b5563; }
                    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 55px; margin-top: 38px; page-break-inside: avoid; }
                    .sig { text-align: center; padding-top: 24px; border-top: 1px solid #111827; font-size: 8.5pt; }
                    .sig-name { font-weight: 700; font-size: 9pt; margin-bottom: 2px; }
                    .footer { margin-top: 18px; padding-top: 7px; border-top: 1px solid #d1d5db; text-align: center; color: #6b7280; font-size: 7.5pt; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${activeCompany?.name || 'PARROQUIA SANTA CRUZ'}</h1>
                    <p>NIT: ${activeCompany?.doc || '900316227'}</p>
                    ${activeCompany?.address ? `<p>${activeCompany.address}${activeCompany?.phone ? ` · Tel. ${activeCompany.phone}` : ''}</p>` : ''}
                </div>

                <div class="meta">
                    <div><strong>Fecha de emisión:</strong> ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })}</div>
                    <div><strong>Período:</strong> ${formattedStart} al ${formattedEnd}</div>
                </div>

                <div class="title">Informe Ejecutivo de Gestión</div>
                <div class="subtitle">Resumen financiero y situación patrimonial al cierre</div>

                <div class="recipient">
                    <div>A la atención de:</div>
                    <strong>${executiveData.destinatarioCuria}</strong><br/>
                    ${executiveData.cargoDestinatario}<br/>
                    ${activeCompany?.name || 'ENTIDAD CONTABLE'}
                </div>

                <p class="intro">
                    Se presenta el resumen ejecutivo de la gestión económica del período, utilizando como referencia los saldos acumulados del Balance General al ${format(end, "dd 'de' MMMM 'de' yyyy", { locale: es })}.
                </p>

                <div class="section">
                    <div class="section-title">1. Resumen del período</div>
                    <div class="metric-grid">
                        <div class="metric"><div class="metric-label">Ingresos</div><div class="metric-value">$ ${fmtMoney(report.totalIncome)}</div></div>
                        <div class="metric"><div class="metric-label">Egresos</div><div class="metric-value">$ ${fmtMoney(report.totalExpense)}</div></div>
                        <div class="metric"><div class="metric-label">Resultado neto</div><div class="metric-value">$ ${fmtMoney(report.balance)}</div></div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">2. Situación financiera al cierre</div>
                    <table>
                        <tbody>
                            ${financialPositionRows}
                        </tbody>
                    </table>
                    <div class="balance-ok">${cuadre ? 'BALANCE GENERAL CUADRADO' : 'VERIFICAR CUADRE CONTABLE'}</div>
                </div>

                <div class="section">
                    <div class="section-title">3. Disponibilidad de fondos al cierre</div>
                    <div class="two-col">
                        <table>
                            <tbody>
                                ${liquidityRows}
                            </tbody>
                        </table>
                        ${hasOtherCurrentDetail ? `
                        <table>
                            <tbody>
                                ${otherCurrentRows}
                            </tbody>
                        </table>
                        ` : ''}
                    </div>
                </div>

                ${hasConciliacion ? `
                <div class="third-party">
                    <div class="third-party-head">
                        <p class="third-party-title">Conciliación patrimonial y fondos de terceros</p>
                        <p class="third-party-caption">Sólo se muestran conceptos con valor real al corte</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th style="text-align:right; width:35%;">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${hasClosingValue(report.conciliacion?.capitalizacion) ? `
                                <tr>
                                    <td>Capitalizaciones / traslados a inversión</td>
                                    <td>$ ${fmtMoney(report.conciliacion.capitalizacion)}</td>
                                </tr>
                            ` : ''}
                            ${(report.conciliacion.tercerosList || []).map(item => `
                                <tr>
                                    <td>${item.name}</td>
                                    <td>$ ${fmtMoney(item.total)}</td>
                                </tr>
                            `).join('')}
                            ${hasClosingValue(saldoNetoTerceros) ? `
                            <tr class="pending">
                                <td>Saldo pendiente</td>
                                <td>$ ${fmtMoney(saldoNetoTerceros)}</td>
                            </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <div class="note">
                    <strong>Nota:</strong> Los valores patrimoniales corresponden a saldos acumulados a la fecha de corte. El detalle de movimientos, cuentas y comprobantes permanece disponible en el módulo de Reportes y en los libros contables.
                </div>

                <div class="signatures">
                    <div class="sig"><div class="sig-name">${signatures.elaborado || 'JAIDER MIGUEL HERRERA TURIZO'}</div>Elaborado por</div>
                    <div class="sig"><div class="sig-name">${signatures.revisado || ' '}</div>Revisado / Aprobado por</div>
                </div>

                <div class="footer">Documento de carácter ejecutivo · Información tomada del cierre contable al ${format(end, "dd/MM/yyyy")}</div>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 300);
    };
                                                                                   

    

const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const getOfficialStatus = () => {
        if (!report) return null;
        if (activeTab === 'month') {
            const periodEnd = format(report.period.end, 'yyyy-MM-dd');
            const monthly = getMonthlyClosing(periodEnd, monthlyClosings);
            return monthly
                ? { official: true, label: `MES OFICIALIZADO · ${monthly.period}`, seal: monthly.seal || monthly.hash || '' }
                : { official: false, label: 'ACTA INFORMATIVA · MES NO OFICIALIZADO', seal: '' };
        }
        if (activeTab === 'year') {
            const year = String(report.period.end.getFullYear());
            const closed = isFiscalYearClosed(`${year}-12-31`, fiscalYears);
            return closed
                ? { official: true, label: `VIGENCIA ${year} CERRADA`, seal: '' }
                : { official: false, label: `ACTA INFORMATIVA · VIGENCIA ${year} ABIERTA`, seal: '' };
        }
        return { official: false, label: 'ACTA INFORMATIVA · NO BLOQUEA MOVIMIENTOS', seal: '' };
    };

    const handleCloseFiscalYear = async () => {
        if (!canEdit) {
            toast({ variant: 'destructive', title: 'Acceso restringido', description: 'Cerrar una vigencia requiere Acceso Total y Vista Individual.' });
            return;
        }
        if (isConsolidated) {
            toast({ variant: 'destructive', title: 'Seleccione una entidad', description: 'El cierre anual debe ejecutarse dentro de una entidad individual.' });
            return;
        }

        const year = Number(selectedYear);
        const currentYear = new Date().getFullYear();
        if (!Number.isInteger(year) || year >= currentYear) {
            toast({ variant: 'destructive', title: 'Vigencia no terminada', description: 'Sólo puede cerrarse una vigencia anual que ya haya terminado.' });
            return;
        }

        if (isFiscalYearClosed(`${year}-12-31`, fiscalYears)) {
            toast({ title: 'Vigencia ya cerrada', description: `La vigencia ${year} ya está protegida contra modificaciones.` });
            return;
        }

        const validYearTransactions = (transactions || []).filter(t => {
            if (!isRelevantCompany(t)) return false;
            const status = String(t?.status || '').toLowerCase();
            if (['eliminado', 'anulado', 'cancelado', 'borrador'].includes(status)) return false;
            return getAccountingYear(t?.date) === year;
        });

        if (validYearTransactions.length === 0) {
            toast({ variant: 'destructive', title: 'Vigencia sin movimientos', description: `No hay comprobantes contables en ${year}; no se generó un cierre anual vacío.` });
            return;
        }

        const movementPeriods = [...new Set(
            validYearTransactions
                .map(t => String(t?.date || '').slice(0, 7))
                .filter(period => /^\d{4}-\d{2}$/.test(period))
        )].sort();

        const officialPeriods = new Set(
            (monthlyClosings || [])
                .filter(item =>
                    String(item?.period || '').startsWith(`${year}-`) &&
                    String(item?.status || 'OFICIAL').toUpperCase() !== 'ANULADO'
                )
                .map(item => String(item.period))
        );

        const missingPeriods = movementPeriods.filter(period => !officialPeriods.has(period));
        if (missingPeriods.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Faltan cierres mensuales',
                description: `Antes de cerrar ${year}, oficializa en Transacciones los meses con movimiento: ${missingPeriods.join(', ')}.`
            });
            return;
        }

        const confirmed = window.confirm(
            `CERRAR VIGENCIA ${year}\n\n` +
            `Meses con movimiento oficializados: ${movementPeriods.length}.\n` +
            `Comprobantes protegidos por la vigencia: ${validYearTransactions.length}.\n\n` +
            'Después del cierre anual no podrán crearse, editarse ni eliminarse movimientos de esa vigencia. ¿Desea continuar?'
        );
        if (!confirmed) return;

        const monthlySealRefs = (monthlyClosings || [])
            .filter(item => movementPeriods.includes(String(item?.period || '')))
            .map(item => ({
                period: item.period,
                seal: item.seal || item.hash || '',
                algorithm: item.sealAlgorithm || ''
            }));

        const record = {
            id: String(year),
            year: String(year),
            status: 'CERRADO',
            closedAt: new Date().toISOString(),
            transactionCount: validYearTransactions.length,
            officializedPeriods: movementPeriods,
            monthlySealRefs,
            companyId: activeCompany?.id,
            company_id: activeCompany?.id
        };

        await saveFiscalYears([
            ...(fiscalYears || []).filter(item => String(item?.year) !== String(year)),
            record
        ]);

        toast({
            title: `Vigencia ${year} cerrada`,
            description: 'El año fiscal quedó bloqueado. Las actas y reportes históricos conservarán sus saldos a la fecha de corte.'
        });
    };

    const officialStatus = getOfficialStatus();
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
                <div className="print:hidden">
                    <ProfessionalModuleHero
                        eyebrow="Control de períodos"
                        title="Cierres Contables"
                        subtitle="Genera actas de cierre y controla la vigencia contable sin confundir el reporte con la oficialización de movimientos."
                        activeCompany={activeCompany}
                        icon={BookOpen}
                        accent="violet"
                        badges={isReadOnly ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">Solo lectura</span> : null}
                        metrics={[
                            { label: 'Modo', value: activeTab === 'day' ? 'Diario' : activeTab === 'week' ? 'Semanal' : activeTab === 'month' ? 'Mensual' : activeTab === 'year' ? 'Anual' : 'Personalizado' },
                            { label: 'Año', value: selectedYear },
                            { label: 'Reporte', value: report ? 'Generado' : 'Pendiente' },
                        ]}
                    />
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] print:hidden">
                    <div className="flex overflow-x-auto overscroll-x-contain touch-pan-x border-b border-slate-200 bg-slate-950" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                                className={`flex shrink-0 min-w-max items-center px-4 sm:px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === tab.id
                                    ? 'border-blue-500 text-blue-700 bg-white'
                                    : 'border-transparent text-slate-300 hover:text-white hover:bg-white/10'
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
                            <PieChart className="w-4 h-4 mr-2" /> Generar Acta
                        </Button>
                        {activeTab === 'year' && canEdit && (
                            <Button onClick={handleCloseFiscalYear} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50 min-w-[140px]">
                                <BookOpen className="w-4 h-4 mr-2" /> Cerrar Vigencia
                            </Button>
                        )}
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
                                {officialStatus && (
                                    <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${officialStatus.official ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {officialStatus.label}{officialStatus.seal ? ` · sello ${String(officialStatus.seal).slice(0, 12)}…` : ''}
                                    </div>
                                )}
                            </div>
                                                            <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
                                <Button variant="outline" onClick={handlePrint} className="text-slate-700 border-slate-300 hover:bg-slate-100">
                                    <Printer className="w-4 h-4 mr-2" /> Imprimir Acta
                                </Button>
                                
                                <Button 
                                    variant="outline" 
                                    onClick={() => setIsExecutiveReportModalOpen(true)} 
                                    className="text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100"
                                >
                                    <BookOpen className="w-4 h-4 mr-2" /> Informe a la Curia
                                </Button>

                                <Button variant="outline" onClick={handleExport} className="text-green-700 border-green-200 bg-green-50 hover:bg-green-100">
                                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel Profesional
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

                        {report && (
                            (report.conciliacion?.tercerosList || []).length > 0 ||
                            hasClosingValue(report.conciliacion?.capitalizacion) ||
                            hasClosingValue((report.conciliacion?.tercerosIn || 0) - (report.conciliacion?.tercerosOut || 0))
                        ) && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                
                                {hasClosingValue(report.conciliacion?.capitalizacion) && (
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

                                {((report.conciliacion?.tercerosList || []).length > 0 || hasClosingValue((report.conciliacion?.tercerosIn || 0) - (report.conciliacion?.tercerosOut || 0))) && (
                                    <div className="bg-amber-50 p-5 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                                                <AlertCircle className="w-4 h-4" /> Fondos de Terceros (Pasivos)
                                            </h4>
                                            <p className="text-xs text-amber-800 mb-4">
                                                Dinero donde tu caja es solo un puente (ej. retenciones, recaudos) o deudas que creaste/pagaste.
                                            </p>
                                            <div className="space-y-2">
                                                {/* Mostrar lista consolidada de Terceros con nombre directo y su movimiento neto */}
                                                {report.conciliacion.tercerosList.map((item, i) => (
                                                    <div key={`tercero-${i}`} className="bg-white p-2.5 rounded border border-amber-100 flex justify-between">
                                                        <span className="text-xs font-bold text-slate-600">{item.name}:</span>
                                                        <span className="font-mono font-bold text-amber-700">${item.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {hasClosingValue((report.conciliacion?.tercerosIn || 0) - (report.conciliacion?.tercerosOut || 0)) && (
                                            <div className="mt-4 pt-3 border-t border-amber-200 flex justify-between">
                                                <span className="text-sm font-bold text-amber-900">Saldo Pendiente (Deuda Viva):</span>
                                                <span className="font-mono font-bold text-amber-900 text-lg">
                                                    ${((report.conciliacion?.tercerosIn || 0) - (report.conciliacion?.tercerosOut || 0)).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </motion.div>
                        )}

                        <div className="pt-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-2">Estado de Resultados (Por Cuenta PUC)</h3>
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

              {/* Modal de Firmas */}
                {isPrintModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
                        <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
                            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Printer className="w-5 h-5 text-blue-600" />
                                Configurar Firmas
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-slate-700">Elaborado por:</Label>
                                    <input 
                                        type="text" 
                                        value={signatures.elaborado}
                                        onChange={e => setSignatures({...signatures, elaborado: e.target.value})}
                                        className="w-full px-4 py-2 border rounded-lg mt-1 uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="Ej. Nombre del contador"
                                    />
                                </div>
                                <div>
                                    <Label className="text-slate-700">Revisado / Aprobado por:</Label>
                                    <input 
                                        type="text" 
                                        value={signatures.revisado}
                                        onChange={e => setSignatures({...signatures, revisado: e.target.value})}
                                        className="w-full px-4 py-2 border rounded-lg mt-1 uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="Ej. Nombre del párroco"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-8">
                                <Button variant="outline" onClick={() => setIsPrintModalOpen(false)} className="text-slate-600 border-slate-300">
                                    Cancelar
                                </Button>
                                <Button onClick={executePrint} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    <Printer className="w-4 h-4 mr-2" />
                                    Generar Documento
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
             
                                  {/* Modal de Informe Ejecutivo para la Curia */}
                {isExecutiveReportModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
                        <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-blue-600" />
                                Informe Ejecutivo Curia
                            </h3>
                            <p className="text-xs text-slate-500 mb-4">
                                Completa los datos pastorales para enriquecer las métricas contables automáticas antes de generar el documento formal.
                            </p>
                            
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-slate-700 text-xs">Destinatario (Autoridad)</Label>
                                        <input 
                                            type="text" 
                                            value={executiveData.destinatarioCuria}
                                            onChange={e => setExecutiveData({...executiveData, destinatarioCuria: e.target.value})}
                                            className="w-full px-3 py-1.5 border rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-slate-700 text-xs">Cargo Eclesiástico</Label>
                                        <input 
                                            type="text" 
                                            value={executiveData.cargoDestinatario}
                                            onChange={e => setExecutiveData({...executiveData, cargoDestinatario: e.target.value})}
                                            className="w-full px-3 py-1.5 border rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-slate-700 text-xs">1. Logros Pastorales / Administrativos en este periodo</Label>
                                    <textarea 
                                        rows={3}
                                        value={executiveData.logrosPastorales}
                                        onChange={e => setExecutiveData({...executiveData, logrosPastorales: e.target.value})}
                                        className="w-full px-3 py-1.5 border rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="Ej. Se realizaron reparaciones menores en los techos de la sacristía y se dio apoyo al retiro de jóvenes..."
                                    />
                                </div>

                                <div>
                                    <Label className="text-slate-700 text-xs">2. Próximos Proyectos / Necesidades de inversión</Label>
                                    <textarea 
                                        rows={3}
                                        value={executiveData.proximosProyectos}
                                        onChange={e => setExecutiveData({...executiveData, proximosProyectos: e.target.value})}
                                        className="w-full px-3 py-1.5 border rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="Ej. Planificación de las fiestas patronales o mantenimiento preventivo del sistema eléctrico del templo..."
                                    />
                                </div>

                                <div>
                                    <Label className="text-slate-700 text-xs">3. Notas aclaratorias o comentarios contables</Label>
                                                                        <textarea 
                                        rows={2}
                                        value={executiveData.notasAclaratorias}
                                        onChange={e => setExecutiveData({...executiveData, notasAclaratorias: e.target.value})}
                                        className="w-full px-3 py-1.5 border rounded-lg mt-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="Ej. Los fondos de Dona Nobis e Infancia Misionera fueron cruzados y enviados exitosamente en su totalidad."
                                    />
                                </div>

                                {/* SECCIÓN DE FIRMAS INTEGRADA */}
                                <div className="bg-slate-50 p-4 rounded-xl border space-y-3 mt-2">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Responsables de las Firmas</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-slate-600 text-xs">Elaborado por (Contador):</Label>
                                            <input 
                                                type="text" 
                                                value={signatures.elaborado}
                                                onChange={e => setSignatures({...signatures, elaborado: e.target.value})}
                                                className="w-full px-3 py-1.5 border rounded-lg mt-1 text-xs uppercase bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                placeholder="Nombre del contador"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-600 text-xs">Revisado por (Párroco):</Label>
                                            <input 
                                                type="text" 
                                                value={signatures.revisado}
                                                onChange={e => setSignatures({...signatures, revisado: e.target.value})}
                                                className="w-full px-3 py-1.5 border rounded-lg mt-1 text-xs uppercase bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                placeholder="Nombre del párroco"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                <Button variant="outline" onClick={() => setIsExecutiveReportModalOpen(false)} className="text-slate-600 border-slate-300">
                                    Cerrar
                                </Button>
                                <Button variant="outline" onClick={handleExportExecutiveReportExcel} className="text-green-700 border-green-200 bg-green-50 hover:bg-green-100">
                                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                                    Excel Curia
                                </Button>
                                <Button onClick={executeExecutiveReportPrint} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    <Printer className="w-4 h-4 mr-2" />
                                    Imprimir Informe Curia
                                </Button>
                            </div>
                        </div>
                    </div>
                )}


              
            </div>
        </>
    );
            }

export default BookClosings;