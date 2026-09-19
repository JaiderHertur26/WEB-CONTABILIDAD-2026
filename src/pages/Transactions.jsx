import { parseAccountingDate, getAccountingYear, accountingDateValue, toAccountingDateInput } from '@/lib/accountingDate';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, Printer, Download, Loader2, ArrowRightLeft, Upload, Lock, BookOpen, Table as TableIcon, Store, FileSpreadsheet, CheckCircle2, AlertCircle, FileText, Settings, ChevronDown, ChevronRight, User, FileCheck, Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import TransactionDialog from '@/components/transactions/TransactionDialog';
import InternalTransferDialog from '@/components/transactions/InternalTransferDialog';
import StoreTransaction from '@/components/transactions/StoreTransaction';
import { exportToExcel, exportProfessionalTable, exportProfessionalWorkbook } from '@/lib/excel';
import { getTransactionAllocations, getTransactionCategoryLabel, getTransactionTotal } from '@/lib/transactionAllocations';
import { calculateLiquidityBalances } from '@/lib/financialMovements';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import { format, isValid, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import Voucher from '@/components/transactions/Voucher';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from 'xlsx';

const cleanPrintedCompanyName = (name) => String(name || '').replace(/MAR[ÍI]A[\s\u00A0]*AUXILIO/gi, 'MARÍA AUXILIO').replace(/\s+/g, ' ').trim();

const numeroALetras = (num) => {
    if (!num || isNaN(num) || num === 0) return 'CERO PESOS';
    num = Math.floor(num); 
    const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const convertGroup = (n) => {
        let text = '';
        if (n === 100) return 'CIEN';
        if (n > 99) { text += hundreds[Math.floor(n / 100)] + ' '; n %= 100; }
        if (n > 9 && n < 20) { text += teens[n - 10] + ' '; } 
        else {
            if (n > 19) {
                text += tens[Math.floor(n / 10)];
                if (n % 10 > 0) text += ' Y ';
                else text += ' ';
                n %= 10;
            }
            if (n > 0) {
                if (n === 1) text += 'UN ';
                else text += units[n] + ' ';
            }
        }
        return text.trim();
    };

    let result = '';
    let millions = Math.floor(num / 1000000);
    let thousands = Math.floor((num % 1000000) / 1000);
    let remainder = num % 1000;

    if (millions > 0) {
        if (millions === 1) result += 'UN MILLÓN ';
        else result += convertGroup(millions) + ' MILLONES ';
    }
    if (thousands > 0) {
        if (thousands === 1) result += 'MIL ';
        else result += convertGroup(thousands) + ' MIL ';
    }
    if (remainder > 0) {
        result += convertGroup(remainder);
    }
    return result.trim() + ' PESOS';
};

const formatSafeDate = (dateStr) => {
    if (!dateStr) return '-';
    if (dateStr.includes('T')) {
        const d = parseISO(dateStr);
        return isValid(d) ? format(d, 'dd/MM/yyyy') : '-';
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
};

const getTransactionTypeAndPrefix = (t) => {
    if (t?.isStoreSale) return { type: 'income', prefix: 'I' };
    if (t?.isStorePurchase) return { type: 'expense', prefix: 'E' };
    if (t?.isBankReconciliation && t?.type === 'income') return { type: 'income', prefix: 'I' };
    if (t?.isBankReconciliation && t?.type === 'expense') return { type: 'expense', prefix: 'E' };
    if (t?.isInventoryCostEntry) return { type: 'adjustment', prefix: 'A' };

    const checkCashOrBank = (codeStr, nameStr) => {
        const c = String(codeStr || '').trim();
        const n = String(nameStr || '').toUpperCase().trim();
        if (c.startsWith('11') || c.startsWith('1295') || c === 'caja_principal') return true;
        if (n.includes('CAJA') || n.includes('COOPERATIVA') || n.includes('BANCO')) return true;
        return false;
    };

    if (t.debitAccount && t.creditAccount) {
        const hasCash = checkCashOrBank(t.debitAccount.code, t.debitAccount.name) || checkCashOrBank(t.creditAccount.code, t.creditAccount.name);
        return hasCash ? { type: 'transfer', prefix: 'T' } : { type: 'adjustment', prefix: 'A' };
    }

    if (t.voucherPrefix === 'A' || t.category === 'INGRESOS POR DONACIONES') {
        return { type: 'adjustment', prefix: 'A' };
    }

    if (t.isInternalTransfer || t.type === 'transfer') {
        const destParts = (t.destination || '').split('|');
        const hasCash = checkCashOrBank(destParts[0], destParts[1]);
        return hasCash ? { type: 'transfer', prefix: 'T' } : { type: 'adjustment', prefix: 'A' };
    }

    return t.type === 'income' ? { type: 'income', prefix: 'I' } : { type: 'expense', prefix: 'E' };
};

const Transactions = () => {
    const { activeCompany, isConsolidated, companies } = useCompany();
    const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();

    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [fixedAssets, saveFixedAssets] = useCompanyData('fixedAssets');
    const [initialBalances] = useCompanyData('initialBalance');
    const [bankAccounts] = useCompanyData('bankAccounts');
    const [cashAccounts] = useCompanyData('cash_accounts');
    const [inventory, saveInventory] = useCompanyData('inventory');
    const [contacts] = useCompanyData('contacts');
    const [invoices] = useCompanyData('invoices');
    const [purchaseInvoices] = useCompanyData('purchase_invoices');

    const [billingDocuments, saveBillingDocuments] = useCompanyData('billing_documents');
    const [autoBillingCategories, setAutoBillingCategories] = useCompanyData('auto_billing_categories');
    const [voucherConfig, setVoucherConfig] = useCompanyData('voucher_config');
    const [configVoucherOpen, setConfigVoucherOpen] = useState(false);

    // 🚀 HOOKS Y ESTADOS PARA EL CIERRE ANUAL AUTOMATIZADO
    const [fiscalYears, saveFiscalYears] = useCompanyData('fiscal_years');
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [closeConfirmationText, setCloseConfirmationText] = useState('');
    const [auditReport, setAuditReport] = useState(null);
    const [closingYear, setClosingYear] = useState(new Date().getFullYear().toString());

    const [processedTransactions, setProcessedTransactions] = useState([]);
    const [filteredTransactions, setFilteredTransactions] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    // 🚀 Rangos de Fecha Personalizables (Desde - Hasta)
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const todayDateKey = format(new Date(), 'yyyy-MM-dd');
    const effectiveEndDate = endDate > todayDateKey ? todayDateKey : endDate;
    // Mantenemos selectedYear oculto para no romper otras funciones que lo usan como referencia
    const selectedYear = startDate ? startDate.split('-')[0] : new Date().getFullYear().toString();
    const [viewMode, setViewMode] = useState('balances');
    
    // 🚀 FILTRO MÚLTIPLE DE CUENTAS
    const [accountFilters, setAccountFilters] = useState([]);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [accountSearchTerm, setAccountSearchTerm] = useState(''); // <-- Nuevo estado para el buscador

    const [dialogOpen, setDialogOpen] = useState(false);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [storeDialogOpen, setStoreDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [printDialogOpen, setPrintDialogOpen] = useState(false);
    const [transactionToPrint, setTransactionToPrint] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);
    
    // NUEVO ESTADO: Diálogo para imprimir el reporte filtrado
    const [printFilteredOpen, setPrintFilteredOpen] = useState(false);
    
    const [configBillingOpen, setConfigBillingOpen] = useState(false);
    const [printBillingOpen, setPrintBillingOpen] = useState(false);
    const [billingDocToPrint, setBillingDocToPrint] = useState(null);

    const [printReceiptOpen, setPrintReceiptOpen] = useState(false);
    const [receiptToPrint, setReceiptToPrint] = useState(null);

    const { toast } = useToast();
    const voucherRef = useRef(null);
    const billingRef = useRef(null);
    const receiptRef = useRef(null); 
    const filteredPrintRef = useRef(null); // Ref para imprimir el reporte

    const isRelevant = useMemo(() => (item) => {
        if (!item) return false;
        const cid = item.company_id || item._companyId || item.companyId;
        if (!isConsolidated) {
            return !cid || cid === activeCompany?.id;
        }
        const relevantIds = companies.filter(c => c.id === activeCompany?.id || c.parentId === activeCompany?.id).map(c => c.id);
        return !cid || relevantIds.includes(cid);
    }, [isConsolidated, activeCompany, companies]);

    const transactionsMap = useMemo(() => {
        return new Map((transactions || []).map(t => [t.id, t]));
    }, [transactions]);

    const invoicedTransactionIds = useMemo(() => new Set(
        [...(invoices || []), ...(purchaseInvoices || [])]
            .flatMap(inv => inv.sourceTransactionIds || (inv.items || []).map(item => item.id))
            .filter(Boolean)
    ), [invoices, purchaseInvoices]);

    const isSystemManagedTransaction = (transaction) => Boolean(
        transaction?.isStoreSale ||
        transaction?.isStorePurchase ||
        transaction?.isInventoryCostEntry ||
        transaction?.isBankReconciliation ||
        transaction?.isInitialStock
    );

    const availableYears = useMemo(() => {
        const filteredTrans = (transactions || []).filter(isRelevant);
        const years = new Set(filteredTrans.map(t => {
            return (typeof t.date === 'string' && t.date.includes('-')) 
                ? t.date.split('-')[0] 
                : getAccountingYear(t.date).toString();
        }));
        const currentYear = new Date().getFullYear().toString();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions, isRelevant]);
    
    const getAssetDetails = (destinationStr, categoryName = '') => {
        const relInitialBalances = (initialBalances || []).filter(isRelevant);
        if (!destinationStr) {
            // 🚀 FIX: No forzar a Caja Principal. Si el destino está vacío, va a cuenta transitoria.
            return { code: '238095', name: 'PARTIDAS POR CLASIFICAR' };
        }
        const [id, name] = destinationStr.split('|');
        if (id === 'pending_payable') return { code: '23050101', name: 'CUENTAS POR PAGAR' };
        if (id === 'pending_receivable') return { code: '13050505', name: 'CUENTAS POR COBRAR' };
        if (id === 'caja_principal' || (name && name.toUpperCase().includes('CAJA PRINCIPAL'))) {
            const defaultCash = relInitialBalances.length > 0 ? relInitialBalances[0] : null;
            if (defaultCash) return { code: defaultCash.accountingCode || '11050501', name: defaultCash.accountingName || 'CAJA PRINCIPAL' };
            return { code: '11050501', name: 'CAJA PRINCIPAL' };
        }
        const cashAcc = (cashAccounts || []).filter(isRelevant).find(c => c.id === id);
        if (cashAcc) return { code: cashAcc.accounting_account || '1105', name: cashAcc.name };
        if (id === '12950501' || (name && name.toUpperCase().includes('APORTES COOPERATIVA')) || (categoryName && (categoryName.includes('APORTES COOPERATIVA') || categoryName.includes('12950501')))) return { code: '12950501', name: 'APORTES COOPERATIVA FRATERNIDAD' };
        const bank = (bankAccounts || []).filter(isRelevant).find(b => b.id === id);
        if (bank) return { code: bank.accountingCode || '1110', name: bank.accountingConcept || bank.bankName };
        if (/^\d+$/.test(id) && id.length >= 4) return { code: id, name: name || 'CUENTA DESTINO' };
        return { code: '1120', name: name || 'BANCO DESCONOCIDO' };
    };

    const resolveAccountingRows = (t) => {
        const amount = getTransactionTotal(t);

        if (t.debitAccount && t.creditAccount) {
            return [
                { account: t.debitAccount, debit: amount, credit: 0 },
                { account: t.creditAccount, debit: 0, credit: amount },
            ];
        }

        const allocations = getTransactionAllocations(t);

        if ((t.category === 'INGRESOS POR DONACIONES' || t.voucherPrefix === 'A') && allocations.length <= 1) {
            const assetAcc = getAssetDetails(t.destination, t.category);
            const catObj = (accounts || []).find(a => a.name === t.category) || { number: '421004', name: t.category };
            return [
                { account: { code: assetAcc.code, name: assetAcc.name }, debit: amount, credit: 0 },
                { account: { code: catObj.number || '421004', name: catObj.name || t.category }, debit: 0, credit: amount },
            ];
        }

        if (t.type === 'transfer' && t.fromAccount && t.toAccount) {
            const debit = getAssetDetails(t.toAccount, t.category);
            const credit = getAssetDetails(t.fromAccount, t.category);
            return [
                { account: debit, debit: amount, credit: 0 },
                { account: credit, debit: 0, credit: amount },
            ];
        }

        const assetAcc = getAssetDetails(t.destination, t.category);

        if (t.isInternalTransfer) {
            let siblingId = '';
            if (t.id.endsWith('-exp')) siblingId = t.id.replace('-exp', '-inc');
            else if (t.id.endsWith('-inc')) siblingId = t.id.replace('-inc', '-exp');
            const sibling = transactionsMap.get(siblingId);
            const contraAcc = sibling ? getAssetDetails(sibling.destination, sibling.category) : { code: '111005', name: 'TRANSFERENCIA EN TRÁNSITO' };

            return t.type === 'income'
                ? [
                    { account: assetAcc, debit: amount, credit: 0 },
                    { account: contraAcc, debit: 0, credit: amount },
                ]
                : [
                    { account: contraAcc, debit: amount, credit: 0 },
                    { account: assetAcc, debit: 0, credit: amount },
                ];
        }

        const categoryRows = allocations.map(line => {
            const normalize = (value) => String(value || '').trim().toUpperCase();
            const catObj = (accounts || []).find(a => normalize(a.name) === normalize(line.category));
            const isLegacyAllocation = line.id === 'legacy-allocation';

            // En registros antiguos puede existir un _accountNumber heredado incorrecto.
            // Si la categoría existe en el PUC, para legacy manda el catálogo vigente.
            // En distribuciones multicuenta nuevas se conserva el accountNumber explícito.
            const resolvedCode = isLegacyAllocation
                ? (catObj?.number || line.accountNumber || (t.type === 'income' ? '4105' : '5105'))
                : (line.accountNumber || catObj?.number || (t.type === 'income' ? '4105' : '5105'));

            return {
                account: {
                    code: resolvedCode,
                    name: catObj?.name || line.category,
                },
                amount: Number(line.amount) || 0,
            };
        });

        if (t.type === 'income') {
            return [
                { account: assetAcc, debit: amount, credit: 0 },
                ...categoryRows.map(row => ({ account: row.account, debit: 0, credit: row.amount })),
            ];
        }

        return [
            ...categoryRows.map(row => ({ account: row.account, debit: row.amount, credit: 0 })),
            { account: assetAcc, debit: 0, credit: amount },
        ];
    };

    const resolveAccountingRow = (t) => {
        const rows = resolveAccountingRows(t);
        const debitRow = rows.find(row => row.debit > 0) || rows[0];
        const creditRow = rows.find(row => row.credit > 0) || rows[rows.length - 1];
        return {
            debit: { ...debitRow.account, value: debitRow.debit || 0 },
            credit: { ...creditRow.account, value: creditRow.credit || 0 },
        };
    };

    useEffect(() => {
        if (!transactions || !initialBalances) return;

        let startCash = 0;
        let startBanks = 0;
        let startAportes = 0;

        const normalizeDateKey = (value) => {
            if (!value) return '';
            if (typeof value === 'string') {
                const direct = value.includes('T') ? value.split('T')[0] : value.slice(0, 10);
                if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
            }
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return '';
            return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        };
        const latestOpeningDate = (items) =>
            (items || []).map(item => normalizeDateKey(item?.date)).filter(Boolean).sort().pop() || '';

        const relevantInitialBalances = (initialBalances || []).filter(isRelevant);
        const relevantBankAccounts = (bankAccounts || []).filter(isRelevant);

        relevantInitialBalances.forEach(ib => { startCash += (parseFloat(ib.balance) || 0); });
        relevantBankAccounts.forEach(ba => {
            startBanks += (parseFloat(ba.initialBalance) || 0);
            startAportes += (parseFloat(ba.initialInvestmentBalance) || 0);
        });

        const cashOpeningDate = latestOpeningDate(relevantInitialBalances);
        const bankOpeningDate = latestOpeningDate(relevantBankAccounts);
        const investmentOpeningDate = latestOpeningDate(
            relevantBankAccounts.filter(ba => Math.abs(parseFloat(ba.initialInvestmentBalance) || 0) > 0.0001)
        );

        // Orden único para pantalla, saldos corridos y exportaciones:
        // fecha → prefijo de comprobante → número → id.
        // Así cada saldo mostrado corresponde exactamente a la fila que lo precede.
        const sorted = [...transactions].filter(isRelevant).sort((a, b) => {
            const dateA = normalizeDateKey(a.date);
            const dateB = normalizeDateKey(b.date);
            const dateCompare = dateA.localeCompare(dateB);
            if (dateCompare !== 0) return dateCompare;

            const computedA = getTransactionTypeAndPrefix(a);
            const computedB = getTransactionTypeAndPrefix(b);
            const prefixA = String(a.voucherPrefix || computedA.prefix || '').toUpperCase();
            const prefixB = String(b.voucherPrefix || computedB.prefix || '').toUpperCase();
            const prefixCompare = prefixA.localeCompare(prefixB, 'es', { sensitivity: 'base' });
            if (prefixCompare !== 0) return prefixCompare;

            const numberA = Number.isFinite(Number(a.voucherNumber)) ? Number(a.voucherNumber) : Number.MAX_SAFE_INTEGER;
            const numberB = Number.isFinite(Number(b.voucherNumber)) ? Number(b.voucherNumber) : Number.MAX_SAFE_INTEGER;
            if (numberA !== numberB) return numberA - numberB;

            return String(a.id || '').localeCompare(String(b.id || ''));
        });

        let runningCash = startCash;
        let runningBanks = startBanks;
        let runningAportes = startAportes;

        const calculated = sorted.map(t => {
            const amount = parseFloat(t.amount) || 0;
            const computed = getTransactionTypeAndPrefix(t);
            const txDateKey = normalizeDateKey(t.date);
            const validStatus = !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(String(t.status || '').toLowerCase());
            const canAffectCash = validStatus && (!cashOpeningDate || !txDateKey || txDateKey > cashOpeningDate);
            const canAffectBanks = validStatus && (!bankOpeningDate || !txDateKey || txDateKey > bankOpeningDate);
            const canAffectAportes = validStatus && (!investmentOpeningDate || !txDateKey || txDateKey > investmentOpeningDate);

            if (t.debitAccount && t.creditAccount) {
                // 🚀 BLINDAJE: Garantizar que siempre sean strings para evitar Pantalla Blanca
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                const drName = String(t.debitAccount.name || 'S/N');
                const crName = String(t.creditAccount.name || 'S/N');
                let affected = 'none';

                // Aumentos (Débitos), respetando la fecha de apertura de cada saldo.
                if (drCode.startsWith('1105') && canAffectCash) { runningCash += amount; affected = 'cash'; }
                else if ((drCode.startsWith('1110') || drCode.startsWith('1120')) && canAffectBanks) { runningBanks += amount; affected = 'banks'; }
                else if (drCode.startsWith('1295') && canAffectAportes) { runningAportes += amount; affected = 'aportes'; }

                // Disminuciones (Créditos), respetando la fecha de apertura de cada saldo.
                if (crCode.startsWith('1105') && canAffectCash) { runningCash -= amount; affected = 'cash'; }
                else if ((crCode.startsWith('1110') || crCode.startsWith('1120')) && canAffectBanks) { runningBanks -= amount; affected = 'banks'; }
                else if (crCode.startsWith('1295') && canAffectAportes) { runningAportes -= amount; affected = 'aportes'; }

                return {
                    ...t,
                    _calculatedCash: runningCash,
                    _calculatedBanks: runningBanks,
                    _calculatedAportes: runningAportes,
                    _accountNumber: drCode,
                    _destName: t.type === 'adjustment' ? 'Ajuste Interno' : (t.destination ? t.destination.split('|')[1] || t.destination.split('|')[0] : 'INVENTARIO GENERAL'),
                    _affectedColumn: affected,
                    _isPending: false,
                    _dualDisplay: `Dr: ${t.debitAccount.name.substring(0, 10)} / Cr: ${t.creditAccount.name.substring(0, 10)}`,
                    voucherPrefix: computed.prefix,
                    _intelligentType: computed.type
                };
            }

            if (t.type === 'transfer') {
                const fromParts = (t.fromAccount || '').split('|');
                const toParts = (t.toAccount || '').split('|');
                const fromId = fromParts[0];
                const toId = toParts[0];

                if ((fromId === 'caja_principal' || fromParts[1]?.toUpperCase().includes('CAJA PRINCIPAL')) && canAffectCash) runningCash -= amount;
                else if (bankAccounts && bankAccounts.some(b => b.id === fromId) && canAffectBanks) runningBanks -= amount;

                if ((toId === 'caja_principal' || toParts[1]?.toUpperCase().includes('CAJA PRINCIPAL')) && canAffectCash) runningCash += amount;
                else if (bankAccounts && bankAccounts.some(b => b.id === toId) && canAffectBanks) runningBanks += amount;

                return { ...t, _calculatedCash: runningCash, _calculatedBanks: runningBanks, _calculatedAportes: runningAportes, _accountNumber: 'TRANSFER', _destName: toParts[1] || t.toAccount, _affectedColumn: 'none', _isPending: false, voucherPrefix: computed.prefix, _intelligentType: computed.type };
            }

            const destParts = (t.destination || '').split('|');
            let destName = (destParts[1] || destParts[0] || '').toUpperCase();
            const destId = destParts[0];
            const allocations = getTransactionAllocations(t);
            const categoryLabel = getTransactionCategoryLabel(t);
            const accountNumbers = allocations.map(line => {
                if (line.accountNumber) return line.accountNumber;
                return (accounts || []).find(acc => acc.name === line.category)?.number || 'N/A';
            });
            const accountNumber = accountNumbers.length > 1 ? accountNumbers.join(' / ') : (accountNumbers[0] || 'N/A');
            const aportesAmount = allocations.reduce((sum, line) => {
                const categoryName = (line.category || '').toUpperCase();
                const lineNumber = line.accountNumber || (accounts || []).find(acc => acc.name === line.category)?.number || '';
                const isAporte = categoryName.includes('APORTES ORDINARIOS') || categoryName.includes('APORTES COOPERATIVA FRATERNIDAD') || lineNumber === '12950501';
                return sum + (isAporte ? (Number(line.amount) || 0) : 0);
            }, 0);
            const isAportesCategory = aportesAmount > 0 || destId === '12950501';
            const isPending = destId === 'pending_payable' || destId === 'pending_receivable';
            const isCashDestination = destId === 'caja_principal' || destName.includes('CAJA PRINCIPAL');

            if (destId === '11201501') destName = 'COOPERATIVA FRATERNIDAD SACERDOTAL';
            if (destId === '12950501') destName = 'APORTES COOPERATIVA FRATERNIDAD';

            let affectedColumn = 'none';

            if (isPending) {
                affectedColumn = 'pending';
            } else if (t.type === 'expense') {
                if (isCashDestination && canAffectCash) { runningCash -= amount; affectedColumn = 'cash'; }
                else if (bankAccounts && bankAccounts.some(b => b.id === destId) && canAffectBanks) { runningBanks -= amount; affectedColumn = 'banks'; }
            } else {
                if (isAportesCategory) {
                    const aportesValue = destId === '12950501' ? amount : aportesAmount;
                    const regularValue = Math.max(0, amount - aportesValue);
                    if (canAffectAportes) runningAportes += aportesValue;
                    if (regularValue > 0) {
                        if (isCashDestination && canAffectCash) runningCash += regularValue;
                        else if (bankAccounts && bankAccounts.some(b => b.id === destId) && canAffectBanks) runningBanks += regularValue;
                    }
                    affectedColumn = regularValue > 0 ? 'multiple' : 'aportes';
                } else if (isCashDestination && canAffectCash) { runningCash += amount; affectedColumn = 'cash'; }
                else if (bankAccounts && bankAccounts.some(b => b.id === destId) && canAffectBanks) { runningBanks += amount; affectedColumn = 'banks'; }
            }

            return { ...t, _calculatedCash: runningCash, _calculatedBanks: runningBanks, _calculatedAportes: runningAportes, _accountNumber: accountNumber, _categoryLabel: categoryLabel, _destName: isPending ? '(Pendiente)' : destName, _affectedColumn: affectedColumn, _isPending: isPending, voucherPrefix: computed.prefix, _intelligentType: computed.type };
        });
        
        // 🚀 LIMPIEZA MAESTRA: Filtrar TODOS los espejos inversos de la base de datos antes de calcular el Mayor y el Diario
        const cleanedData = calculated.filter(t => {
            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                // Si el asiento debita Ingresos (4) y Acredita Activos (1) o Pasivos (2), es un bug espejo y debe ser purgado.
                // Esto elimina las reversiones de A-0009 a A-0028 para que los saldos finales no queden en $0,00.
                if (drCode.startsWith('4') && crCode.startsWith('1')) return false;
                if (drCode.startsWith('2') && crCode.startsWith('1') && t.voucherPrefix === 'A' && String(t.description).includes('Ajuste')) return false;
            }
            return true;
        });

        setProcessedTransactions(cleanedData);
    }, [transactions, initialBalances, bankAccounts, accounts, isRelevant]);

    // 🚀 LÓGICA INTELIGENTE: EXTRAER SOLO CUENTAS QUE TUVIERON ACTIVIDAD EN EL AÑO
    const activeAccountsInYear = useMemo(() => {
        const yearTx = processedTransactions.filter(t => {
            const tYear = (typeof t.date === 'string' && t.date.includes('-')) 
                ? t.date.split('-')[0] 
                : getAccountingYear(t.date).toString();
            return tYear === selectedYear;
        });

        const usedExactCodes = new Set();
        
        yearTx.forEach(t => {
            resolveAccountingRows(t).forEach(row => {
                if (row.account?.code) usedExactCodes.add(String(row.account.code));
            });
            if (t._accountNumber) {
                String(t._accountNumber).split('/').map(code => code.trim()).filter(Boolean).forEach(code => usedExactCodes.add(code));
            }
        });

        return (accounts || [])
            .filter(acc => {
                const accNum = String(acc.number);
                return Array.from(usedExactCodes).some(usedCode => usedCode.startsWith(accNum));
            })
            .sort((a, b) => String(a.number).localeCompare(String(b.number)));
    }, [processedTransactions, selectedYear, accounts]);

    useEffect(() => {
        let result = [...processedTransactions];

        // 🚀 LIMPIEZA DEL BUG ESPEJO: Extirpar de la memoria visual los asientos inversos ya guardados
        result = result.filter(t => {
            if (t.debitAccount && t.creditAccount) {
                const drCode = String(t.debitAccount.code || '');
                const crCode = String(t.creditAccount.code || '');
                // Si el asiento debita un ingreso (4) y acredita un Activo (15), es un fantasma inverso y se elimina
                if (drCode.startsWith('4') && crCode.startsWith('15')) return false;
            }
            return true;
        });
        
        // 🚀 Filtro Estricto por Rango de Fechas
        result = result.filter(t => {
            if (!t.date) return false;
            const tDate = t.date.includes('T') ? t.date.split('T')[0] : t.date;
            return tDate >= startDate && tDate <= effectiveEndDate;
        });

        // Filtro de Tipo de Transacción
        if (filterType !== 'all') {
            result = result.filter(t => {
                if (filterType === 'adjustment') {
                    return t._intelligentType === 'adjustment' || t.voucherPrefix === 'A' || t.category === 'INGRESOS POR DONACIONES';
                }
                return t._intelligentType === filterType;
            });
        }
        
        // Filtro por Cuenta Contable (Múltiple)
        if (accountFilters.length > 0) {
            result = result.filter(t => {
                const rowCodes = resolveAccountingRows(t).map(row => String(row.account?.code || ''));
                const baseCodes = String(t._accountNumber || '').split('/').map(code => code.trim());
                return accountFilters.some(filter =>
                    rowCodes.some(code => code.startsWith(filter)) ||
                    baseCodes.some(code => code.startsWith(filter))
                );
            });
        }
        
        // Filtro de Búsqueda de Texto
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(t => (t.description || '').toLowerCase().includes(lower) || getTransactionCategoryLabel(t).toLowerCase().includes(lower) || (t._accountNumber || '').toLowerCase().includes(lower));
        }
        
        result.sort((a, b) => {
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
        setFilteredTransactions(result);
    }, [processedTransactions, searchTerm, filterType, startDate, effectiveEndDate, accountFilters]);

    const getDisplayTransactions = () => {
        const groups = [];
        const processedIds = new Set();
        filteredTransactions.forEach(t => {
            if (processedIds.has(t.id)) return;

            if (t.type === 'transfer' && !t.isInternalTransfer) {
                groups.push(t);
                return;
            }

            if (t.isInternalTransfer && !t.debitAccount) {
                const baseId = t.id.replace(/-exp$|-inc$/, '');
                const isExp = t.id.endsWith('-exp');
                const siblingId = baseId + (isExp ? '-inc' : '-exp');
                const sibling = filteredTransactions.find(x => x.id === siblingId);
                if (sibling) {
                    processedIds.add(t.id);
                    processedIds.add(sibling.id);
                    const first = filteredTransactions.indexOf(t) < filteredTransactions.indexOf(sibling) ? t : sibling;
                    const second = first === t ? sibling : t;
                    const amountVal = parseFloat(t.amount);
                    const formattedAmount = amountVal.toLocaleString('es-CO', { minimumFractionDigits: 0 });
                    const displayAmount = `-${formattedAmount} / +${formattedAmount}`;
                    const rawDesc = (t.description || '').includes(': ') ? t.description.split(': ')[1] : (t.description || '');
                    const expensePart = isExp ? t : sibling;
                    const incomePart = isExp ? sibling : t;
                    const sourceAsset = getAssetDetails(expensePart.destination, expensePart.category);
                    const destAsset = getAssetDetails(incomePart.destination, incomePart.category);
                    let displayDestName = t._destName;
                    const isAporte = incomePart.category && (incomePart.category.includes('APORTES COOPERATIVA') || incomePart.category.includes('12950501'));
                    if (isAporte) displayDestName = 'APORTES COOPERATIVA FRATERNIDAD';
                    else if (incomePart.destination.startsWith('11201501')) displayDestName = 'COOPERATIVA FRATERNIDAD SACERDOTAL';

                    groups.push({ ...second, id: first.id, description: rawDesc, _mergedAmount: displayAmount, _isMerged: true, _sourceAccount: sourceAsset, _destAccount: destAsset, _rawAmount: amountVal, _destName: displayDestName, voucherPrefix: first.voucherPrefix || 'A' });
                } else { groups.push(t); }
            } else { groups.push(t); }
        });
        return groups;
    };

    const displayTransactions = useMemo(() => getDisplayTransactions(), [filteredTransactions]);

    const groupedBillingDocuments = useMemo(() => {
        if (!billingDocuments) return {};
        const fBillingDocs = (billingDocuments || []).filter(isRelevant);
        const yearDocs = fBillingDocs.filter(d => {
            const y = (typeof d.date === 'string' && d.date.includes('-')) ? d.date.split('-')[0] : new Date(d.date).getFullYear().toString();
            return y === selectedYear;
        });

        const grouped = {};
        yearDocs.forEach(doc => {
            const dateObj = parseISO(doc.date);
            if (!isValid(dateObj)) return;
            
            const month = format(dateObj, 'MMMM', { locale: es });
            const day = format(dateObj, 'dd');

            if (!grouped[month]) grouped[month] = {};
            if (!grouped[month][day]) grouped[month][day] = [];
            grouped[month][day].push(doc);
        });
        return grouped;
    }, [billingDocuments, selectedYear, isRelevant]);

    const getNextVoucherNumber = (desiredType, dateStr) => {
        if (!transactions || transactions.length === 0) return 1;
        
        const year = (typeof dateStr === 'string' && dateStr.includes('-')) 
            ? dateStr.split('-')[0] 
            : new Date(dateStr).getFullYear().toString();
        
        const typeTransactions = transactions.filter(isRelevant).filter(t => {
            const tYear = (typeof t.date === 'string' && t.date.includes('-')) 
                ? t.date.split('-')[0] 
                : getAccountingYear(t.date).toString();
                
            if (tYear !== year) return false;
            const computed = getTransactionTypeAndPrefix(t);
            return computed.type === desiredType;
        });

        const maxNum = typeTransactions.reduce((max, t) => {
            const currentVnum = parseInt(t.voucherNumber, 10) || 0;
            return currentVnum > max ? currentVnum : max;
        }, 0);

        return maxNum + 1;
    };

    const handleGenerateBillingDoc = (transaction) => {
        if (!canAdd) return;

        const exists = (billingDocuments || []).find(b => b.transactionId === transaction.id);
        if (exists) {
            setBillingDocToPrint(exists);
            setPrintBillingOpen(true);
            return;
        }

        let beneficiaryName = transaction.contact || '';
        let docNumber = '';
        if (transaction.contactId && contacts) {
            const foundContact = contacts.find(c => String(c.id) === String(transaction.contactId));
            if (foundContact) {
                beneficiaryName = foundContact.name;
                docNumber = `${foundContact.docType || 'CC'} ${foundContact.docNumber || ''}`;
            }
        }

        if (!beneficiaryName) {
            beneficiaryName = transaction.description.split(' ')[0] || 'Proveedor a actualizar';
        }

        const newDoc = {
            id: `bill-${transaction.id}`,
            transactionId: transaction.id,
            date: transaction.date,
            amount: transaction.amount,
            concept: transaction.description,
            beneficiary: beneficiaryName,
            docNumber: docNumber || 'A actualizar',
            voucherNumber: transaction.voucherNumber,
            company_id: activeCompany?.id,
            companyId: activeCompany?.id
        };

        saveBillingDocuments([...(billingDocuments || []), newDoc]);
        toast({ title: 'Cuenta de Cobro Generada', description: 'El documento de soporte fue creado exitosamente.' });
    };

    const handleGenerateReceipt = (transaction) => {
        let beneficiaryName = transaction.contact || '';
        let docNumber = '';
        
        if (transaction.contactId && contacts) {
            const foundContact = contacts.find(c => String(c.id) === String(transaction.contactId));
            if (foundContact) {
                beneficiaryName = foundContact.name;
                docNumber = `${foundContact.docType || 'CC'} ${foundContact.docNumber || ''}`;
            }
        }

        if (!beneficiaryName) {
            beneficiaryName = transaction.description.split(' ')[0] || 'A actualizar';
        }

        setReceiptToPrint({
            ...transaction,
            beneficiary: beneficiaryName,
            docNumber: docNumber || 'A actualizar'
        });
        setPrintReceiptOpen(true);
    };

    const handleSaveTransaction = (transactionData) => {
        if (!canAdd && !editingTransaction) return;
        if (!canEdit && editingTransaction) return;
        if (editingTransaction && (isSystemManagedTransaction(editingTransaction) || invoicedTransactionIds.has(editingTransaction.id))) {
            toast({
                variant:'destructive',
                title:'Movimiento protegido',
                description:'Este movimiento proviene de Tienda, Inventario, Conciliación o ya fue facturado. Corrígelo desde su módulo de origen para conservar la trazabilidad.'
            });
            return;
        }

        // 🚀 REGLA LÓGICA 2: Middleware de restricción para evitar saldo negativo en Caja Principal
        const isExpense = transactionData.type === 'expense' && !transactionData.isInternalTransfer;
        
        let isCashDisbursement = false;
        if (transactionData.creditAccount) {
            isCashDisbursement = String(transactionData.creditAccount.code || '').startsWith('1105');
        } else {
            const destParts = (transactionData.destination || '').split('|');
            isCashDisbursement = destParts[0] === 'caja_principal' || (destParts[1] || '').toUpperCase().includes('CAJA PRINCIPAL');
        }

        if (isExpense && isCashDisbursement) {
            let currentCashBalance = 0;
            
            // 1. Sumar los saldos iniciales
            (initialBalances || []).filter(isRelevant).forEach(ib => currentCashBalance += parseFloat(ib.balance) || 0);
            
            // 2. Reconstruir el saldo actual en caliente
            transactions.filter(isRelevant).forEach(t => {
                if (editingTransaction && t.id === editingTransaction.id) return; // Excluir la tx actual en caso de edición
                
                const amount = parseFloat(t.amount) || 0;
                if (t.debitAccount && t.creditAccount) {
                    if (String(t.debitAccount.code || '').startsWith('1105')) currentCashBalance += amount;
                    if (String(t.creditAccount.code || '').startsWith('1105')) currentCashBalance -= amount;
                } else if (t.type === 'transfer') {
                    const fromParts = (t.fromAccount || '').split('|');
                    const toParts = (t.toAccount || '').split('|');
                    if (fromParts[0] === 'caja_principal' || fromParts[1]?.toUpperCase().includes('CAJA PRINCIPAL')) currentCashBalance -= amount;
                    if (toParts[0] === 'caja_principal' || toParts[1]?.toUpperCase().includes('CAJA PRINCIPAL')) currentCashBalance += amount;
                } else {
                    const tDestParts = (t.destination || '').split('|');
                    const tDestId = tDestParts[0];
                    const tIsCash = tDestId === 'caja_principal' || (tDestParts[1] || '').toUpperCase().includes('CAJA PRINCIPAL');
                    
                    if (tIsCash) {
                        if (t.type === 'expense') {
                            currentCashBalance -= amount;
                        } else if (t.type === 'income') {
                            const aportesAmount = getTransactionAllocations(t).reduce((sum, line) => {
                                const categoryName = (line.category || '').toUpperCase();
                                const accountNumber = line.accountNumber || (accounts || []).find(a => a.name === line.category)?.number || '';
                                const isAporte = categoryName.includes('APORTES') || accountNumber === '12950501';
                                return sum + (isAporte ? (Number(line.amount) || 0) : 0);
                            }, 0);
                            currentCashBalance += tDestId === '12950501' ? 0 : Math.max(0, amount - aportesAmount);
                        }
                    }
                }
            });

            // 3. Ejecutar el corte (Trigger 400)
            if (parseFloat(transactionData.amount) > currentCashBalance) {
                toast({ 
                    variant: 'destructive', 
                    title: "Fondos insuficientes", 
                    description: `Saldo actual en Caja Principal: $${currentCashBalance.toLocaleString('es-CO')}. No puedes sacar $${parseFloat(transactionData.amount).toLocaleString('es-CO')}.`
                });
                return; // ⛔ Aborta el guardado
            }
        }

        let updatedTransactions;
        let updatedAssets = [...(fixedAssets || [])];
        let updatedBilling = [...(billingDocuments || [])];
        let transactionId;

        const SMART_PUC_PREFIXES = ['5120', '5125', '5135', '5145', '5220', '5225', '5235', '5245'];
        let shouldAutoGenerateBill = false;
        
        if (transactionData.type === 'expense' && !transactionData.isInternalTransfer) {
            const allocationCategories = getTransactionAllocations(transactionData).map(line => line.category);
            if (Array.isArray(autoBillingCategories)) {
                shouldAutoGenerateBill = allocationCategories.some(category => autoBillingCategories.includes(category));
            } else {
                shouldAutoGenerateBill = allocationCategories.some(category => {
                    const catObj = (accounts || []).find(a => a.name === category);
                    return catObj && SMART_PUC_PREFIXES.some(prefix => String(catObj.number).startsWith(prefix));
                });
            }
        }

        if (editingTransaction) {
            transactionId = editingTransaction.id;
            updatedTransactions = transactions.map(t => t.id === transactionId ? { ...t, ...transactionData } : t);
            
            const existingBillIndex = updatedBilling.findIndex(b => b.transactionId === transactionId);
            if (existingBillIndex !== -1) {
                updatedBilling[existingBillIndex] = {
                    ...updatedBilling[existingBillIndex],
                    date: transactionData.date,
                    amount: transactionData.amount,
                    concept: transactionData.description
                };
            }
            toast({ title: "¡Transacción actualizada!" });
        } else {
            transactionId = `${Date.now()}`;
            
            const computed = getTransactionTypeAndPrefix(transactionData);
            const voucherNumber = getNextVoucherNumber(computed.type, transactionData.date);
            
            const newTransaction = { 
                ...transactionData, 
                id: transactionId, 
                voucherNumber,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            };
            updatedTransactions = [...transactions, newTransaction];

            if (shouldAutoGenerateBill) {
                let beneficiaryName = transactionData.contact || transactionData.description.split(' ')[0] || 'A actualizar';
                let docNum = 'A actualizar';
                
                if (transactionData.contactId && contacts) {
                    const c = contacts.find(x => String(x.id) === String(transactionData.contactId));
                    if (c) {
                        beneficiaryName = c.name;
                        docNum = `${c.docType || 'CC'} ${c.docNumber || ''}`;
                    }
                }

                updatedBilling.push({
                    id: `bill-${transactionId}`,
                    transactionId: transactionId,
                    date: transactionData.date,
                    amount: transactionData.amount,
                    concept: transactionData.description,
                    beneficiary: beneficiaryName,
                    docNumber: docNum,
                    voucherNumber: voucherNumber,
                    company_id: activeCompany?.id,
                    companyId: activeCompany?.id
                });
            }

            toast({ title: "¡Transacción creada!" });
        }

        if (transactionData.type === 'expense' && transactionData.isFixedAsset) {
            const assetPayload = { date: transactionData.date, name: transactionData.description, value: parseFloat(transactionData.amount), year: getAccountingYear(transactionData.date).toString(), transactionId: transactionId };
            updatedAssets.push({ ...assetPayload, id: `asset-${transactionId}`, status: 'Bueno', quantity: 1, company_id: activeCompany?.id, companyId: activeCompany?.id });
            saveFixedAssets(updatedAssets);
        }

        saveTransactions(updatedTransactions);
        saveBillingDocuments(updatedBilling);
        setDialogOpen(false);
        setEditingTransaction(null);
    };

    const handleDelete = (id) => {
        if (!canDelete) {
            toast({ variant: "destructive", title: "Acceso Denegado", description: "No tienes permiso para eliminar." });
            return;
        }
        const transactionToDelete = transactions.find(t => t.id === id);
        if (!transactionToDelete) return;

        const linkedInvoice = [...(invoices || []), ...(purchaseInvoices || [])].find(inv =>
            (inv.sourceTransactionIds || []).includes(id) || (inv.items || []).some(item => item.id === id)
        );
        if (linkedInvoice) {
            toast({ variant:'destructive', title:'Transacción facturada', description:`No puede eliminarse porque pertenece a ${linkedInvoice.invoiceNumber || 'un documento emitido'}. Elimina primero ese documento desde Facturas.` });
            return;
        }

        let transactionsToDeleteIds = [id];
        const assetToDelete = (fixedAssets || []).find(a => a.transactionId === id);
        if (assetToDelete) saveFixedAssets(fixedAssets.filter(a => a.id !== assetToDelete.id));

        if (billingDocuments) {
            const docsToKeep = billingDocuments.filter(b => b.transactionId !== id);
            if (docsToKeep.length !== billingDocuments.length) {
                saveBillingDocuments(docsToKeep);
            }
        }

        let relatedId = null;
        if (transactionToDelete.isInternalTransfer) {
            const baseId = transactionToDelete.id.split('-')[0];
            const siblingType = transactionToDelete.type === 'expense' ? 'inc' : 'exp';
            relatedId = `${baseId}-${siblingType}`;
        } else if (transactionToDelete.relatedTransactionId) {
            relatedId = transactionToDelete.relatedTransactionId;
        }

        if (relatedId) {
            const related = transactions.find(t => t.id === relatedId);
            if (related) {
                transactionsToDeleteIds.push(relatedId);
            }
        }

        const relatedInvoice = [...(invoices || []), ...(purchaseInvoices || [])].find(inv =>
            (inv.sourceTransactionIds || []).some(txId => transactionsToDeleteIds.includes(txId)) ||
            (inv.items || []).some(item => transactionsToDeleteIds.includes(item.id))
        );
        if (relatedInvoice) {
            toast({ variant:'destructive', title:'Movimiento vinculado a factura', description:`No puede eliminarse porque el conjunto contable pertenece a ${relatedInvoice.invoiceNumber || 'un documento emitido'}.` });
            return;
        }

        const stockChanging = tx => Boolean(tx?.isStoreSale || tx?.isStorePurchase || tx?.isInitialStock);
        for (const txId of transactionsToDeleteIds) {
            const tx = transactions.find(t => t.id === txId);
            if (!stockChanging(tx) || !tx.productId) continue;
            const currentIndex = transactions.findIndex(t => t.id === txId);
            const hasLaterStockMovement = transactions.slice(currentIndex + 1).some(other =>
                !transactionsToDeleteIds.includes(other.id) &&
                String(other.productId || '') === String(tx.productId) &&
                stockChanging(other)
            );
            if (hasLaterStockMovement) {
                toast({
                    variant:'destructive',
                    title:'Movimiento histórico protegido',
                    description:'Este producto tiene compras o ventas posteriores. Anula primero los movimientos posteriores para conservar cantidades y costo promedio.'
                });
                return;
            }
        }

        let updatedInventory = [...(inventory || [])];
        let inventoryChanged = false;

        transactionsToDeleteIds.forEach(txId => {
            const tx = transactions.find(t => t.id === txId);
            if (tx && tx.productId && tx.productQuantity) {
                const productIndex = updatedInventory.findIndex(p => p.id === tx.productId);
                if (productIndex >= 0) {
                    const product = { ...updatedInventory[productIndex] };
                    const qty = parseFloat(tx.productQuantity);

                    if (tx.isStorePurchase) {
                        const hasPreviousQty = tx.previousQuantity !== undefined && tx.previousQuantity !== null && Number.isFinite(Number(tx.previousQuantity));
                        const hasPreviousCost = tx.previousUnitCost !== undefined && tx.previousUnitCost !== null && Number.isFinite(Number(tx.previousUnitCost));
                        product.quantity = hasPreviousQty ? Number(tx.previousQuantity) : (parseFloat(product.quantity) - qty);
                        if (hasPreviousCost) product.unit_cost = Number(tx.previousUnitCost);
                        inventoryChanged = true;
                    } else if (tx.isPurchase || (tx.type === 'expense' && tx.isPurchase)) {
                        product.quantity = parseFloat(product.quantity) - qty;
                        inventoryChanged = true;
                    } else if (tx.isInitialStock || (tx.type === 'adjustment' && !tx.isPurchase)) {
                        product.quantity = parseFloat(product.quantity) - qty;
                        inventoryChanged = true;
                    } else if ((tx.type === 'income' && tx.productId) || (tx.type === 'expense' && tx.isStoreAdjustment)) {
                        product.quantity = parseFloat(product.quantity) + qty;
                        inventoryChanged = true;
                    }

                    if (inventoryChanged) {
                        updatedInventory[productIndex] = product;
                    }
                }
            }
        });

        if (inventoryChanged) {
            saveInventory(updatedInventory);
            toast({ title: "Inventario actualizado", description: "Se han revertido los cambios de stock." });
        }

        saveTransactions(transactions.filter(t => !transactionsToDeleteIds.includes(t.id)));
        toast({ title: "Transacción eliminada exitosamente" });
    };

    const handleSaveTransfer = (transferData) => {
        if (!canAdd) return;
        const now = Date.now();
        
        let voucherNumber = 1;

        if (transferData.isAccounting) {
            const debitAccObj = (accounts || []).find(a => a.name === transferData.debitAccount) || { number: '150805', name: transferData.debitAccount };
            const creditAccObj = (accounts || []).find(a => a.name === transferData.creditAccount) || { number: '133005', name: transferData.creditAccount };

            // 🚀 PREVENCIÓN DE BUG ESPEJO: Bloquear el guardado si se intenta debitar un ingreso (4) y acreditar un activo (15)
            if (String(debitAccObj.number).startsWith('4') && String(creditAccObj.number).startsWith('15')) {
                toast({ variant: 'destructive', title: "Operación Bloqueada", description: "El sistema ha evitado un asiento espejo inverso. Esta transacción anularía el efecto de la donación en especie." });
                return;
            }

            const voucherNumber = getNextVoucherNumber('adjustment', transferData.date);
            const transactionId = `${Date.now()}`;

            const accountingTransaction = {
                id: transactionId,
                type: 'adjustment',
                voucherPrefix: 'A',
                voucherNumber,
                date: transferData.date,
                description: transferData.description,
                amount: parseFloat(transferData.amount),
                category: debitAccObj.name,
                isInternalTransfer: true,
                debitAccount: { code: debitAccObj.number, name: debitAccObj.name },
                creditAccount: { code: creditAccObj.number, name: creditAccObj.name },
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            };

            // Registro automático en Activos Fijos si la cuenta débito pertenece a la clase 15 (excepto construcciones/depreciación)
            if (debitAccObj.number.startsWith('15') && !debitAccObj.number.startsWith('1508') && !debitAccObj.number.startsWith('1592')) {
                const assetPayload = {
                    date: transferData.date,
                    name: transferData.description, 
                    value: parseFloat(transferData.amount),
                    year: getAccountingYear(transferData.date).toString(),
                    transactionId: transactionId
                };

                const newAsset = {
                    ...assetPayload,
                    id: `asset-${transactionId}`,
                    status: 'Bueno',
                    quantity: 1,
                    category: debitAccObj.name,
                    company_id: activeCompany?.id,
                    companyId: activeCompany?.id
                };

                saveFixedAssets([...(fixedAssets || []), newAsset]);
            }

            saveTransactions([...transactions, accountingTransaction]);
            toast({ title: "Cruce contable aplicado", description: "Los saldos en el Balance General han sido ajustados." });
            setTransferDialogOpen(false);
            return;
        }

        voucherNumber = getNextVoucherNumber('transfer', transferData.date);
        const { fromAccount, toAccount, amount, date, description } = transferData;
        const [fromId, fromName] = fromAccount.split('|');
        const [toId, toName] = toAccount.split('|');

        const expenseTransaction = { id: `${now}-exp`, type: 'expense', description: `Transferencia a ${toName}: ${description}`, amount: parseFloat(amount), category: 'Transferencia Interna', date, destination: fromAccount, isInternalTransfer: true, voucherNumber, company_id: activeCompany?.id, companyId: activeCompany?.id };
        const incomeTransaction = { id: `${now}-inc`, type: 'income', description: `Transferencia desde ${fromName}: ${description}`, amount: parseFloat(amount), category: 'Transferencia Interna', date, destination: toAccount, isInternalTransfer: true, voucherNumber, company_id: activeCompany?.id, companyId: activeCompany?.id };

        saveTransactions([...transactions, expenseTransaction, incomeTransaction]);
        toast({ title: "Transferencia registrada", description: "Se movió el dinero entre cuentas." });
        setTransferDialogOpen(false);
    };

    const handleExport = () => {
        if (filteredTransactions.length === 0) return;

        const relevantInitialBalances = (initialBalances || []).filter(isRelevant);
        const relevantBankAccounts = (bankAccounts || []).filter(isRelevant);
        const openingCash = relevantInitialBalances.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
        const openingBanks = relevantBankAccounts.reduce((sum, item) => sum + (Number(item.initialBalance) || 0), 0);
        const openingAportes = relevantBankAccounts.reduce((sum, item) => sum + (Number(item.initialInvestmentBalance) || 0), 0);

        const openingDates = [
            ...relevantInitialBalances.map(item => String(item.date || '').slice(0, 10)),
            ...relevantBankAccounts.map(item => String(item.date || '').slice(0, 10))
        ].filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();

        let controlOpeningDate = `${selectedYear}-01-01`;
        const latestOpeningDate = openingDates.at(-1);
        if (latestOpeningDate) {
            const openingDate = new Date(`${latestOpeningDate}T12:00:00`);
            openingDate.setDate(openingDate.getDate() + 1);
            controlOpeningDate = `${openingDate.getFullYear()}-${String(openingDate.getMonth() + 1).padStart(2, '0')}-${String(openingDate.getDate()).padStart(2, '0')}`;
        }

        const resolveControlAccount = (t) => {
            const accountingRows = resolveAccountingRows(t);
            const liquidityCode = (code) => {
                const value = String(code || '');
                return value.startsWith('1105') || value.startsWith('1110') || value.startsWith('1120');
            };

            if (t.isInternalTransfer) {
                const debitTarget = accountingRows.find(row =>
                    Number(row.debit) > 0 && String(row.account?.code || '').startsWith('1295')
                );
                if (debitTarget?.account?.code) return String(debitTarget.account.code);
            }

            if (t.type === 'income') {
                const creditSide = accountingRows.find(row =>
                    Number(row.credit) > 0 && !liquidityCode(row.account?.code)
                );
                if (creditSide?.account?.code) return String(creditSide.account.code);
            }

            if (t.type === 'expense') {
                const debitSide = accountingRows.find(row =>
                    Number(row.debit) > 0 && !liquidityCode(row.account?.code)
                );
                if (debitSide?.account?.code) return String(debitSide.account.code);
            }

            const nonLiquidity = accountingRows.find(row => !liquidityCode(row.account?.code));
            return String(nonLiquidity?.account?.code || accountingRows[0]?.account?.code || 'N/A');
        };

        const rows = [{
            Comprobante: 'SALDO',
            Fecha: formatSafeDate(controlOpeningDate),
            Descripción: 'SALDOS DE APERTURA DISPONIBLES PARA CONTROL',
            Tipo: 'Saldo Inicial',
            'Nº Cuenta': '-',
            Categoría: 'APERTURA',
            Monto: null,
            Destino: '-',
            'Saldo Caja': openingCash,
            'Saldo Bancos': openingBanks,
            'Saldo Aportes': openingAportes,
            __style: 'subtotal'
        }];

        filteredTransactions.forEach(t => {
            let typeLabel = '';
            if (t._intelligentType === 'transfer') typeLabel = 'Cruce/Transferencia';
            else if (t._intelligentType === 'adjustment') typeLabel = 'Ajuste Contable';
            else typeLabel = t._intelligentType === 'income' ? 'Ingreso' : 'Egreso';

            if (t._isPending) typeLabel += ' (Pendiente)';

            const displayVoucher = t.voucherNumber
                ? `${t.voucherPrefix || 'N/A'}-${String(t.voucherNumber).padStart(4, '0')}`
                : 'N/A';

            let amountValue = Number(t.amount) || 0;
            if (t.type === 'expense' && t.type !== 'transfer' && !t.debitAccount) {
                amountValue = -Math.abs(amountValue);
            }

            rows.push({
                Comprobante: displayVoucher,
                Fecha: formatSafeDate(t.date),
                Descripción: t.description || '',
                Tipo: typeLabel,
                'Nº Cuenta': resolveControlAccount(t),
                Categoría: getTransactionCategoryLabel(t),
                Monto: amountValue,
                Destino: t._destName || '-',
                'Saldo Caja': Number(t._calculatedCash) || 0,
                'Saldo Bancos': Number(t._calculatedBanks) || 0,
                'Saldo Aportes': Number(t._calculatedAportes) || 0
            });
        });

        exportProfessionalTable({
            fileName: `Transacciones_Control_${selectedYear}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: `TRANSACCIONES CONTROL ${selectedYear}`,
            period: `AÑO FISCAL ${selectedYear}`,
            sheetName: 'Reporte',
            orientation: 'landscape',
            columns: [
                { key: 'Comprobante', label: 'COMPROBANTE', width: 14, type: 'text' },
                { key: 'Fecha', label: 'FECHA', width: 13, type: 'text' },
                { key: 'Descripción', label: 'DESCRIPCIÓN', width: 42, type: 'text' },
                { key: 'Tipo', label: 'TIPO', width: 18, type: 'text' },
                { key: 'Nº Cuenta', label: 'Nº CUENTA', width: 15, type: 'text' },
                { key: 'Categoría', label: 'CATEGORÍA', width: 34, type: 'text' },
                { key: 'Monto', label: 'MONTO', width: 18, type: 'currency' },
                { key: 'Destino', label: 'DESTINO', width: 30, type: 'text' },
                { key: 'Saldo Caja', label: 'SALDO CAJA', width: 19, type: 'currency' },
                { key: 'Saldo Bancos', label: 'SALDO BANCOS', width: 19, type: 'currency' },
                { key: 'Saldo Aportes', label: 'SALDO APORTES', width: 19, type: 'currency' }
            ],
            rows,
            notes: [
                'Los saldos corridos se calculan en el mismo orden de las filas: fecha → prefijo → número de comprobante.',
                'La cuenta PUC se obtiene del asiento contable resuelto, no de metadatos históricos heredados.',
                'Este informe es de control operativo y debe conciliar con Libro Auxiliar, Libro Mayor, Balance y Flujo de Efectivo.'
            ]
        });

        toast({ title: "Excel profesional generado", description: "Informe de Control exportado con saldos y cuentas PUC conciliadas." });
    };

    const handleExportAccounting = () => {
        if (filteredTransactions.length === 0) { 
            toast({ variant: 'destructive', title: "No hay datos para exportar" }); 
            return; 
        }
        
        const dataToExport = [];
        const processedIds = new Set();
        
        filteredTransactions.forEach(t => {
            if (processedIds.has(t.id)) return;
            
            if (t.isInternalTransfer && !t.debitAccount) {
                const baseId = t.id.replace(/-exp$|-inc$/, '');
                const isExp = t.id.endsWith('-exp');
                const siblingId = baseId + (isExp ? '-inc' : '-exp');
                const sibling = filteredTransactions.find(x => x.id === siblingId);
                
                if (sibling) {
                    processedIds.add(t.id);
                    processedIds.add(sibling.id);
                    
                    const expensePart = isExp ? t : sibling;
                    const incomePart = isExp ? sibling : t;
                    
                    const sourceAsset = getAssetDetails(expensePart.destination, expensePart.category);
                    const destAsset = getAssetDetails(incomePart.destination, incomePart.category);
                    
                    let vId = expensePart.voucherNumber ? `${expensePart.voucherPrefix || 'A'}-${String(expensePart.voucherNumber).padStart(4, '0')}` : '-';
                    const displayDate = formatSafeDate(expensePart.date);
                    const monto = parseFloat(expensePart.amount) || 0;
                    
                    dataToExport.push({ 'Fecha': displayDate, 'Comprobante': vId, 'Código PUC': destAsset.code, 'Cuenta': destAsset.name, 'Descripción': expensePart.description.replace('Cruce: ', ''), 'Débito': monto, 'Crédito': 0 });
                    dataToExport.push({ 'Fecha': displayDate, 'Comprobante': vId, 'Código PUC': sourceAsset.code, 'Cuenta': sourceAsset.name, 'Descripción': incomePart.description.replace('Cruce: ', ''), 'Débito': 0, 'Crédito': monto });
                    return;
                }
            }

            let vId = t.voucherNumber ? `${t.voucherPrefix || 'A'}-${String(t.voucherNumber).padStart(4, '0')}` : '-';
            const displayDate = formatSafeDate(t.date);
            resolveAccountingRows(t).forEach(row => {
                dataToExport.push({
                    'Fecha': displayDate,
                    'Comprobante': vId,
                    'Código PUC': row.account?.code || 'N/A',
                    'Cuenta': row.account?.name || getTransactionCategoryLabel(t),
                    'Descripción': t.description,
                    'Débito': Number(row.debit) || 0,
                    'Crédito': Number(row.credit) || 0
                });
            });
        });
        
        const totalDebit = dataToExport.reduce((sum, row) => sum + (Number(row['Débito']) || 0), 0);
        const totalCredit = dataToExport.reduce((sum, row) => sum + (Number(row['Crédito']) || 0), 0);

        exportProfessionalTable({
            fileName: `Libro_Diario_${startDate}_al_${effectiveEndDate}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: 'LIBRO DIARIO OFICIAL',
            period: `DEL ${startDate} AL ${effectiveEndDate}`,
            sheetName: 'Libro Diario',
            orientation: 'landscape',
            columns: [
                { key: 'Fecha', label: 'FECHA', width: 13, type: 'text' },
                { key: 'Comprobante', label: 'COMP.', width: 13, type: 'text' },
                { key: 'Código PUC', label: 'CÓDIGO PUC', width: 14, type: 'text' },
                { key: 'Cuenta', label: 'CUENTA', width: 34, type: 'text' },
                { key: 'Descripción', label: 'DETALLE', width: 44, type: 'text' },
                { key: 'Débito', label: 'DÉBITO (COP)', width: 18, type: 'currency' },
                { key: 'Crédito', label: 'CRÉDITO (COP)', width: 18, type: 'currency' }
            ],
            rows: dataToExport,
            summaryRows: [{
                Fecha: 'SUMAS IGUALES',
                'Débito': totalDebit,
                'Crédito': totalCredit,
                __style: Math.abs(totalDebit - totalCredit) < 0.01 ? 'total' : 'subtotal'
            }],
            notes: [
                Math.abs(totalDebit - totalCredit) < 0.01
                    ? 'Control de partida doble: DÉBITOS = CRÉDITOS.'
                    : 'ADVERTENCIA: los débitos y créditos no están conciliados.',
                'Libro generado conforme al período seleccionado; conservar junto con comprobantes y soportes.'
            ]
        });
        toast({ title: "Excel profesional generado", description: "Libro Diario exportado con formato contable y control de partida doble." });
    };

   
    const buildAuxiliaryExcelData = () => {
        const flatRows = [];

        displayTransactions.forEach(t => {
            if (t._isMerged) return;
            const vId = t.voucherNumber
                ? `${t.voucherPrefix || 'A'}-${String(t.voucherNumber).padStart(4, '0')}`
                : '-';

            let tercero = t.contact || '-';
            if (tercero === '-' && t.contactId && contacts) {
                const foundContact = contacts.find(c => String(c.id) === String(t.contactId));
                if (foundContact) tercero = foundContact.name;
            }

            resolveAccountingRows(t).forEach((row, rowIndex) => {
                const code = String(row.account?.code || '');
                const showRow = accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f));
                if (!showRow || !code) return;

                const debitValue = Number(row.debit) || 0;
                const creditValue = Number(row.credit) || 0;
                if (debitValue > 0) {
                    flatRows.push({ ...t, _rowIndex: rowIndex, vId, tercero, pCode: code, pName: row.account?.name || '-', isDebit: true, val: debitValue });
                }
                if (creditValue > 0) {
                    flatRows.push({ ...t, _rowIndex: rowIndex, vId, tercero, pCode: code, pName: row.account?.name || '-', isDebit: false, val: creditValue });
                }
            });
        });

        const openingBalancesByCode = libroMayorData.reduce((map, acc) => {
            map[String(acc.code)] = Number(acc.saldoAnterior) || 0;
            return map;
        }, {});

        // Incluir cuentas con saldo anterior aunque no tengan movimientos en el período
        // (p. ej. Banco y Fondo Social). Un Auxiliar de “todas las cuentas” debe
        // poder conciliar íntegramente con el Libro Mayor.
        const movementCodes = new Set(flatRows.map(row => String(row.pCode)));
        libroMayorData.forEach(acc => {
            const code = String(acc.code || '');
            const openingBalance = Number(acc.saldoAnterior) || 0;
            const showRow = accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f));
            if (!showRow || !code || Math.abs(openingBalance) <= 0.01 || movementCodes.has(code)) return;

            flatRows.push({
                _openingOnly: true,
                date: startDate,
                vId: 'SALDO',
                tercero: '-',
                pCode: code,
                pName: acc.name || '-',
                isDebit: false,
                val: 0
            });
        });

        // Toda cuenta bancaria líquida configurada debe ser visible aun si no tuvo
        // saldo inicial ni movimientos en el período. Se excluyen registros usados
        // exclusivamente como vehículo de inversión/aportes.
        (bankAccounts || []).filter(isRelevant).forEach(ba => {
            const code = String(ba.accountingCode || '');
            const initialBankBalance = Number(ba.initialBalance) || 0;
            const investmentBalance = Number(ba.initialInvestmentBalance) || 0;
            const isBankingCode = code.startsWith('1110') || code.startsWith('1120');
            const investmentOnly = Math.abs(investmentBalance) > 0.01 && Math.abs(initialBankBalance) <= 0.01;
            const showRow = accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f));

            if (!isBankingCode || investmentOnly || !showRow || movementCodes.has(code)) return;
            if (flatRows.some(row => String(row.pCode) === code)) return;

            flatRows.push({
                _openingOnly: true,
                _forceOpeningRow: true,
                date: startDate,
                vId: 'SALDO',
                tercero: '-',
                pCode: code,
                pName: ba.accountingConcept || ba.bankName || 'CUENTA BANCARIA',
                isDebit: false,
                val: 0
            });
        });

        flatRows.sort((a, b) => {
            const codeCompare = String(a.pCode).localeCompare(String(b.pCode));
            if (codeCompare !== 0) return codeCompare;
            if (a._openingOnly && !b._openingOnly) return -1;
            if (!a._openingOnly && b._openingOnly) return 1;
            return accountingDateValue(a.date) - accountingDateValue(b.date);
        });

        const runningBalances = {};
        const rows = [];
        let currentAccount = null;

        flatRows.forEach(row => {
            if (currentAccount !== row.pCode) {
                currentAccount = row.pCode;
                const openingBalance = openingBalancesByCode[row.pCode] || 0;
                runningBalances[row.pCode] = openingBalance;

                if (Math.abs(openingBalance) > 0.01 || row._forceOpeningRow) {
                    rows.push({
                        Fecha: formatSafeDate(startDate),
                        Comprobante: 'SALDO',
                        'Código PUC': row.pCode,
                        Cuenta: row.pName,
                        Tercero: '-',
                        Detalle: 'SALDO ANTERIOR AL PERÍODO',
                        Débito: 0,
                        Crédito: 0,
                        Saldo: openingBalance,
                        __style: 'subtotal'
                    });
                }
            }

            if (row._openingOnly) return;

            const isDebitNature = isDebitNatureCode(row.pCode);
            if (row.isDebit) {
                runningBalances[row.pCode] = (runningBalances[row.pCode] || 0) + (isDebitNature ? row.val : -row.val);
            } else {
                runningBalances[row.pCode] = (runningBalances[row.pCode] || 0) + (isDebitNature ? -row.val : row.val);
            }

            rows.push({
                Fecha: formatSafeDate(row.date),
                Comprobante: row.vId,
                'Código PUC': row.pCode,
                Cuenta: row.pName,
                Tercero: row.tercero,
                Detalle: row.description || '',
                Débito: row.isDebit ? row.val : 0,
                Crédito: row.isDebit ? 0 : row.val,
                Saldo: runningBalances[row.pCode]
            });
        });

        const totals = rows.reduce((acc, row) => {
            if (row.Comprobante === 'SALDO') return acc;
            acc.debit += Number(row.Débito) || 0;
            acc.credit += Number(row.Crédito) || 0;
            return acc;
        }, { debit: 0, credit: 0 });

        return { rows, totals };
    };

    const handleExportAuxiliarExcel = () => {
        const { rows, totals } = buildAuxiliaryExcelData();
        if (rows.length === 0) {
            toast({ variant: 'destructive', title: 'Libro Auxiliar vacío', description: 'No hay movimientos para exportar.' });
            return;
        }

        const accountLabel = accountFilters.length === 0
            ? 'TODAS LAS CUENTAS'
            : accountFilters.join(', ');

        exportProfessionalTable({
            fileName: `Libro_Auxiliar_${startDate}_al_${effectiveEndDate}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: 'LIBRO AUXILIAR / REPORTES',
            period: `DEL ${startDate} AL ${effectiveEndDate} | CUENTA: ${accountLabel}`,
            sheetName: 'Libro Auxiliar',
            orientation: 'landscape',
            columns: [
                { key: 'Fecha', label: 'FECHA', width: 13, type: 'text' },
                { key: 'Comprobante', label: 'COMPROBANTE', width: 14, type: 'text' },
                { key: 'Código PUC', label: 'CÓDIGO PUC', width: 14, type: 'text' },
                { key: 'Cuenta', label: 'CUENTA', width: 32, type: 'text' },
                { key: 'Tercero', label: 'TERCERO / CONTACTO', width: 28, type: 'text' },
                { key: 'Detalle', label: 'DETALLE', width: 42, type: 'text' },
                { key: 'Débito', label: 'DÉBITO', width: 17, type: 'currency' },
                { key: 'Crédito', label: 'CRÉDITO', width: 17, type: 'currency' },
                { key: 'Saldo', label: 'SALDO', width: 18, type: 'currency' }
            ],
            rows,
            summaryRows: [{
                Detalle: 'TOTAL MOVIMIENTOS DEL FILTRO',
                Débito: totals.debit,
                Crédito: totals.credit,
                __style: 'total'
            }],
            notes: [
                'El saldo anterior se toma del Libro Mayor para asegurar conciliación entre libros.',
                'Los saldos se calculan según la naturaleza débito/crédito de cada cuenta PUC.'
            ]
        });
        toast({ title: 'Excel profesional generado', description: 'Libro Auxiliar exportado con saldos corridos y control de movimientos.' });
    };

    // 🚀 FUNCIÓN DE IMPRESIÓN DEL LIBRO AUXILIAR / REPORTE FILTRADO
    const handlePrintFilteredPdf = () => {
        if (!filteredPrintRef.current) return;
        setIsPrinting(true);
        const printContent = filteredPrintRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=1000,height=800');
        if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador activado", description: "Permite los pop-ups para imprimir." }); setIsPrinting(false); return; }
        
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => style.outerHTML).join('\n');

        let accountName = "TODAS LAS CUENTAS";
        if (accountFilters.length === 1) {
            const accObj = activeAccountsInYear.find(a => a.number === accountFilters[0]);
            if (accObj) accountName = `${accObj.number} - ${accObj.name}`;
            else accountName = `PUC: ${accountFilters[0]}`;
        } else if (accountFilters.length > 1) {
            accountName = `MÚLTIPLES CUENTAS (${accountFilters.length} seleccionadas)`;
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Libro_Auxiliar_${selectedYear}</title>
                  ${styles}
                  <style>
                      @media print {
                          @page { margin: 10mm; size: landscape; }
                          body { 
                              -webkit-print-color-adjust: exact !important; 
                              print-color-adjust: exact !important; 
                              font-family: Arial, sans-serif;
                          }
                          table { page-break-inside: auto; }
                          tr { page-break-inside: avoid; page-break-after: auto; }
                          thead { display: table-header-group; }
                      }
                  </style>
              </head>
              <body class="bg-white p-8">
                  <div class="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
                      <div>
                          <h1 class="text-2xl font-black uppercase text-black tracking-tight">${cleanPrintedCompanyName(activeCompany?.name || "PARROQUIA PADRE MISERICORDIOSO")}</h1>
                          <p class="text-sm font-semibold text-black mt-1">NIT: ${activeCompany?.doc || "802012765"} | ${activeCompany?.address || "CRA 9G # 77 - 42"}</p>
                      </div>
                      <div class="text-right">
                          <h2 class="text-xl font-bold text-slate-800 uppercase">LIBRO AUXILIAR / REPORTES</h2>
                          <p class="text-sm font-mono mt-1">AÑO FISCAL: ${selectedYear}</p>
                          <p class="text-sm font-mono font-bold text-blue-700 mt-1">CUENTA: ${accountName}</p>
                      </div>
                  </div>
                  ${printContent}
                  <div class="mt-12 pt-4 border-t text-xs text-slate-500 text-center">
                      Documento generado por Sistema Contable Automatizado - Fecha de impresión: ${new Date().toLocaleString('es-CO')}
                  </div>
              </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
            setIsPrinting(false);
            setPrintFilteredOpen(false);
        }, 500);
    };

    // 🚀 MÓDULO 1: IMPRESIÓN LEGAL DEL LIBRO DIARIO
    const handlePrintDiarioPdf = () => {
        if (filteredTransactions.length === 0) { 
            toast({ variant: 'destructive', title: "Libro Vacío", description: "No hay datos en este mes para generar el Libro Diario." }); 
            return; 
        }

        setIsPrinting(true);
        const printWindow = window.open('', '_blank', 'width=1000,height=800');
        if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador activado", description: "Permite los pop-ups para imprimir." }); setIsPrinting(false); return; }

        // 🚀 Validación Legal: Máximo 31 días
        const diffDays = differenceInDays(parseAccountingDate(effectiveEndDate), parseAccountingDate(startDate));
        if (diffDays > 31 || diffDays < 0) {
            toast({ variant: 'destructive', title: "Rango Inválido", description: "El Libro Diario no puede generarse por un periodo mayor a 31 días continuos según normativa." });
            setIsPrinting(false);
            return;
        }

        const periodText = `DEL ${formatSafeDate(startDate)} AL ${formatSafeDate(effectiveEndDate)}`;

        // Generar filas del Libro Diario (Partida Doble Estricta)
        let totalDebit = 0;
        let totalCredit = 0;
        const printRows = [];
        const processedIds = new Set();

        filteredTransactions.forEach(t => {
            if (processedIds.has(t.id)) return;
            let vId = t.voucherNumber ? `${t.voucherPrefix || 'A'}-${String(t.voucherNumber).padStart(4, '0')}` : '-';
            const displayDate = formatSafeDate(t.date);

            // Manejo de Cruces Internos (Mismo Comprobante)
            if (t.isInternalTransfer && !t.debitAccount) {
                const baseId = t.id.replace(/-exp$|-inc$/, '');
                const isExp = t.id.endsWith('-exp');
                const sibling = filteredTransactions.find(x => x.id === baseId + (isExp ? '-inc' : '-exp'));
                
                if (sibling) {
                    processedIds.add(t.id);
                    processedIds.add(sibling.id);
                    
                    const expensePart = isExp ? t : sibling;
                    const incomePart = isExp ? sibling : t;
                    const sourceAsset = getAssetDetails(expensePart.destination, expensePart.category);
                    const destAsset = getAssetDetails(incomePart.destination, incomePart.category);
                    const monto = parseFloat(expensePart.amount) || 0;
                    
                    totalDebit += monto;
                    totalCredit += monto;

                    printRows.push(`
                        <tr>
                            <td class="td-center">${displayDate}</td>
                            <td class="td-center bold">${vId}</td>
                            <td class="td-left"><span class="bold">${destAsset.code}</span><br/><span class="sub-text">${destAsset.name}</span></td>
                            <td class="td-left">${expensePart.description}</td>
                            <td class="td-num">${monto.toLocaleString('es-CO', {minimumFractionDigits:2})}</td>
                            <td class="td-num">-</td>
                        </tr>
                        <tr>
                            <td class="td-center border-b"></td>
                            <td class="td-center border-b"></td>
                            <td class="td-left indent-1 border-b"><span class="bold">${sourceAsset.code}</span><br/><span class="sub-text">${sourceAsset.name}</span></td>
                            <td class="td-left border-b"></td>
                            <td class="td-num border-b">-</td>
                            <td class="td-num border-b">${monto.toLocaleString('es-CO', {minimumFractionDigits:2})}</td>
                        </tr>
                    `);
                    return;
                }
            }

            const accountingRows = resolveAccountingRows(t);
            accountingRows.forEach((row, rowIndex) => {
                const dVal = Number(row.debit) || 0;
                const cVal = Number(row.credit) || 0;
                totalDebit += dVal;
                totalCredit += cVal;
                const isLast = rowIndex === accountingRows.length - 1;

                printRows.push(`
                    <tr>
                        <td class="td-center ${isLast ? 'border-b' : ''}">${rowIndex === 0 ? displayDate : ''}</td>
                        <td class="td-center bold ${isLast ? 'border-b' : ''}">${rowIndex === 0 ? vId : ''}</td>
                        <td class="td-left ${rowIndex > 0 ? 'indent-1 ' : ''}${isLast ? 'border-b' : ''}"><span class="bold">${row.account?.code || 'N/A'}</span><br/><span class="sub-text">${row.account?.name || '-'}</span></td>
                        <td class="td-left ${isLast ? 'border-b' : ''}">${rowIndex === 0 ? t.description : ''}</td>
                        <td class="td-num ${isLast ? 'border-b' : ''}">${dVal > 0 ? dVal.toLocaleString('es-CO', {minimumFractionDigits:2}) : '-'}</td>
                        <td class="td-num ${isLast ? 'border-b' : ''}">${cVal > 0 ? cVal.toLocaleString('es-CO', {minimumFractionDigits:2}) : '-'}</td>
                    </tr>
                `);
            });
        });

        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
        const companyName = cleanPrintedCompanyName(activeCompany?.name || "PARROQUIA PADRE MISERICORDIOSO");
        const companyNit = activeCompany?.doc || "802012765";

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Libro_Diario_${selectedYear}</title>
                  <style>
                      @media print {
                          @page { margin: 15mm; size: portrait; }
                          body { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: black; }
                          table { page-break-inside: auto; border-collapse: collapse; width: 100%; }
                          tr { page-break-inside: avoid; page-break-after: auto; }
                          thead { display: table-header-group; }
                      }
                      body { font-family: 'Times New Roman', Times, serif; font-size: 11px; color: black; margin: 0; padding: 20px; }
                      
                      .header { text-align: center; margin-bottom: 25px; line-height: 1.4; border-bottom: 2px solid black; padding-bottom: 10px;}
                      .header-title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; }
                      .header-sub { font-size: 12px; font-weight: bold; margin: 0; }
                      .header-center-title { font-size: 14px; font-weight: bold; margin: 10px 0 0 0; text-transform: uppercase; }
                      
                      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                      th { border-bottom: 1px solid black; border-top: 1px solid black; padding: 6px 4px; font-weight: bold; font-size: 11px; }
                      td { padding: 4px; vertical-align: top; }
                      .border-b { border-bottom: 1px solid #ccc; }
                      .td-center { text-align: center; width: 10%; }
                      .td-left { text-align: left; width: 30%; }
                      .td-num { width: 10%; text-align: right; }
                      .bold { font-weight: bold; }
                      .sub-text { font-size: 10px; text-transform: uppercase; color: #333; }
                      .indent-1 { padding-left: 20px; }
                      
                      .totals-row td { font-weight: bold; border-top: 2px solid black; border-bottom: 4px double black; padding-top: 8px; padding-bottom: 8px; font-size: 12px; }
                      .warning-row td { text-align: center; color: red; font-weight: bold; padding: 5px; border-bottom: none !important; }
                      .footer { margin-top: 40px; text-align: center; font-size: 9px; }
                  </style>
              </head>
              <body>
                  <div class="header">
                      <p class="header-title">${companyName}</p>
                      <p class="header-sub">NIT: ${companyNit}</p>
                      <p class="header-center-title">LIBRO DIARIO OFICIAL</p>
                      <p class="header-sub">${periodText}</p>
                  </div>
                  
                  <table>
                      <thead>
                          <tr>
                              <th style="text-align:center;">Fecha</th>
                              <th style="text-align:center;">Comp.</th>
                              <th style="text-align:left;">Cuenta (PUC)</th>
                              <th style="text-align:left;">Detalle</th>
                              <th style="text-align:right;">Débito</th>
                              <th style="text-align:right;">Crédito</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${printRows.join('')}
                          <tr class="totals-row">
                              <td colspan="4" style="text-align:right;">SUMAS IGUALES:</td>
                              <td class="td-num">${totalDebit.toLocaleString('es-CO', {minimumFractionDigits:2})}</td>
                              <td class="td-num">${totalCredit.toLocaleString('es-CO', {minimumFractionDigits:2})}</td>
                          </tr>
                          ${!isBalanced ? `<tr class="warning-row"><td colspan="6">ADVERTENCIA: LAS SUMAS NO SON IGUALES. REVISE LOS ASIENTOS.</td></tr>` : ''}
                      </tbody>
                  </table>
                  
                  <div class="footer">
                      Documento Oficial Generado - Fecha de impresión: ${new Date().toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: true })}
                  </div>
              </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); setIsPrinting(false); }, 500);
    };

    const handlePrint = (t) => {
        const accountingRows = t._isMerged
            ? [
                { account: t._destAccount, debit: t._rawAmount, credit: 0 },
                { account: t._sourceAccount, debit: 0, credit: t._rawAmount },
              ]
            : resolveAccountingRows(t);

        const debitRow = accountingRows.find(row => row.debit > 0) || accountingRows[0];
        const creditRow = accountingRows.find(row => row.credit > 0) || accountingRows[accountingRows.length - 1];
        const debit = { ...debitRow.account, value: debitRow.debit || 0 };
        const credit = { ...creditRow.account, value: creditRow.credit || 0 };

        let resolvedContactName = t.contact;
        if (!resolvedContactName && t.contactId && contacts) {
            const foundContact = contacts.find(c => String(c.id) === String(t.contactId));
            if (foundContact) {
                resolvedContactName = foundContact.name;
            }
        }

        const enrichedTransaction = {
            ...t,
            contact: resolvedContactName,
            accountingRows,
            accountCode: t._accountNumber || (t.type === 'income' ? credit.code : debit.code),
            debitAccount: t.debitAccount || debit,
            creditAccount: t.creditAccount || credit,
            amount: t._rawAmount || getTransactionTotal(t)
        };

        setTransactionToPrint(enrichedTransaction);
        setPrintDialogOpen(true);
    };

    const handleExportVoucherExcel = () => {
        if (!transactionToPrint) return;

        const accountingRows = Array.isArray(transactionToPrint.accountingRows) && transactionToPrint.accountingRows.length
            ? transactionToPrint.accountingRows
            : resolveAccountingRows(transactionToPrint);

        const rows = accountingRows.map(row => ({
            'Código PUC': row.account?.code || '',
            Cuenta: row.account?.name || '',
            Débito: Number(row.debit) || 0,
            Crédito: Number(row.credit) || 0
        }));

        const totalDebit = rows.reduce((sum, row) => sum + row.Débito, 0);
        const totalCredit = rows.reduce((sum, row) => sum + row.Crédito, 0);
        const voucherId = transactionToPrint.voucherNumber
            ? `${transactionToPrint.voucherPrefix || 'A'}-${String(transactionToPrint.voucherNumber).padStart(4, '0')}`
            : 'SIN-NUMERO';

        exportProfessionalTable({
            fileName: `Comprobante_${voucherId}_${String(transactionToPrint.date || '').slice(0, 10)}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: `COMPROBANTE CONTABLE ${voucherId}`,
            period: `FECHA: ${formatSafeDate(transactionToPrint.date)} | CONCEPTO: ${transactionToPrint.description || ''}`,
            sheetName: 'Comprobante',
            columns: [
                { key: 'Código PUC', label: 'CÓDIGO PUC', width: 16, type: 'text' },
                { key: 'Cuenta', label: 'CUENTA', width: 42, type: 'text' },
                { key: 'Débito', label: 'DÉBITO (COP)', width: 20, type: 'currency' },
                { key: 'Crédito', label: 'CRÉDITO (COP)', width: 20, type: 'currency' }
            ],
            rows,
            summaryRows: [{
                Cuenta: 'SUMAS IGUALES',
                Débito: totalDebit,
                Crédito: totalCredit,
                __style: Math.abs(totalDebit - totalCredit) < 0.01 ? 'total' : 'subtotal'
            }],
            notes: [
                `Tercero / contacto: ${transactionToPrint.contact || transactionToPrint.beneficiary || '-'}`,
                'El comprobante debe conservarse con sus soportes documentales.'
            ]
        });
        toast({ title: 'Excel profesional generado', description: `Comprobante ${voucherId} exportado correctamente.` });
    };

    const handlePrintToPdf = () => {
        if (!voucherRef.current) return;
        setIsPrinting(true);
        const printContent = voucherRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador activado", description: "Por favor permite las ventanas emergentes (pop-ups) para imprimir." }); setIsPrinting(false); return; }
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(style => style.outerHTML)
            .join('\n');

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Comprobante_${transactionToPrint?.voucherNumber || 'Transaccion'}</title>
                  ${styles}
                  <style>
                      @media print {
                          @page { margin: 10mm; size: auto; }
                          body { 
                              -webkit-print-color-adjust: exact !important; 
                              print-color-adjust: exact !important; 
                          }
                      }
                  </style>
              </head>
              <body class="bg-white p-8">
                  ${printContent}
              </body>
          </html>
      `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
            setIsPrinting(false);
            toast({ title: "Documento procesado" });
        }, 500);
    };

    const handleExportBillingExcel = () => {
        if (!billingDocToPrint) return;

        const docNumber = `CC-${String(
            (parseInt(billingDocToPrint?.voucherNumber, 10) || 0) + (parseInt(voucherConfig?.expense, 10) || 0)
        ).padStart(4, '0')}`;

        exportProfessionalTable({
            fileName: `Cuenta_de_Cobro_${docNumber}_${String(billingDocToPrint.date || '').slice(0, 10)}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: `CUENTA DE COBRO / DOCUMENTO SOPORTE ${docNumber}`,
            period: `FECHA: ${formatSafeDate(billingDocToPrint.date)}`,
            sheetName: 'Cuenta de Cobro',
            columns: [
                { key: 'Campo', label: 'CAMPO', width: 28, type: 'text' },
                { key: 'Detalle', label: 'DETALLE', width: 58, type: 'text' },
                { key: 'Valor', label: 'VALOR (COP)', width: 20, type: 'currency' }
            ],
            rows: [
                { Campo: 'Beneficiario / Acreedor', Detalle: billingDocToPrint.beneficiary || '-', Valor: null },
                { Campo: 'Identificación', Detalle: billingDocToPrint.docNumber || '-', Valor: null },
                { Campo: 'Concepto', Detalle: billingDocToPrint.concept || '-', Valor: null },
                { Campo: 'Comprobante relacionado', Detalle: `E-${String(billingDocToPrint.voucherNumber || '').padStart(4, '0')}`, Valor: null },
                { Campo: 'Valor a pagar', Detalle: '', Valor: Number(billingDocToPrint.amount || 0), __style: 'total' }
            ],
            notes: [
                'Documento de soporte generado a partir del comprobante de egreso registrado en el sistema.',
                'Debe conservarse con factura, cuenta de cobro, soporte de pago o documento equivalente, según corresponda.'
            ]
        });
        toast({ title: 'Excel profesional generado', description: 'Cuenta de Cobro exportada en formato de revisión.' });
    };

    const handleExportReceiptExcel = () => {
        if (!receiptToPrint) return;

        const receiptNumber = `RC-${String(
            (parseInt(receiptToPrint?.voucherNumber, 10) || 0) + (parseInt(voucherConfig?.income, 10) || 0)
        ).padStart(4, '0')}`;

        exportProfessionalTable({
            fileName: `Recibo_de_Caja_${receiptNumber}_${String(receiptToPrint.date || '').slice(0, 10)}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: `RECIBO DE CAJA / DONACIÓN ${receiptNumber}`,
            period: `FECHA: ${formatSafeDate(receiptToPrint.date)}`,
            sheetName: 'Recibo de Caja',
            columns: [
                { key: 'Campo', label: 'CAMPO', width: 28, type: 'text' },
                { key: 'Detalle', label: 'DETALLE', width: 58, type: 'text' },
                { key: 'Valor', label: 'VALOR (COP)', width: 20, type: 'currency' }
            ],
            rows: [
                { Campo: 'Recibido de', Detalle: receiptToPrint.beneficiary || '-', Valor: null },
                { Campo: 'Identificación', Detalle: receiptToPrint.docNumber || '-', Valor: null },
                { Campo: 'Concepto', Detalle: receiptToPrint.description || '-', Valor: null },
                { Campo: 'Comprobante relacionado', Detalle: `${receiptToPrint.voucherPrefix || 'I'}-${String(receiptToPrint.voucherNumber || '').padStart(4, '0')}`, Valor: null },
                { Campo: 'Valor recibido', Detalle: numeroALetras(Number(receiptToPrint.amount || 0)), Valor: Number(receiptToPrint.amount || 0), __style: 'total' }
            ],
            notes: [
                'Recibo generado a partir del ingreso registrado en el sistema.',
                'Conservar con el soporte de origen de los fondos cuando aplique.'
            ]
        });
        toast({ title: 'Excel profesional generado', description: 'Recibo de Caja exportado en formato de revisión.' });
    };

    const handlePrintBillingDocPdf = () => {
        if (!billingRef.current) return;
        setIsPrinting(true);
        const printContent = billingRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador activado", description: "Por favor permite las ventanas emergentes (pop-ups) para imprimir." }); setIsPrinting(false); return; }
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => style.outerHTML).join('\n');

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Cuenta_Cobro_${billingDocToPrint?.id}</title>
                  ${styles}
                  <style>
                      @media print {
                          @page { margin: 5mm; size: letter portrait; }
                          body { 
                              -webkit-print-color-adjust: exact !important; 
                              print-color-adjust: exact !important; 
                              margin: 0;
                          }
                      }
                  </style>
              </head>
              <body class="bg-white">
                  <div style="width: 205.9mm; height: 130mm; box-sizing: border-box; position: relative; margin: 0 auto;">
                      ${printContent}
                  </div>
              </body>
          </html>
      `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
            setIsPrinting(false);
            setPrintBillingOpen(false);
        }, 500);
    };

    const handlePrintReceiptPdf = () => {
        if (!receiptRef.current) return;
        setIsPrinting(true);
        const printContent = receiptRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador activado", description: "Por favor permite las ventanas emergentes (pop-ups) para imprimir." }); setIsPrinting(false); return; }
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => style.outerHTML).join('\n');

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Recibo_${receiptToPrint?.voucherNumber}</title>
                  ${styles}
                  <style>
                      @media print {
                          @page { margin: 5mm; size: letter portrait; }
                          body { 
                              -webkit-print-color-adjust: exact !important; 
                              print-color-adjust: exact !important; 
                              margin: 0;
                          }
                      }
                  </style>
              </head>
              <body class="bg-white">
                  <div style="width: 205.9mm; height: 130mm; box-sizing: border-box; position: relative; margin: 0 auto;">
                      ${printContent}
                  </div>
              </body>
          </html>
      `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
            setIsPrinting(false);
            setPrintReceiptOpen(false);
        }, 500);
    };

    // =========================================================================
    // 🚀 MÓDULO 2: ALGORITMO DEL LIBRO MAYOR Y DE BALANCES
    // =========================================================================
    const isDebitNatureCode = (code) => {
        const value = String(code || '');
        if (value.startsWith('1592')) return false; // Depreciación acumulada: naturaleza crédito
        return ['1', '5', '6', '7', '8'].includes(value.charAt(0));
    };

    const splitBalanceByNature = (code, rawValue) => {
        const value = Number(rawValue) || 0;
        const debitNature = isDebitNatureCode(code);

        if (debitNature) {
            return value >= 0
                ? { debit: value, credit: 0 }
                : { debit: 0, credit: Math.abs(value) };
        }

        return value >= 0
            ? { debit: 0, credit: value }
            : { debit: Math.abs(value), credit: 0 };
    };

    const libroMayorData = useMemo(() => {
        const mayor = {};

        // 1. Inicializar con las cuentas del catálogo
        (accounts || []).forEach(acc => {
            mayor[acc.number] = { code: acc.number, name: acc.name, saldoAnterior: 0, debito: 0, credito: 0, nuevoSaldo: 0 };
        });

        // 2. Saldos anteriores: las cuentas de liquidez usan el MISMO motor
        // de Balance/Dashboard/Tributarios. Así Caja, Bancos y Aportes no pueden
        // reconstruirse con una fórmula distinta dentro del Libro Mayor.
        const isLiquidityCode = (code) => {
            const value = String(code || '');
            return value.startsWith('1105') || value.startsWith('1110') || value.startsWith('1120') || value.startsWith('1295');
        };

        const openingDate = new Date(startDate + 'T00:00:00');
        openingDate.setDate(openingDate.getDate() - 1);
        const openingCutoff = format(openingDate, 'yyyy-MM-dd');

        const rawValidTransactions = (transactions || [])
            .filter(isRelevant)
            .filter(t => !['eliminado', 'anulado', 'cancelado', 'borrador'].includes(String(t.status || '').toLowerCase()));

        const liquidityOpening = calculateLiquidityBalances({
            transactions: rawValidTransactions,
            initialBalances: (initialBalances || []).filter(isRelevant),
            bankAccounts: (bankAccounts || []).filter(isRelevant),
            cashAccounts: (cashAccounts || []).filter(isRelevant),
            accounts: accounts || [],
            cutoffDate: openingCutoff,
        });

        // Saldos iniciales no líquidos siguen usando su fuente histórica normal.
        (initialBalances || []).filter(isRelevant).forEach(ib => {
            const code = String(ib.accountingCode || '11050501');
            if (isLiquidityCode(code)) return;
            if (!mayor[code]) mayor[code] = { code, name: ib.accountingName || 'CUENTA INICIAL', saldoAnterior: 0, debito: 0, credito: 0, nuevoSaldo: 0 };
            mayor[code].saldoAnterior += parseFloat(ib.balance) || 0;
        });

        const seedLiquidity = (code, name, value) => {
            const amount = Number(value) || 0;
            if (!mayor[code]) mayor[code] = { code, name, saldoAnterior: 0, debito: 0, credito: 0, nuevoSaldo: 0 };
            mayor[code].name = mayor[code].name || name;
            mayor[code].saldoAnterior = amount;
        };

        seedLiquidity('11050501', 'CAJA PRINCIPAL', liquidityOpening.mainCash);

        (cashAccounts || []).filter(isRelevant).forEach(ca => {
            const code = String(ca.accounting_account || '1105');
            const amount = Number(liquidityOpening.customCash?.[String(ca.id)] || 0);
            if (!mayor[code]) mayor[code] = { code, name: ca.name || 'CAJA', saldoAnterior: 0, debito: 0, credito: 0, nuevoSaldo: 0 };
            mayor[code].saldoAnterior += amount;
        });

        (bankAccounts || []).filter(isRelevant).forEach(ba => {
            const code = String(ba.accountingCode || '111005');
            const amount = Number(liquidityOpening.banks?.[String(ba.id)] || 0);
            if (!mayor[code]) mayor[code] = { code, name: ba.accountingConcept || ba.bankName || 'BANCO', saldoAnterior: 0, debito: 0, credito: 0, nuevoSaldo: 0 };
            mayor[code].saldoAnterior += amount;
        });

        seedLiquidity('12950501', 'APORTES COOPERATIVA FRATERNIDAD', liquidityOpening.investments);

        // 3. Procesar todas las transacciones
        processedTransactions.forEach(t => {
            if (['eliminado', 'anulado', 'cancelado', 'borrador'].includes(String(t.status || '').toLowerCase())) return;
            if (t.isInternalTransfer && !t.debitAccount && String(t.id || '').endsWith('-inc')) return; 
            
            const tDate = typeof t.date === 'string'
                ? (t.date.includes('T') ? t.date.split('T')[0] : t.date.slice(0, 10))
                : toAccountingDateInput(t.date);
            const accountingRows = resolveAccountingRows(t);
            const isClaseResultados = accountingRows.some(row => {
                const code = String(row.account?.code || '');
                return code.startsWith('4') || code.startsWith('5');
            });

            const processEntry = (accCode, accName, amount, isDebitEntry) => {
                if (!accCode) return;
                const codeStr = String(accCode);
                if (!mayor[codeStr]) mayor[codeStr] = { code: codeStr, name: accName || 'N/A', saldoAnterior: 0, debito: 0, credito: 0, nuevoSaldo: 0 };
                
                const isDebitNature = isDebitNatureCode(codeStr);

                // 🚀 CORRECCIÓN DE AUDITORÍA: Aislamiento del Efectivo Real (Caja Principal)
                const isHistoricalOrAdjustment = t.voucherPrefix === 'A' || String(t.description).toUpperCase().includes('SALDO');

                if (codeStr === '11050501' && isHistoricalOrAdjustment && isClaseResultados) {
                    return;
                }

                if (tDate < startDate) {
                    // Caja/Bancos/Aportes ya vienen conciliados al día anterior por financialMovements.
                    // No se vuelven a acumular aquí, evitando duplicar movimientos históricos.
                    if (isLiquidityCode(codeStr)) return;
                    if (isDebitEntry) mayor[codeStr].saldoAnterior += (isDebitNature ? amount : -amount);
                    else mayor[codeStr].saldoAnterior += (isDebitNature ? -amount : amount);
                } else if (tDate >= startDate && tDate <= effectiveEndDate) {
                    if (isDebitEntry) mayor[codeStr].debito += amount;
                    else mayor[codeStr].credito += amount;
                }
            };

            accountingRows.forEach(row => {
                if (row.account?.code && row.debit > 0) processEntry(row.account.code, row.account.name, Number(row.debit) || 0, true);
                if (row.account?.code && row.credit > 0) processEntry(row.account.code, row.account.name, Number(row.credit) || 0, false);
            });
        });

        // 4. Contrapartida patrimonial de apertura para el balance de comprobación.
        // Los saldos físicos recibidos (Caja, Bancos, Aportes y demás activos/pasivos)
        // deben tener una contrapartida patrimonial, aunque no sea un movimiento del período.
        // Se usa la cuenta PUC 31400101 FONDO SOCIAL, ya existente en el catálogo.
        let openingDebitBalances = 0;
        let openingCreditBalances = 0;

        Object.values(mayor).forEach(acc => {
            const split = splitBalanceByNature(acc.code, acc.saldoAnterior);
            openingDebitBalances += split.debit;
            openingCreditBalances += split.credit;
        });

        const openingDifference = openingDebitBalances - openingCreditBalances;
        if (Math.abs(openingDifference) > 0.01) {
            const equityCode = '31400101';
            if (!mayor[equityCode]) {
                mayor[equityCode] = {
                    code: equityCode,
                    name: 'FONDO SOCIAL',
                    saldoAnterior: 0,
                    debito: 0,
                    credito: 0,
                    nuevoSaldo: 0
                };
            }
            // Cuenta 3 = naturaleza crédito. Un valor positivo equilibra un exceso débito.
            mayor[equityCode].saldoAnterior += openingDifference;
        }

        // 5. Aplicar ecuación contable para Nuevo Saldo
        return Object.values(mayor)
            .filter(acc => Math.abs(acc.saldoAnterior) > 0.01 || Math.abs(acc.debito) > 0.01 || Math.abs(acc.credito) > 0.01)
            .map(acc => {
                const isDebitNature = isDebitNatureCode(acc.code);
                if (isDebitNature) {
                    acc.nuevoSaldo = acc.saldoAnterior + acc.debito - acc.credito;
                } else {
                    acc.nuevoSaldo = acc.saldoAnterior - acc.debito + acc.credito;
                }
                return acc;
            })
            .sort((a, b) => a.code.localeCompare(b.code));
    }, [processedTransactions, transactions, accounts, initialBalances, bankAccounts, cashAccounts, startDate, effectiveEndDate, isRelevant]);

    const handleExportMayorExcel = () => {
        if (libroMayorData.length === 0) {
            toast({ variant: 'destructive', title: 'Libro Mayor vacío', description: 'No hay datos para exportar.' });
            return;
        }

        const rows = libroMayorData.map(acc => {
            const previous = splitBalanceByNature(acc.code, acc.saldoAnterior);
            const ending = splitBalanceByNature(acc.code, acc.nuevoSaldo);

            return {
                Código: acc.code,
                Cuenta: acc.name,
                'Saldo Ant. Débito': previous.debit || null,
                'Saldo Ant. Crédito': previous.credit || null,
                'Mov. Débito': Number(acc.debito) || null,
                'Mov. Crédito': Number(acc.credito) || null,
                'Nuevo Saldo Débito': ending.debit || null,
                'Nuevo Saldo Crédito': ending.credit || null
            };
        });

        const totals = rows.reduce((sum, row) => ({
            prevDebit: sum.prevDebit + (Number(row['Saldo Ant. Débito']) || 0),
            prevCredit: sum.prevCredit + (Number(row['Saldo Ant. Crédito']) || 0),
            movDebit: sum.movDebit + (Number(row['Mov. Débito']) || 0),
            movCredit: sum.movCredit + (Number(row['Mov. Crédito']) || 0),
            endDebit: sum.endDebit + (Number(row['Nuevo Saldo Débito']) || 0),
            endCredit: sum.endCredit + (Number(row['Nuevo Saldo Crédito']) || 0)
        }), { prevDebit: 0, prevCredit: 0, movDebit: 0, movCredit: 0, endDebit: 0, endCredit: 0 });

        exportProfessionalTable({
            fileName: `Libro_Mayor_${startDate}_al_${effectiveEndDate}`,
            companyName: cleanPrintedCompanyName(activeCompany?.name || 'ENTIDAD CONTABLE'),
            nit: activeCompany?.doc || '',
            title: 'LIBRO MAYOR Y BALANCE DE COMPROBACIÓN',
            period: `DEL ${startDate} AL ${effectiveEndDate}`,
            sheetName: 'Libro Mayor',
            orientation: 'landscape',
            columns: [
                { key: 'Código', label: 'CÓDIGO', width: 14, type: 'text' },
                { key: 'Cuenta', label: 'CUENTA', width: 34, type: 'text' },
                { key: 'Saldo Ant. Débito', label: 'SALDO ANT. DÉBITO', width: 18, type: 'currency' },
                { key: 'Saldo Ant. Crédito', label: 'SALDO ANT. CRÉDITO', width: 18, type: 'currency' },
                { key: 'Mov. Débito', label: 'MOV. DÉBITO', width: 17, type: 'currency' },
                { key: 'Mov. Crédito', label: 'MOV. CRÉDITO', width: 17, type: 'currency' },
                { key: 'Nuevo Saldo Débito', label: 'NUEVO SALDO DÉBITO', width: 19, type: 'currency' },
                { key: 'Nuevo Saldo Crédito', label: 'NUEVO SALDO CRÉDITO', width: 19, type: 'currency' }
            ],
            rows,
            summaryRows: [{
                Cuenta: 'SUMAS DE COMPROBACIÓN',
                'Saldo Ant. Débito': totals.prevDebit,
                'Saldo Ant. Crédito': totals.prevCredit,
                'Mov. Débito': totals.movDebit,
                'Mov. Crédito': totals.movCredit,
                'Nuevo Saldo Débito': totals.endDebit,
                'Nuevo Saldo Crédito': totals.endCredit,
                __style: (
                    Math.abs(totals.prevDebit - totals.prevCredit) < 0.01 &&
                    Math.abs(totals.movDebit - totals.movCredit) < 0.01 &&
                    Math.abs(totals.endDebit - totals.endCredit) < 0.01
                ) ? 'success' : 'total'
            }],
            notes: [
                'Los saldos se presentan por naturaleza Débito/Crédito para facilitar el balance de comprobación.',
                'La cuenta 31400101 – Fondo Social incorpora la contrapartida patrimonial de los saldos de apertura; no representa un movimiento de efectivo del período.',
                'Control esperado: Saldo anterior Débito = Crédito, Movimientos Débito = Crédito y Nuevo saldo Débito = Crédito.'
            ]
        });
        toast({ title: 'Excel profesional generado', description: 'Libro Mayor exportado con saldos, movimientos y sumas de control.' });
    };

    const handlePrintMayorPdf = () => {
        if (libroMayorData.length === 0) { 
            toast({ variant: 'destructive', title: "Libro Vacío", description: "No hay datos para generar el Libro Mayor." }); 
            return; 
        }

        setIsPrinting(true);
        const printWindow = window.open('', '_blank', 'width=1000,height=800');
        if (!printWindow) { toast({ variant: 'destructive', title: "Bloqueador", description: "Permite los pop-ups para imprimir." }); setIsPrinting(false); return; }

        let totalAntDeb = 0, totalAntCred = 0, totalMovDeb = 0, totalMovCred = 0, totalNuevoDeb = 0, totalNuevoCred = 0;

        // 🚀 FORMATO NIIF: Paréntesis para naturalezas contrarias, excepto cuando el valor es CERO
        const formatearSaldoContable = (valor, codigoCuenta = '') => {
            const num = parseFloat(valor) || 0;
            const valorAbsoluto = Math.abs(num);

            // Si es cero (menor a un centavo), lo mostramos normal sin paréntesis
            if (valorAbsoluto < 0.01) {
                return (0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            // Si es depreciación o saldo negativo real, va con paréntesis
            if (codigoCuenta.startsWith('1592') || num < 0) {
                return `(${valorAbsoluto.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
            }
            
            return num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
        
        const rowsHtml = libroMayorData.map(acc => {
            const previous = splitBalanceByNature(acc.code, acc.saldoAnterior);
            const ending = splitBalanceByNature(acc.code, acc.nuevoSaldo);

            totalAntDeb += previous.debit;
            totalAntCred += previous.credit;
            totalMovDeb += acc.debito;
            totalMovCred += acc.credito;
            totalNuevoDeb += ending.debit;
            totalNuevoCred += ending.credit;
            
            return `
                <tr>
                    <td class="td-code">${acc.code}</td>
                    <td class="td-name">${acc.name}</td>
                    <td class="td-num">${formatearSaldoContable(previous.debit)}</td>
                    <td class="td-num">${formatearSaldoContable(previous.credit)}</td>
                    <td class="td-num">${formatearSaldoContable(acc.debito)}</td>
                    <td class="td-num">${formatearSaldoContable(acc.credito)}</td>
                    <td class="td-num">${formatearSaldoContable(ending.debit)}</td>
                    <td class="td-num">${formatearSaldoContable(ending.credit)}</td>
                </tr>
            `;
        }).join('');

        const companyName = cleanPrintedCompanyName(activeCompany?.name || "PARROQUIA PADRE MISERICORDIOSO");
        const companyNit = activeCompany?.doc || "802012765";

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Libro_Mayor_${selectedYear}</title>
                  <style>
                      @media print {
                          @page { margin: 10mm; size: landscape; }
                          body { font-family: 'Times New Roman', Times, serif; font-size: 10px; color: black; }
                          table { page-break-inside: auto; border-collapse: collapse; width: 100%; }
                          tr { page-break-inside: avoid; page-break-after: auto; }
                          thead { display: table-header-group; }
                      }
                      body { font-family: 'Times New Roman', Times, serif; font-size: 10px; color: black; margin: 0; padding: 12px; }
                      
                      /* 🚀 AQUÍ ESTÁ LA MAGIA DEL CENTRADO ABSOLUTO */
                      .header { text-align: center; margin-bottom: 25px; line-height: 1.4; border-bottom: 2px solid black; padding-bottom: 10px;}
                      .header-title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0; }
                      .header-sub { font-size: 12px; font-weight: bold; margin: 0; }
                      .header-center-title { font-size: 14px; font-weight: bold; margin: 10px 0 0 0; }
                      
                      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                      th { border-bottom: 1px solid black; border-top: 1px solid black; padding: 6px 4px; text-align: right; font-weight: bold; font-size: 11px; }
                      th:nth-child(1), th:nth-child(2) { text-align: left; }
                      td { padding: 4px; vertical-align: top; }
                      .td-code { width: 9%; font-weight: bold; }
                      .td-name { width: 25%; text-transform: uppercase; font-size: 9px; }
                      .td-num { width: 11%; text-align: right; font-size: 9px; }
                      .totals-row td { font-weight: bold; border-top: 1px solid black; border-bottom: 3px double black; padding-top: 8px; padding-bottom: 8px; }
                      .footer { margin-top: 40px; text-align: center; font-size: 9px; }
                  </style>
              </head>
              <body>
                  <div class="header">
                      <p class="header-title">${companyName}</p>
                      <p class="header-sub">NIT: ${companyNit}</p>
                      <p class="header-center-title">LIBRO MAYOR Y BALANCE DE COMPROBACIÓN</p>
                      <p class="header-sub">DEL ${formatSafeDate(startDate)} AL ${formatSafeDate(effectiveEndDate)}</p>
                  </div>
                  
                  <table>
                      <thead>
                          <tr>
                              <th>Código</th>
                              <th>Cuenta</th>
                              <th>Saldo Ant. Débito</th>
                              <th>Saldo Ant. Crédito</th>
                              <th>Mov. Débito</th>
                              <th>Mov. Crédito</th>
                              <th>Nuevo Saldo Débito</th>
                              <th>Nuevo Saldo Crédito</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${rowsHtml}
                          <tr class="totals-row">
                              <td colspan="2" style="text-align:right;">SUMAS DE COMPROBACIÓN:</td>
                              <td class="td-num">${formatearSaldoContable(totalAntDeb)}</td>
                              <td class="td-num">${formatearSaldoContable(totalAntCred)}</td>
                              <td class="td-num">${formatearSaldoContable(totalMovDeb)}</td>
                              <td class="td-num">${formatearSaldoContable(totalMovCred)}</td>
                              <td class="td-num">${formatearSaldoContable(totalNuevoDeb)}</td>
                              <td class="td-num">${formatearSaldoContable(totalNuevoCred)}</td>
                          </tr>
                      </tbody>
                  </table>
                  
                  <div class="footer">
                      Documento Oficial Generado - Fecha de impresión: ${new Date().toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: true })}
                  </div>
              </body>
          </html>
        `);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); setIsPrinting(false); }, 500);
    };

    return (
        <>
            <Helmet><title>Transacciones - Sistema Contable</title></Helmet>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div><h1 className="text-4xl font-bold text-slate-900 mb-2">Transacciones</h1><p className="text-slate-600">Control de movimientos financieros</p></div>
                    <div className="flex gap-2">
                        {canAdd && <Button variant="outline" onClick={() => setStoreDialogOpen(true)} className="text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100"><Store className="w-4 h-4 mr-2" />Tienda</Button>}
                        {canAdd && <Button variant="outline" onClick={() => setTransferDialogOpen(true)}><ArrowRightLeft className="w-4 h-4 mr-2" />Transferir</Button>}
                        {canAdd && <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"><FileSpreadsheet className="w-4 h-4 mr-2" />Conciliar Banco</Button>}
                        {canAdd && <Button onClick={() => { setEditingTransaction(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" />Nueva</Button>}
                        {isReadOnly && <span className="flex items-center text-slate-400 text-sm ml-2"><Lock className="w-4 h-4 mr-1" />Acceso Parcial</span>}
                    </div>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 space-y-4">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500" /></div>
                        
                        <div className="flex gap-2 items-center flex-wrap">
                            
                            {/* 🚀 FILTRO POR CUENTA PUC MULTIPLE */}
                            <div className="relative">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)} 
                                    className={`bg-white ${accountFilters.length > 0 ? 'border-blue-400 text-blue-700' : 'border-slate-300 text-slate-600'}`}
                                >
                                    <Filter className={`w-4 h-4 mr-2 ${accountFilters.length > 0 ? 'text-blue-600' : 'text-slate-400'}`} />
                                    {accountFilters.length === 0 ? 'Todas las cuentas' : `${accountFilters.length} cuentas filtradas`}
                                </Button>
                                {isAccountMenuOpen && (
                                    <div className="absolute top-full mt-2 right-0 md:left-0 w-80 bg-white border border-slate-200 shadow-2xl rounded-xl z-50 flex flex-col">
                                        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                                            <span className="font-bold text-slate-700 text-sm">Filtrar por Cuentas</span>
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-50" onClick={() => { setAccountFilters([]); setAccountSearchTerm(''); setIsAccountMenuOpen(false); }}>Limpiar</Button>
                                        </div>
                                        
                                        {/* 🚀 BARRA DE BÚSQUEDA INTEGRADA */}
                                        <div className="p-2 border-b border-slate-100 bg-white">
                                            <div className="relative">
                                                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Buscar número o concepto..." 
                                                    value={accountSearchTerm}
                                                    onChange={(e) => setAccountSearchTerm(e.target.value)}
                                                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                            {/* Si estamos buscando, escondemos "Mostrar todas" para limpiar visualmente */}
                                            {!accountSearchTerm && (
                                                <>
                                                    <label className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                                                        <input type="checkbox" checked={accountFilters.length === 0} onChange={() => setAccountFilters([])} className="w-4 h-4 text-blue-600 rounded" />
                                                        <span className="font-semibold text-slate-800 text-sm">Mostrar Todas</span>
                                                    </label>
                                                    <hr className="my-1 border-slate-100 mx-2" />
                                                </>
                                            )}
                                            
                                            {/* Filtrar lista según el número o el concepto */}
                                            {activeAccountsInYear
                                                .filter(acc => 
                                                    acc.number.includes(accountSearchTerm) || 
                                                    (acc.name || '').toLowerCase().includes(accountSearchTerm.toLowerCase())
                                                )
                                                .map(acc => (
                                                <label key={acc.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors border ${accountFilters.includes(acc.number) ? 'bg-blue-50/50 border-blue-200' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={accountFilters.includes(acc.number)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setAccountFilters([...accountFilters, acc.number]);
                                                            else setAccountFilters(accountFilters.filter(x => x !== acc.number));
                                                        }}
                                                        className="w-4 h-4 text-blue-600 rounded border-slate-300"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-slate-800">{acc.number}</span>
                                                        <span className="text-[11px] text-slate-500 leading-tight uppercase line-clamp-1" title={acc.name}>{acc.name}</span>
                                                    </div>
                                                </label>
                                            ))}

                                            {/* Mensajes si no hay resultados */}
                                            {activeAccountsInYear.length > 0 && activeAccountsInYear.filter(acc => acc.number.includes(accountSearchTerm) || (acc.name || '').toLowerCase().includes(accountSearchTerm.toLowerCase())).length === 0 && (
                                                <div className="p-4 text-center text-xs text-slate-500">No hay coincidencias para "{accountSearchTerm}"</div>
                                            )}

                                            {activeAccountsInYear.length === 0 && (
                                                <div className="p-4 text-center text-xs text-slate-400">No hay cuentas con movimientos este año.</div>
                                            )}
                                        </div>
                                        <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex gap-2">
                                            <Button className="w-full bg-slate-800 hover:bg-slate-900" size="sm" onClick={() => setIsAccountMenuOpen(false)}>Aplicar Filtro</Button>
                                        </div>
                                    </div>
                                )}                                
                            </div>

                            {/* 🚀 Calendarios de Rango */}
                            <div className="flex items-center gap-2 bg-white p-1 rounded-md border border-slate-200">
                                <input 
                                    type="date" 
                                    className="text-xs px-2 py-1.5 outline-none text-slate-700 font-mono bg-transparent" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)}
                                    title="Fecha Inicial"
                                />
                                <span className="text-slate-300">-</span>
                                <input 
                                    type="date" 
                                    className="text-xs px-2 py-1.5 outline-none text-slate-700 font-mono bg-transparent" 
                                    value={endDate} 
                                    max={todayDateKey}
                                    onChange={(e) => setEndDate(e.target.value > todayDateKey ? todayDateKey : e.target.value)}
                                    title="Fecha Final"
                                />
                            </div>
                            
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={() => setViewMode('balances')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'balances' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><TableIcon className="w-3 h-3 inline mr-1" /> Control</button>
                                <button onClick={() => setViewMode('accounting')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'accounting' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><BookOpen className="w-3 h-3 inline mr-1" /> Diario Oficial</button>
                                <button onClick={() => setViewMode('mayor')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'mayor' ? 'bg-white shadow-sm text-purple-700' : 'text-slate-500 hover:text-purple-600'}`}><Filter className="w-3 h-3 inline mr-1" /> Mayor y Balances</button>
                                <button onClick={() => setViewMode('billing')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'billing' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-blue-600'}`}><FileText className="w-3 h-3 inline mr-1" /> CxC</button>
                            </div>
                            {canEdit && (
    <>
        <Button variant="outline" size="icon" onClick={() => setConfigBillingOpen(true)} className="ml-1 text-slate-500 hover:text-blue-600 bg-white" title="Configurar Autogeneración Cuentas de Cobro"><Settings className="w-4 h-4"/></Button>
        <Button variant="outline" size="icon" onClick={() => setConfigVoucherOpen(true)} className="ml-1 text-slate-500 hover:text-purple-600 bg-white" title="Configurar Numeración Inicial"><Edit2 className="w-4 h-4"/></Button>
    </>
)}
                        </div>
                    </div>
                    
                    {viewMode !== 'billing' && (
                        <div className="flex gap-2 overflow-x-auto mt-2 pb-2">
                            {['all', 'income', 'expense', 'transfer', 'adjustment'].map(type => (
                                <Button 
                                    key={type} 
                                    variant={filterType === type ? 'default' : 'outline'} 
                                    size="sm" 
                                    onClick={() => setFilterType(type)} 
                                    className="capitalize"
                                >
                                    {type === 'all' ? 'Todas' : type === 'income' ? 'Ingresos' : type === 'expense' ? 'Gastos' : type === 'transfer' ? 'Transferencias' : 'Ajustes'}
                                </Button>
                            ))}
                            <div className="ml-auto flex gap-2">
                                {/* 🚀 BOTÓN DE IMPRESIÓN SIEMPRE VISIBLE */}
                                <Button variant="outline" size="sm" onClick={() => setPrintFilteredOpen(true)} className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm">
                                    <Printer className="w-4 h-4 mr-2" /> Imprimir Reporte
                                </Button>
                                {viewMode === 'accounting' ? (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => {
                                            if (!window.confirm("ADVERTENCIA LEGAL: Al oficializar el Libro Diario, todos los registros de este mes quedarán INALTERABLES y no podrán ser modificados ni eliminados. ¿Deseas proceder?")) return;
                                            
                                            // 1. Bloquear Inalterabilidad
                                            const idsToLock = new Set(displayTransactions.map(t => t.id));
                                            saveTransactions(transactions.map(t => idsToLock.has(t.id) ? { ...t, isLocked: true } : t));
                                            
                                            // 2. Exportar
                                            handleExportAccounting();
                                            toast({ title: "Libro Oficializado", description: "Los registros fueron bloqueados permanentemente por auditoría." });
                                        }} className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 shadow-sm font-bold">
                                            <Lock className="w-4 h-4 mr-2" /> Oficializar Mes
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handlePrintDiarioPdf} className="bg-white shadow-sm"><Printer className="w-4 h-4 mr-2" /> Imprimir Libro Diario</Button>
                                        <Button variant="ghost" size="sm" onClick={handleExportAccounting}><Download className="w-4 h-4 mr-2" /> Excel</Button>
                                    </>
                                ) : <Button variant="ghost" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" /> Excel</Button>}
                            </div>
                        </div>
                    )}
                </div>

                <motion.div layout className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                    {viewMode === 'balances' ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-700 font-medium border-b"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Comprobante</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3 text-right">Monto</th><th className="px-4 py-3 text-right bg-blue-50/50">Saldo Caja</th><th className="px-4 py-3 text-right bg-purple-50/50">Saldo Bancos</th><th className="px-4 py-3 text-right bg-green-50/50">Saldo Aportes</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displayTransactions.map((t) => {
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-50 group">
                                                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatSafeDate(t.date)}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-500 font-bold">{t.voucherNumber ? `${t.voucherPrefix || 'N/A'}-${String(t.voucherNumber).padStart(4, '0')}` : '-'}</td>
                                                <td className="px-4 py-3 text-slate-700 font-medium max-w-[200px] truncate" title={t.description}>{t.description}{t._isPending && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full">Pendiente</span>}</td>

                                                <td className="px-4 py-3 text-slate-600">
                                                    {t._dualDisplay ? (
                                                        <div className="flex flex-col text-[10px] leading-tight font-mono text-slate-500" title={t._dualDisplay}>
                                                            <span className="font-bold text-slate-700">{t.category || t.debitAccount?.name}</span>
                                                            <span>{t._dualDisplay}</span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${t._intelligentType === 'transfer' || t._intelligentType === 'adjustment' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>{t._categoryLabel || getTransactionCategoryLabel(t)}</span>
                                                            <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]">Dest: {t._destName}</span>
                                                        </>
                                                    )}
                                                </td>

                                                <td className={`px-4 py-3 text-right font-mono font-medium ${t._mergedAmount ? 'text-slate-800' : (t._intelligentType === 'transfer' || t._intelligentType === 'adjustment' ? 'text-slate-800' : (t.type === 'income' ? 'text-green-600' : 'text-red-600'))}`}>{t._mergedAmount ? t._mergedAmount : ((t.type === 'income' || t._intelligentType === 'transfer' || t._intelligentType === 'adjustment' ? '' : '-') + parseFloat(t.amount).toLocaleString('es-CO', { minimumFractionDigits: 0 }))}</td>
                                                <td className={`px-4 py-3 text-right font-mono text-slate-600 bg-blue-50/30 ${t._affectedColumn === 'cash' ? 'font-bold text-slate-900' : ''}`}>{t._calculatedCash.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                <td className={`px-4 py-3 text-right font-mono text-slate-600 bg-purple-50/30 ${t._affectedColumn === 'banks' ? 'font-bold text-slate-900' : ''}`}>{t._calculatedBanks.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                <td className={`px-4 py-3 text-right font-mono text-slate-600 bg-green-50/30 ${t._affectedColumn === 'aportes' ? 'font-bold text-slate-900' : ''}`}>{t._calculatedAportes.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50" onClick={() => handlePrint(t)} title="Imprimir Comprobante"><Printer className="w-3 h-3" /></Button>
                                                        
                                                        {t.type === 'expense' && !t.isInternalTransfer && !t.debitAccount && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50" onClick={() => handleGenerateBillingDoc(t)} title="Generar/Ver Cuenta de Cobro">
                                                                <FileText className="w-3 h-3" />
                                                            </Button>
                                                        )}

                                                        {t.type === 'income' && !t.isInternalTransfer && !t.debitAccount && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50" onClick={() => handleGenerateReceipt(t)} title="Generar Recibo de Caja / Certificado">
                                                                <FileCheck className="w-3 h-3" />
                                                            </Button>
                                                        )}

                                                        {!t.isLocked ? (
                                                            <>
                                                                {(canEdit || canAdd) && !isSystemManagedTransaction(t) && !invoicedTransactionIds.has(t.id) && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTransaction(t); setDialogOpen(true); }} title="Editar transacción"><Edit2 className="w-3 h-3" /></Button>}
                                                                {(isSystemManagedTransaction(t) || invoicedTransactionIds.has(t.id)) && <Lock className="w-3 h-3 text-slate-300 mx-1" title="Movimiento protegido por trazabilidad" />}
                                                                {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDelete(t.id)}><Trash2 className="w-3 h-3" /></Button>}
                                                            </>
                                                        ) : (
                                                            <Lock className="w-4 h-4 text-slate-300 ml-2" title="Registro oficializado e inalterable" />
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {displayTransactions.length === 0 && (<tr><td colSpan="9" className="text-center py-8 text-slate-400">No hay transacciones</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    ) : viewMode === 'accounting' ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-800 text-slate-200 font-medium"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Comp.</th><th className="px-4 py-3 w-1/3">Cuenta (PUC)</th><th className="px-4 py-3 w-1/3">Detalle</th><th className="px-4 py-3 text-right w-32">Débito</th><th className="px-4 py-3 text-right w-32">Crédito</th></tr></thead>
                                <tbody className="bg-white">
                                    {displayTransactions.map(t => {
                                        if (t._isMerged) return null;
                                        
                                        let vId = t.voucherNumber ? `${t.voucherPrefix || 'A'}-${String(t.voucherNumber).padStart(4, '0')}` : '-';
                                        const accountingRows = resolveAccountingRows(t);
                                        let rowColorClass = t.type === 'income' ? 'bg-green-50' : (t._intelligentType === 'transfer' || t._intelligentType === 'adjustment' ? 'bg-orange-50' : 'bg-red-50');

                                        return (
                                            <React.Fragment key={t.id}>
                                                {accountingRows.map((row, rowIndex) => (
                                                    <tr key={`${t.id}-accounting-${rowIndex}`} className={`${rowIndex === 0 ? 'border-t border-slate-100 ' : ''}${rowColorClass}`}>
                                                        <td className="px-4 py-2 text-slate-500">{rowIndex === 0 ? formatSafeDate(t.date) : ''}</td>
                                                        <td className="px-4 py-2 font-mono text-xs text-slate-400 font-bold">{rowIndex === 0 ? vId : ''}</td>
                                                        <td className={`px-4 py-2 ${rowIndex > 0 ? 'pl-8' : ''}`}>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-700 text-xs">{row.account?.code || 'N/A'}</span>
                                                                <span className="text-slate-600 text-xs uppercase">{row.account?.name || getTransactionCategoryLabel(t)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 text-slate-500 italic text-xs">{rowIndex === 0 ? t.description : ''}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-slate-800">{row.debit > 0 ? Number(row.debit).toLocaleString('es-CO', { minimumFractionDigits: 2 }) : '-'}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-slate-800">{row.credit > 0 ? Number(row.credit).toLocaleString('es-CO', { minimumFractionDigits: 2 }) : '-'}</td>
                                                    </tr>
                                                ))}
                                                <tr><td colSpan="6" className="h-1 bg-slate-50 border-b border-slate-200"></td></tr>
                                            </React.Fragment>
                                        );
                                    })}
                                     {displayTransactions.length === 0 && (<tr><td colSpan="6" className="text-center py-8 text-slate-400">No hay registros contables</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    ) : viewMode === 'mayor' ? (
                        <div className="overflow-x-auto">
                            <div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-purple-900 text-lg">Libro Mayor y Balance de Comprobación</h3>
                                    <p className="text-xs text-purple-700">Saldos por naturaleza Débito/Crédito y control automático de cuadre</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handlePrintMayorPdf} className="bg-white border-purple-200 text-purple-700 shadow-sm hover:bg-purple-100"><Printer className="w-4 h-4 mr-2" /> Imprimir Mayor Oficial (PDF)</Button>
                                    <Button variant="outline" size="sm" onClick={handleExportMayorExcel} className="bg-green-50 border-green-200 text-green-700 shadow-sm hover:bg-green-100"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel Profesional</Button>
                                </div>
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-800 text-slate-200 font-medium">
                                    <tr>
                                        <th className="px-4 py-3">Código</th>
                                        <th className="px-4 py-3 w-1/3">Cuenta</th>
                                        <th className="px-3 py-3 text-right">Saldo Ant. Débito</th>
                                        <th className="px-3 py-3 text-right">Saldo Ant. Crédito</th>
                                        <th className="px-3 py-3 text-right text-blue-300">Mov. Débito</th>
                                        <th className="px-3 py-3 text-right text-orange-300">Mov. Crédito</th>
                                        <th className="px-3 py-3 text-right">Nuevo Saldo Débito</th>
                                        <th className="px-3 py-3 text-right">Nuevo Saldo Crédito</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {libroMayorData.map(acc => (
                                        <tr key={acc.code} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-mono font-bold text-slate-700">{acc.code}</td>
                                            <td className="px-4 py-3 text-xs uppercase text-slate-600">{acc.name}</td>
                                            {(() => {
                                                const previous = splitBalanceByNature(acc.code, acc.saldoAnterior);
                                                const ending = splitBalanceByNature(acc.code, acc.nuevoSaldo);
                                                const fmt = (value) => value > 0 ? value.toLocaleString('es-CO', {minimumFractionDigits:2}) : '—';
                                                return (
                                                    <>
                                                        <td className="px-3 py-3 text-right font-mono text-slate-500">{fmt(previous.debit)}</td>
                                                        <td className="px-3 py-3 text-right font-mono text-slate-500">{fmt(previous.credit)}</td>
                                                        <td className="px-3 py-3 text-right font-mono text-blue-600 font-medium">{fmt(acc.debito)}</td>
                                                        <td className="px-3 py-3 text-right font-mono text-orange-600 font-medium">{fmt(acc.credito)}</td>
                                                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">{fmt(ending.debit)}</td>
                                                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">{fmt(ending.credit)}</td>
                                                    </>
                                                );
                                            })()}
                                        </tr>
                                    ))}
                                    {libroMayorData.length > 0 && (() => {
                                        const totals = libroMayorData.reduce((sum, acc) => {
                                            const previous = splitBalanceByNature(acc.code, acc.saldoAnterior);
                                            const ending = splitBalanceByNature(acc.code, acc.nuevoSaldo);
                                            sum.prevDebit += previous.debit;
                                            sum.prevCredit += previous.credit;
                                            sum.movDebit += Number(acc.debito) || 0;
                                            sum.movCredit += Number(acc.credito) || 0;
                                            sum.endDebit += ending.debit;
                                            sum.endCredit += ending.credit;
                                            return sum;
                                        }, { prevDebit: 0, prevCredit: 0, movDebit: 0, movCredit: 0, endDebit: 0, endCredit: 0 });

                                        const balanced =
                                            Math.abs(totals.prevDebit - totals.prevCredit) < 0.01 &&
                                            Math.abs(totals.movDebit - totals.movCredit) < 0.01 &&
                                            Math.abs(totals.endDebit - totals.endCredit) < 0.01;

                                        const fmt = (value) => value.toLocaleString('es-CO', {minimumFractionDigits:2});
                                        return (
                                            <tr className={balanced ? "bg-emerald-50 font-bold text-emerald-900 border-t-2 border-emerald-700" : "bg-red-50 font-bold text-red-900 border-t-2 border-red-700"}>
                                                <td colSpan="2" className="px-3 py-4 text-right uppercase tracking-wider">
                                                    {balanced ? 'SUMAS DE COMPROBACIÓN · CUADRADAS' : 'SUMAS DE COMPROBACIÓN · VERIFICAR'}
                                                </td>
                                                <td className="px-3 py-4 text-right font-mono">{fmt(totals.prevDebit)}</td>
                                                <td className="px-3 py-4 text-right font-mono">{fmt(totals.prevCredit)}</td>
                                                <td className="px-3 py-4 text-right font-mono">{fmt(totals.movDebit)}</td>
                                                <td className="px-3 py-4 text-right font-mono">{fmt(totals.movCredit)}</td>
                                                <td className="px-3 py-4 text-right font-mono">{fmt(totals.endDebit)}</td>
                                                <td className="px-3 py-4 text-right font-mono">{fmt(totals.endCredit)}</td>
                                            </tr>
                                        );
                                    })()}
                                    {libroMayorData.length === 0 && (<tr><td colSpan="8" className="text-center py-8 text-slate-400">No hay movimientos en este periodo</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-6 bg-slate-50">
                            {Object.keys(groupedBillingDocuments).length === 0 ? (
                                <div className="text-center py-16">
                                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-slate-900">No hay cuentas de cobro generadas en {selectedYear}</h3>
                                    <p className="text-slate-500 mt-1 max-w-sm mx-auto">Cuando registres un gasto, haz clic en el ícono de Cuenta de Cobro para generarla automáticamente.</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {Object.entries(groupedBillingDocuments).map(([month, days]) => (
                                        <div key={month} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                            <div className="bg-blue-900 px-6 py-3 border-b">
                                                <h3 className="text-xl font-bold capitalize text-white flex items-center gap-2">
                                                    <Calendar className="w-5 h-5 opacity-70" /> {month} {selectedYear}
                                                </h3>
                                            </div>
                                            <div className="p-6 space-y-8">
                                                {Object.entries(days).sort(([a],[b])=>parseInt(b)-parseInt(a)).map(([day, docs]) => (
                                                    <div key={day} className="relative pl-12 md:pl-16 pt-2 border-l-2 border-blue-100">
                                                        <div className="absolute -left-[14px] top-0 z-10 bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full border-2 border-white shadow-sm whitespace-nowrap">
                                                            Día {day}
                                                        </div>
                                                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-6">
                                                            {docs.map(doc => (
                                                                <div key={doc.id} className="group border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all bg-white relative overflow-hidden">
                                                                    <div className="absolute top-0 right-0 bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                                                        E-{String(doc.voucherNumber).padStart(4, '0')}
                                                                    </div>
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 mt-1">
                                                                            <User className="w-5 h-5" />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <h4 className="font-bold text-slate-900 truncate pr-12" title={doc.beneficiary}>{doc.beneficiary}</h4>
                                                                            <p className="text-xs text-slate-500 mb-2 font-mono">{doc.docNumber}</p>
                                                                            <p className="text-sm text-slate-700 line-clamp-2 leading-tight min-h-[40px]">{doc.concept}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                                                                        <span className="text-lg font-black text-slate-800">${parseFloat(doc.amount).toLocaleString('es-CO')}</span>
                                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <Button size="sm" variant="outline" className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => { setBillingDocToPrint(doc); setPrintBillingOpen(true); }}>
                                                                                <Printer className="w-4 h-4 mr-1"/> Ver
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>

            <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} transaction={editingTransaction} onSave={handleSaveTransaction} />
            <InternalTransferDialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen} onSave={handleSaveTransfer} />
            <StoreTransaction open={storeDialogOpen} onOpenChange={setStoreDialogOpen} />

            <BankReconciliationDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                transactions={transactions}
                saveTransactions={saveTransactions}
                accounts={accounts}
                bankAccounts={bankAccounts}
                cashAccounts={cashAccounts}
                activeCompany={activeCompany}
            />

            <AutoBillingConfigDialog
                open={configBillingOpen}
                onOpenChange={setConfigBillingOpen}
                accounts={accounts}
                autoBillingCategories={autoBillingCategories || []}
                onSave={setAutoBillingCategories}
            />

            <VoucherConfigDialog
                open={configVoucherOpen}
                onOpenChange={setConfigVoucherOpen}
                config={voucherConfig || {}}
                onSave={setVoucherConfig}
            />

{/* RECIBO DE CAJA / DONACIÓN EN MEDIA CARTA Y DISEÑO ELEGANTE */}
<Dialog open={printReceiptOpen} onOpenChange={setPrintReceiptOpen}>
    <DialogContent className="max-w-4xl p-0 border-none bg-transparent shadow-none">
        <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <h3 className="font-semibold text-slate-800 flex items-center">
                    <FileCheck className="w-4 h-4 mr-2 text-green-600" />
                    Recibo de Caja / Donación
                </h3>

                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportReceiptExcel}
                        className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Excel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handlePrintReceiptPdf}
                        disabled={isPrinting}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isPrinting ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <Printer className="w-4 h-4 mr-2" />
                        )}
                        Imprimir PDF
                    </Button>
                </div>
            </div>

            <div className="p-6 bg-slate-200 overflow-auto max-h-[80vh] flex justify-center">

                {/* CONTENEDOR DEL RECIBO */}
                <div
                    ref={receiptRef}
                    className="bg-white p-5 relative overflow-hidden border border-slate-200 shadow-sm"
                    style={{
                        width: "205.9mm",
                        height: "130mm",
                        boxSizing: "border-box",
                    }}
                >

                    {/* MARCA DE AGUA */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
                        <FileCheck
                            style={{
                                width: "200px",
                                height: "200px",
                                color: "#000",
                            }}
                        />
                    </div>

                    {/* CONTENIDO */}
                    <div className="relative z-10 h-full">

                        {/* HEADER */}
                        <div className="text-center border-b-2 border-black pb-2 mb-3">
                            <h1 className="text-2xl font-black uppercase tracking-tight text-black">
                                {activeCompany?.name ||
                                    "PARROQUIA PADRE MISERICORDIOSO"}
                            </h1>

                            <p className="text-[11px] font-semibold text-black mt-0.5">
                                NIT: {activeCompany?.doc || "802012765"} |{" "}
                                {activeCompany?.address || "CRA 9G # 77 - 42"} |
                                Tel: {activeCompany?.phone || "3167630763"}
                            </p>
                        </div>

                        {/* TÍTULO */}
                        <div className="flex justify-between items-end mb-3">
                            <div>
                                <h2 className="text-xl font-black tracking-widest text-black uppercase">
                                    RECIBO DE CAJA / DONACIÓN
                                </h2>

                                <p className="font-mono font-bold text-black text-sm mt-0.5">
                                    N° RC-
                                    {String(
                                        (parseInt(receiptToPrint?.voucherNumber, 10) || 0) + (parseInt(voucherConfig?.income, 10) || 0)
                                    ).padStart(4, "0")}
                                </p>
                                <p className="font-mono font-bold text-slate-500 text-[10px] mt-0.5">
                                    Ref. Comp. {receiptToPrint?.voucherPrefix || 'I'}-{String(receiptToPrint?.voucherNumber).padStart(4, "0")}
                                </p>
                            </div>

                            <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col text-center w-36 bg-slate-50">
                                <div className="text-[10px] font-bold uppercase py-1 border-b border-slate-300 tracking-wider">
                                    FECHA
                                </div>

                                <div className="py-1.5 font-mono text-sm font-bold text-black">
                                    {receiptToPrint?.date
                                        ? format(
                                              parseISO(receiptToPrint.date),
                                              "dd 'de' MMMM, yyyy",
                                              { locale: es }
                                          )
                                        : ""}
                                </div>
                            </div>
                        </div>

                        {/* CUERPO */}
                        <div className="space-y-3 pb-20">

                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-1">
                                    RECIBIDO DE:
                                </span>

                                <div className="flex justify-between items-end border-b border-slate-300 pb-1">
                                    <span className="font-bold text-lg uppercase text-black truncate pr-2">
                                        {receiptToPrint?.beneficiary}
                                    </span>

                                    <span className="text-[11px] font-mono text-black shrink-0">
                                        NIT/CC: {receiptToPrint?.docNumber}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">
                                    LA SUMA DE:
                                </span>

                                <div className="flex flex-col bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
                                    <span className="font-mono text-3xl font-black text-black">
                                        $
                                        {parseFloat(
                                            receiptToPrint?.amount || 0
                                        ).toLocaleString("es-CO")}
                                    </span>

                                    <span className="text-[10px] font-bold uppercase mt-1 tracking-wide">
                                        {numeroALetras(
                                            parseFloat(
                                                receiptToPrint?.amount || 0
                                            )
                                        )}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-1">
                                    POR CONCEPTO DE:
                                </span>

                                <div className="border-b border-slate-300 pb-1 min-h-[1.5rem]">
                                    <p className="text-sm font-medium text-black leading-snug line-clamp-2">
                                        {receiptToPrint?.description}
                                    </p>
                                </div>
                            </div>

                        </div>

                        {/* FIRMA FIJA ABAJO */}
                        <div className="absolute bottom-5 left-5 right-5 flex justify-between items-end">

                            <div className="w-56 text-center">
                                <div className="border-t border-black pt-1">
                                    <p className="font-bold text-[11px] uppercase text-black">
                                        FIRMA / SELLO RECIBIDO
                                    </p>

                                    <p className="text-[9px] text-black mt-0.5">
                                        {activeCompany?.name ||
                                            "PARROQUIA PADRE MISERICORDIOSO"}
                                    </p>
                                </div>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        </div>
    </DialogContent>
</Dialog>

{/* CUENTA DE COBRO EN MEDIA CARTA Y DISEÑO ELEGANTE */}
<Dialog open={printBillingOpen} onOpenChange={setPrintBillingOpen}>
    <DialogContent className="max-w-4xl p-0 border-none bg-transparent shadow-none">
        <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <h3 className="font-semibold text-slate-800 flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-blue-600" />
                    Cuenta de Cobro / Doc. Soporte
                </h3>

                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportBillingExcel}
                        className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Excel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handlePrintBillingDocPdf}
                        disabled={isPrinting}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isPrinting ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <Printer className="w-4 h-4 mr-2" />
                        )}
                        Imprimir PDF
                    </Button>
                </div>
            </div>

            <div className="p-6 bg-slate-200 overflow-auto max-h-[80vh] flex justify-center">

                {/* CONTENEDOR EXACTO DE MEDIA CARTA */}
                <div
                    ref={billingRef}
                    className="bg-white p-5 relative overflow-hidden border border-slate-200 shadow-sm"
                    style={{
                        width: "205.9mm",
                        height: "130mm",
                        boxSizing: "border-box",
                    }}
                >

                    {/* MARCA DE AGUA */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
                        <FileText
                            style={{
                                width: "200px",
                                height: "200px",
                                color: "#000",
                            }}
                        />
                    </div>

                    {/* CONTENIDO */}
                    <div className="relative z-10 h-full">

                        {/* HEADER */}
                        <div className="text-center border-b-2 border-black pb-2 mb-3">
                            <h1 className="text-2xl font-black uppercase tracking-tight text-black">
                                {activeCompany?.name || "PARROQUIA PADRE MISERICORDIOSO"}
                            </h1>

                            <p className="text-[11px] font-semibold text-black mt-0.5">
                                NIT: {activeCompany?.doc || "802012765"} |{" "}
                                {activeCompany?.address || "CRA 9G # 77 - 42"} |
                                Tel: {activeCompany?.phone || "3167630763"}
                            </p>
                        </div>

                        {/* TÍTULO */}
                        <div className="flex justify-between items-end mb-3">
                            <div>
                                <h2 className="text-xl font-black tracking-widest text-black uppercase">
                                    CUENTA DE COBRO
                                </h2>

                                <p className="font-mono font-bold text-black text-sm mt-0.5">
                                    N° CC-
                                    {String(
                                        (parseInt(billingDocToPrint?.voucherNumber, 10) || 0) + (parseInt(voucherConfig?.expense, 10) || 0)
                                    ).padStart(4, "0")}
                                </p>
                                <p className="font-mono font-bold text-slate-500 text-[10px] mt-0.5">
                                    Ref. Comp. E-{String(billingDocToPrint?.voucherNumber).padStart(4, "0")}
                                </p>
                            </div>

                            <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col text-center w-36 bg-slate-50">
                                <div className="text-[10px] font-bold uppercase py-1 border-b border-slate-300 tracking-wider text-black">
                                    FECHA
                                </div>
                                <div className="py-1.5 font-mono text-sm font-bold text-black">
                                    {billingDocToPrint?.date
                                        ? format(
                                              parseISO(billingDocToPrint.date),
                                              "dd 'de' MMMM, yyyy",
                                              { locale: es }
                                          )
                                        : ""}
                                </div>
                            </div>
                        </div>

                        {/* CUERPO */}
                        <div className="space-y-3 pb-20">

                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-1 text-black">
                                    DEBE A:
                                </span>

                                <div className="flex justify-between items-end border-b border-slate-300 pb-1">
                                    <span className="font-bold text-lg uppercase text-black truncate pr-2">
                                        {billingDocToPrint?.beneficiary}
                                    </span>

                                    <span className="text-[11px] font-mono text-black shrink-0">
                                        NIT/CC: {billingDocToPrint?.docNumber}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">
                                    LA SUMA DE:
                                </span>

                                <div className="flex flex-col bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
                                    <span className="font-mono text-3xl font-black text-black">
                                        ${parseFloat(billingDocToPrint?.amount || 0).toLocaleString("es-CO")}
                                    </span>

                                    <span className="text-[10px] font-bold uppercase mt-1 tracking-wide text-black">
                                        {numeroALetras(parseFloat(billingDocToPrint?.amount || 0))}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-1 text-black">
                                    POR CONCEPTO DE:
                                </span>

                                <div className="border-b border-slate-300 pb-1 min-h-[1.5rem]">
                                    <p className="text-sm font-medium text-black leading-snug line-clamp-2 uppercase">
                                        {billingDocToPrint?.concept}
                                    </p>
                                </div>
                            </div>

                        </div>

                        {/* FIRMAS FIJAS ABAJO */}
                        <div className="absolute bottom-5 left-5 right-5 flex justify-between items-end">

                            <div className="w-56 text-center">
                                <div className="border-t border-black pt-1">
                                    <p className="font-bold text-[11px] uppercase text-black truncate">
                                        {billingDocToPrint?.beneficiary}
                                    </p>
                                    <p className="text-[9px] text-black mt-0.5">
                                        Beneficiario / Contratista
                                    </p>
                                </div>
                            </div>

                            <div className="w-56 text-center">
                                <div className="border-t border-black pt-1">
                                    <p className="font-bold text-[11px] uppercase text-black">
                                        FIRMA AUTORIZADA
                                    </p>
                                    <p className="text-[9px] text-black mt-0.5">
                                        Aprobación / Contabilidad
                                    </p>
                                </div>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        </div>
    </DialogContent>
</Dialog>

            {/* Imprimir Comprobante Contable */}
            <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
                <DialogContent className="max-w-6xl p-0 border-none bg-transparent shadow-none">
                    <div className="bg-white rounded-lg overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <h3 className="font-semibold">Vista Previa</h3>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={handleExportVoucherExcel} className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"><FileSpreadsheet className="w-4 h-4 mr-2" />Excel</Button>
                                <Button size="sm" onClick={handlePrintToPdf} disabled={isPrinting}>{isPrinting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}Imprimir PDF</Button>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-200 overflow-auto max-h-[80vh] flex justify-center"><div ref={voucherRef} className="bg-white shadow-2xl" style={{ width: '215.9mm', minHeight: '139.7mm' }}><Voucher transaction={transactionToPrint} /></div></div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* NUEVO: Diálogo Oculto para Imprimir el Libro Auxiliar (Filtro Múltiple) */}
            <Dialog open={printFilteredOpen} onOpenChange={setPrintFilteredOpen}>
                <DialogContent className="max-w-5xl p-0 border-none bg-transparent shadow-none">
                    <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <h3 className="font-semibold text-slate-800 flex items-center">
                                <BookOpen className="w-4 h-4 mr-2 text-blue-600" />
                                Vista Previa del Libro Auxiliar
                            </h3>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleExportAuxiliarExcel}
                                    className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                >
                                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                                    Excel Profesional
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handlePrintFilteredPdf}
                                    disabled={isPrinting}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isPrinting ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Printer className="w-4 h-4 mr-2" />
                                    )}
                                    Imprimir PDF
                                </Button>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-200 overflow-auto max-h-[80vh] flex justify-center">
                            <div ref={filteredPrintRef} className="bg-white p-8 shadow-sm" style={{ width: '279.4mm', minHeight: '215.9mm', boxSizing: 'border-box' }}>
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead className="border-b-2 border-slate-800 text-slate-900">
                                        <tr>
                                            <th className="py-2 px-1">Fecha</th>
                                            <th className="py-2 px-1">Comprobante</th>
                                            <th className="py-2 px-1 w-48">Cuenta (PUC)</th>
                                            <th className="py-2 px-1 w-40">Tercero / Contacto</th>
                                            <th className="py-2 px-1 w-48">Detalle</th>
                                            <th className="py-2 px-1 text-right">Débito</th>
                                            <th className="py-2 px-1 text-right">Crédito</th>
                                            <th className="py-2 px-1 text-right">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {(() => {
                                            // 1. Extraer y aplanar todas las filas contables
                                            const flatRows = [];
                                            
                                            displayTransactions.forEach(t => {
                                                if (t._isMerged) return;
                                                let vId = t.voucherNumber ? `${t.voucherPrefix || 'A'}-${String(t.voucherNumber).padStart(4, '0')}` : '-';
                                                
                                                let tercero = t.contact || '-';
                                                if (tercero === '-' && t.contactId && contacts) {
                                                    const foundContact = contacts.find(c => String(c.id) === String(t.contactId));
                                                    if (foundContact) tercero = foundContact.name;
                                                }

                                                resolveAccountingRows(t).forEach((row, rowIndex) => {
                                                    const code = String(row.account?.code || '');
                                                    const showRow = accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f));
                                                    if (!showRow || !code) return;
                                                    const debitValue = Number(row.debit) || 0;
                                                    const creditValue = Number(row.credit) || 0;
                                                    if (debitValue > 0) {
                                                        flatRows.push({ ...t, _rowIndex: rowIndex, vId, tercero, pCode: code, pName: row.account?.name || '-', isDebit: true, val: debitValue });
                                                    }
                                                    if (creditValue > 0) {
                                                        flatRows.push({ ...t, _rowIndex: rowIndex, vId, tercero, pCode: code, pName: row.account?.name || '-', isDebit: false, val: creditValue });
                                                    }
                                                });
                                            });

                                            // 2. El saldo anterior viene del mismo Libro Mayor.
                                            const openingBalancesByCode = libroMayorData.reduce((map, acc) => {
                                                map[String(acc.code)] = Number(acc.saldoAnterior) || 0;
                                                return map;
                                            }, {});

                                            // Incluir cuentas con saldo anterior aunque no tengan movimiento
                                            // (Banco, Fondo Social u otras cuentas de apertura).
                                            const movementCodes = new Set(flatRows.map(row => String(row.pCode)));
                                            libroMayorData.forEach(acc => {
                                                const code = String(acc.code || '');
                                                const openingBalance = Number(acc.saldoAnterior) || 0;
                                                const showRow = accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f));
                                                if (!showRow || !code || Math.abs(openingBalance) <= 0.01 || movementCodes.has(code)) return;

                                                flatRows.push({
                                                    _openingOnly: true,
                                                    date: startDate,
                                                    vId: 'SALDO',
                                                    tercero: '-',
                                                    pCode: code,
                                                    pName: acc.name || '-',
                                                    isDebit: false,
                                                    val: 0
                                                });
                                            });

                                            (bankAccounts || []).filter(isRelevant).forEach(ba => {
                                                const code = String(ba.accountingCode || '');
                                                const initialBankBalance = Number(ba.initialBalance) || 0;
                                                const investmentBalance = Number(ba.initialInvestmentBalance) || 0;
                                                const isBankingCode = code.startsWith('1110') || code.startsWith('1120');
                                                const investmentOnly = Math.abs(investmentBalance) > 0.01 && Math.abs(initialBankBalance) <= 0.01;
                                                const showRow = accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f));

                                                if (!isBankingCode || investmentOnly || !showRow || movementCodes.has(code)) return;
                                                if (flatRows.some(row => String(row.pCode) === code)) return;

                                                flatRows.push({
                                                    _openingOnly: true,
                                                    _forceOpeningRow: true,
                                                    date: startDate,
                                                    vId: 'SALDO',
                                                    tercero: '-',
                                                    pCode: code,
                                                    pName: ba.accountingConcept || ba.bankName || 'CUENTA BANCARIA',
                                                    isDebit: false,
                                                    val: 0
                                                });
                                            });

                                            // Ordenar por Cuenta PUC y luego cronológicamente.
                                            flatRows.sort((a, b) => {
                                                const codeCompare = String(a.pCode).localeCompare(String(b.pCode));
                                                if (codeCompare !== 0) return codeCompare;
                                                if (a._openingOnly && !b._openingOnly) return -1;
                                                if (!a._openingOnly && b._openingOnly) return 1;
                                                return accountingDateValue(a.date) - accountingDateValue(b.date);
                                            });

                                            // 3. Renderizar calculando el saldo continuo por cuenta.
                                            const runningBalances = {};
                                            const rowsToRender = [];
                                            let currentAccount = null;

                                            flatRows.forEach((row, index) => {
                                                // Separador visual si cambiamos de cuenta PUC
                                                if (currentAccount !== row.pCode) {
                                                    if (currentAccount !== null) {
                                                        rowsToRender.push(<tr key={`sep-${index}`}><td colSpan="8" className="bg-slate-200 h-1"></td></tr>);
                                                    }
                                                    currentAccount = row.pCode;
                                                    const openingBalance = openingBalancesByCode[row.pCode] || 0;
                                                    runningBalances[row.pCode] = openingBalance;

                                                    if (Math.abs(openingBalance) > 0.01 || row._forceOpeningRow) {
                                                        rowsToRender.push(
                                                            <tr key={`opening-${row.pCode}`} className="bg-amber-50 border-y border-amber-200 font-semibold">
                                                                <td className="py-2 px-1 text-slate-600 whitespace-nowrap">{formatSafeDate(startDate)}</td>
                                                                <td className="py-2 px-1 font-mono text-amber-700 whitespace-nowrap">SALDO</td>
                                                                <td className="py-2 px-1">
                                                                    <span className="font-bold text-slate-800 block">{row.pCode}</span>
                                                                    <span className="uppercase text-slate-500 text-[10px]">{row.pName}</span>
                                                                </td>
                                                                <td className="py-2 px-1 text-slate-500">-</td>
                                                                <td className="py-2 px-1 text-amber-800">SALDO ANTERIOR AL PERÍODO</td>
                                                                <td className="py-2 px-1 text-right text-slate-400">-</td>
                                                                <td className="py-2 px-1 text-right text-slate-400">-</td>
                                                                <td className="py-2 px-1 text-right font-mono font-bold text-amber-800">{openingBalance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        );
                                                    }
                                                }

                                                if (row._openingOnly) return;

                                                const isDebitNature = isDebitNatureCode(row.pCode);
                                                
                                                if (row.isDebit) {
                                                    runningBalances[row.pCode] = (runningBalances[row.pCode] || 0) + (isDebitNature ? row.val : -row.val);
                                                } else {
                                                    runningBalances[row.pCode] = (runningBalances[row.pCode] || 0) + (isDebitNature ? -row.val : row.val);
                                                }

                                                rowsToRender.push(
                                                    <tr key={`${row.id}-${row.isDebit ? 'd' : 'c'}-${index}`} className="hover:bg-slate-50">
                                                        <td className="py-2 px-1 text-slate-600 whitespace-nowrap">{formatSafeDate(row.date)}</td>
                                                        <td className="py-2 px-1 font-mono font-bold text-slate-500 whitespace-nowrap">{row.vId}</td>
                                                        <td className="py-2 px-1">
                                                            <span className="font-bold text-slate-800 block">{row.pCode}</span>
                                                            <span className="uppercase text-slate-500 text-[10px] line-clamp-1" title={row.pName}>{row.pName}</span>
                                                        </td>
                                                        <td className="py-2 px-1 text-slate-700 font-medium truncate max-w-[120px]" title={row.tercero}>{row.tercero}</td>
                                                        <td className="py-2 px-1 text-slate-700 italic truncate max-w-[150px]" title={row.description}>{row.description}</td>
                                                        
                                                        {row.isDebit ? (
                                                            <>
                                                                <td className="py-2 px-1 text-right font-mono font-bold text-slate-900">{row.val.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                                                                <td className="py-2 px-1 text-right font-mono text-slate-300">-</td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="py-2 px-1 text-right font-mono text-slate-300">-</td>
                                                                <td className="py-2 px-1 text-right font-mono font-bold text-slate-900">{row.val.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                                                            </>
                                                        )}
                                                        
                                                        <td className="py-2 px-1 text-right font-mono font-bold text-blue-700">{runningBalances[row.pCode].toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
                                                    </tr>
                                                );
                                            });

                                            return rowsToRender;
                                        })()}

                                        {displayTransactions.length === 0 && (
                                            <tr><td colSpan="8" className="text-center py-8 text-slate-400">No hay movimientos en este periodo para la cuenta seleccionada.</td></tr>
                                        )}
                                        
                                        {/* 🚀 TOTALES AL FINAL DE LA TABLA */}
                                        {displayTransactions.length > 0 && (
                                            <>
                                                <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-slate-900 text-sm">
                                                    <td colSpan="5" className="py-3 px-2 text-right uppercase tracking-wider">
                                                        Total Movimientos (Cuentas Filtradas):
                                                    </td>
                                                    <td className="py-3 px-2 text-right border-b-4 border-double border-slate-800">
                                                        {displayTransactions.reduce((acc, t) => {
                                                            if (t._isMerged) return acc;
                                                            return acc + resolveAccountingRows(t).reduce((sum, row) => {
                                                                const code = String(row.account?.code || '');
                                                                if (accountFilters.length > 0 && !accountFilters.some(f => code.startsWith(f))) return sum;
                                                                return sum + (Number(row.debit) || 0);
                                                            }, 0);
                                                        }, 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3 px-2 text-right border-b-4 border-double border-slate-800">
                                                        {displayTransactions.reduce((acc, t) => {
                                                            if (t._isMerged) return acc;
                                                            return acc + resolveAccountingRows(t).reduce((sum, row) => {
                                                                const code = String(row.account?.code || '');
                                                                if (accountFilters.length > 0 && !accountFilters.some(f => code.startsWith(f))) return sum;
                                                                return sum + (Number(row.credit) || 0);
                                                            }, 0);
                                                        }, 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3 px-2 bg-slate-200 border-b-4 border-double border-slate-800"></td>
                                                </tr>
                                                <tr className="font-black text-blue-900 text-sm bg-blue-50/50">
                                                    <td colSpan="5" className="py-3 px-2 text-right uppercase tracking-wider">
                                                        Diferencia Débitos - Créditos del Filtro:
                                                    </td>
                                                    <td colSpan="3" className="py-3 px-2 text-center text-lg">
                                                        {(() => {
                                                            let d = 0, c = 0;
                                                            displayTransactions.forEach(t => {
                                                                if (t._isMerged) return;
                                                                resolveAccountingRows(t).forEach(row => {
                                                                    const code = String(row.account?.code || '');
                                                                    if (accountFilters.length === 0 || accountFilters.some(f => code.startsWith(f))) {
                                                                        d += Number(row.debit) || 0;
                                                                        c += Number(row.credit) || 0;
                                                                    }
                                                                });
                                                            });
                                                            const diff = Math.abs(d - c);
                                                            const naturaleza = d > c ? '(Naturaleza Débito)' : (c > d ? '(Naturaleza Crédito)' : '');
                                                            return `$${diff.toLocaleString('es-CO', { minimumFractionDigits: 2 })} ${naturaleza}`;
                                                        })()}
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

        </>
    );
};

// =========================================================================
// CONFIGURACIÓN DE AUTO-COBROS
// =========================================================================
const AutoBillingConfigDialog = ({ open, onOpenChange, accounts, autoBillingCategories, onSave }) => {
    const [selected, setSelected] = useState([]);

    const SMART_PUC_PREFIXES = ['5120', '5125', '5135', '5145', '5220', '5225', '5235', '5245'];

    useEffect(() => {
        if (open) {
            if (Array.isArray(autoBillingCategories)) {
                setSelected([...autoBillingCategories]);
            } else {
                const defaultSelected = (accounts || [])
                    .filter(a => SMART_PUC_PREFIXES.some(prefix => String(a.number).startsWith(prefix)))
                    .map(a => a.name);
                setSelected(defaultSelected);
            }
        }
    }, [open, autoBillingCategories, accounts]);

    const expenseAccounts = (accounts || []).filter(a => String(a.number).startsWith('5')).sort((a, b) => String(a.number).localeCompare(String(b.number)));

    const toggleAccount = (accName) => {
        setSelected(prev => prev.includes(accName) ? prev.filter(x => x !== accName) : [...prev, accName]);
    };

    const handleSave = () => {
        onSave(selected);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-blue-700">
                        <Settings className="w-5 h-5" /> Configurar Auto-Cuentas de Cobro
                    </DialogTitle>
                    <DialogDescription>
                        Selecciona qué categorías de egreso generarán automáticamente una Cuenta de Cobro al ser registradas.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <div className="bg-slate-50 border rounded-lg p-4 max-h-[400px] overflow-y-auto">
                        <div className="space-y-3">
                            {expenseAccounts.map(acc => (
                                <label key={acc.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 cursor-pointer border border-transparent hover:border-slate-200 transition-colors">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                        checked={selected.includes(acc.name)}
                                        onChange={() => toggleAccount(acc.name)}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-800">{acc.name}</span>
                                        <span className="text-xs font-mono text-slate-500">{acc.number}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Guardar Preferencias</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// =========================================================================
// NUEVO COMPONENTE: Conciliación Bancaria Semi-Automática (Excel/CSV)
// =========================================================================
const BankReconciliationDialog = ({ open, onOpenChange, transactions, saveTransactions, accounts, bankAccounts, cashAccounts, activeCompany, voucherConfig }) => {
    const [step, setStep] = useState(1); 
    const [parsedRows, setParsedRows] = useState([]);
    const [selectedBank, setSelectedBank] = useState('');
    const [rowMappings, setRowMappings] = useState({});
    const [selectedRows, setSelectedRows] = useState({});
    const { toast } = useToast();

    useEffect(() => {
        if (open) {
            setStep(1);
            setParsedRows([]);
            setSelectedBank('');
            setRowMappings({});
            setSelectedRows({});
        }
    }, [open]);

    const cleanBankNumber = (value) => {
        if (value == null || value === '') return 0;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        let text = String(value).trim();
        const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
        text = text.replace(/[()$€£\s]/g, '').replace(/[^0-9,.-]/g, '');
        const lastComma = text.lastIndexOf(',');
        const lastDot = text.lastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0) {
            if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
            else text = text.replace(/,/g, '');
        } else if (lastComma >= 0) {
            const decimals = text.length - lastComma - 1;
            text = decimals > 0 && decimals <= 2 ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
        } else if (lastDot >= 0) {
            const decimals = text.length - lastDot - 1;
            if ((text.match(/\./g) || []).length > 1 || decimals === 3) {
                text = text.replace(/\./g, '');
            }
        }
        const number = Math.abs(parseFloat(text) || 0);
        return negative ? -number : number;
    };

    const parseBankDate = (value) => {
        if (!value) return null;
        if (value instanceof Date && isValid(value)) return value;
        if (typeof value === 'number') {
            const parsed = XLSX.SSF.parse_date_code(value);
            if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
        }
        const text = String(value).trim().split(' ')[0];
        const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
        const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (local) return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
        const localShort = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
        if (localShort) {
            const yy = Number(localShort[3]);
            return new Date(yy >= 70 ? 1900 + yy : 2000 + yy, Number(localShort[2]) - 1, Number(localShort[1]));
        }
        const parsed = new Date(text);
        return isValid(parsed) ? parsed : null;
    };

    const selectedBankInfo = () => {
        const bankId = String(selectedBank || '').split('|')[0];
        const bank = (bankAccounts || []).find(b => String(b.id) === bankId);
        return {
            id: bankId,
            name: bank?.bankName || String(selectedBank || '').split('|')[1] || 'BANCO',
            code: bank?.accountingCode || '1110',
        };
    };

    const transactionBankDirection = (transaction) => {
        const bank = selectedBankInfo();
        const sameAccount = account => {
            if (!account) return false;
            const code = String(account.code || '').trim();
            const name = String(account.name || '').trim().toLowerCase();
            const bankCode = String(bank.code || '').trim();
            const bankName = String(bank.name || '').trim().toLowerCase();
            const codeIsUnique = bankCode && (bankAccounts || []).filter(b => String(b.accountingCode || '1110').trim() === bankCode).length <= 1;
            return name === bankName || (code === bankCode && codeIsUnique);
        };
        if (sameAccount(transaction?.debitAccount)) return 'income';
        if (sameAccount(transaction?.creditAccount)) return 'expense';
        const destinationId = String(transaction?.destination || '').split('|')[0];
        const fromId = String(transaction?.fromAccount || '').split('|')[0];
        const toId = String(transaction?.toAccount || '').split('|')[0];
        if (destinationId === bank.id && ['income','expense'].includes(transaction?.type)) return transaction.type;
        if (fromId === bank.id) return 'expense';
        if (toId === bank.id) return 'income';
        return null;
    };

    const reconciliationFingerprint = row =>
        [selectedBankInfo().id, row.date, row.type, Number(row.amount || 0).toFixed(2), String(row.description || '').trim().toLowerCase().replace(/\s+/g,' ')].join('|');

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!selectedBank) {
            toast({ variant:'destructive', title:'Selecciona el banco', description:'Primero indica a qué cuenta bancaria pertenece el extracto.' });
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
                processBankData(data);
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: "Error al leer archivo", description: "Asegúrate de que sea un archivo Excel (.xlsx o .xls) o CSV válido." });
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const processBankData = (data) => {
        const missingTransactions = [];
        const matchedTransactionIds = new Set();
        const seenFingerprints = new Set();

        data.forEach((row, index) => {
            const dateStr = row['Fecha'] ?? row['Date'] ?? row['FECHA'] ?? row['fecha'] ?? row['Fecha Movimiento'] ?? row['Fecha de Movimiento'] ?? row['FECHA MOVIMIENTO'] ?? '';
            const desc = String(row['Clase de Movimiento'] ?? row['Concepto'] ?? row['Descripción'] ?? row['Descripcion'] ?? row['Detalle'] ?? row['Referencia'] ?? row['Movimiento'] ?? 'Movimiento Importado');

            const amountIn = cleanBankNumber(row['Consignacion'] ?? row['Consignación'] ?? row['Consignaciones'] ?? row['Abono'] ?? row['Abonos'] ?? row['Ingreso'] ?? row['Ingresos'] ?? row['Crédito'] ?? row['Credito'] ?? row['Créditos'] ?? row['Creditos']);
            const amountOut = cleanBankNumber(row['Retiro'] ?? row['Retiros'] ?? row['Cargo'] ?? row['Cargos'] ?? row['Egreso'] ?? row['Egresos'] ?? row['Débito'] ?? row['Debito'] ?? row['Débitos'] ?? row['Debitos']);
            const rawAmount = cleanBankNumber(row['Monto'] ?? row['Valor'] ?? row['Importe'] ?? row['Amount']);
            const typeHint = String(row['Tipo'] ?? row['Naturaleza'] ?? row['Tipo Movimiento'] ?? row['Tipo de Movimiento'] ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            let finalAmount = 0;
            let type = 'income';

            if (amountIn !== 0) { finalAmount = Math.abs(amountIn); type = 'income'; }
            else if (amountOut !== 0) { finalAmount = Math.abs(amountOut); type = 'expense'; }
            else if (rawAmount !== 0) {
                finalAmount = Math.abs(rawAmount);
                if (typeHint.includes('debito') || typeHint.includes('cargo') || typeHint.includes('retiro') || typeHint.includes('egreso')) {
                    type = 'expense';
                } else if (typeHint.includes('credito') || typeHint.includes('abono') || typeHint.includes('consign') || typeHint.includes('ingreso')) {
                    type = 'income';
                } else {
                    type = rawAmount > 0 ? 'income' : 'expense';
                }
            }

            if (finalAmount === 0 || !dateStr) return;

            const parsedDate = parseBankDate(dateStr);
            if (!parsedDate || !isValid(parsedDate)) return;

            const finalDateStr = format(parsedDate, 'yyyy-MM-dd');
            const candidate = {
                id: `import-${index}`,
                date: finalDateStr,
                description: desc.substring(0, 100),
                amount: finalAmount,
                type,
                originalRow: row
            };
            candidate.fingerprint = reconciliationFingerprint(candidate);
            if (seenFingerprints.has(candidate.fingerprint)) return;
            seenFingerprints.add(candidate.fingerprint);

            const exactImported = (transactions || []).find(t =>
                t.bankReconciliationFingerprint &&
                t.bankReconciliationFingerprint === candidate.fingerprint
            );
            if (exactImported) {
                matchedTransactionIds.add(exactImported.id);
                return;
            }

            const matched = (transactions || []).find(t => {
                if (matchedTransactionIds.has(t.id)) return false;
                if (transactionBankDirection(t) !== type) return false;
                const dbAmount = parseFloat(t.amount);
                if (Math.abs(dbAmount - finalAmount) > 1) return false;
                const tDate = parseAccountingDate(t.date);
                return Math.abs(differenceInDays(parsedDate, tDate)) <= 3;
            });

            if (matched) matchedTransactionIds.add(matched.id);
            else missingTransactions.push(candidate);
        });

        if (missingTransactions.length === 0) {
            toast({ title: "¡Todo al día!", description: "El extracto cuadra perfecto con tu contabilidad. No hay transacciones faltantes." });
            setStep(1); 
        } else {
            const initialSelected = {};
            missingTransactions.forEach(t => initialSelected[t.id] = true);
            setSelectedRows(initialSelected);

            const initialMappings = {};
            missingTransactions.forEach(t => {
                const text = String(t.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                let suggestedCategory = '';
                if (text.includes('interes') || text.includes('rendimiento')) {
                    const c = (accounts || []).find(a => String(a.number).startsWith('4210') || String(a.name || '').toLowerCase().includes('financiero'));
                    if (c) suggestedCategory = c.name;
                } else if (text.includes('cuota') || text.includes('manejo') || text.includes('comision') || text.includes('4x1000') || text.includes('gmf')) {
                    const c = (accounts || []).find(a => String(a.number).startsWith('5305') || String(a.name || '').toLowerCase().includes('bancario') || String(a.name || '').toLowerCase().includes('financiero'));
                    if (c) suggestedCategory = c.name;
                }
                initialMappings[t.id] = suggestedCategory;
            });
            setRowMappings(initialMappings);

            setParsedRows(missingTransactions);
            setStep(2);
        }
    };

    const handleSaveImports = () => {
        if (!selectedBank) {
            toast({ variant: 'destructive', title: "Falta Banco", description: "Selecciona a qué cuenta bancaria pertenecen estos movimientos." });
            return;
        }

        const transactionsToAdd = [];
        const now = Date.now();
        const nextVouchers = {};
        let hasError = false;

        parsedRows.forEach((row, i) => {
            if (!selectedRows[row.id] || hasError) return; 

            const category = rowMappings[row.id];
            if (!category) {
                toast({ variant: 'destructive', title: "Falta Categoría", description: `Asigna una cuenta contable a la transacción: ${row.description}` });
                hasError = true;
                return;
            }

            const year = (typeof row.date === 'string' && row.date.includes('-')) 
                ? row.date.split('-')[0] 
                : getAccountingYear(row.date).toString();
                
            const typeKey = `${row.type}-${year}`;

            if (nextVouchers[typeKey] === undefined) {
                const typeTransactions = transactions.filter(t => {
                    const computed = getTransactionTypeAndPrefix(t);
                    let tType = computed.type;
                    const tYear = (typeof t.date === 'string' && t.date.includes('-')) 
                        ? t.date.split('-')[0] 
                        : getAccountingYear(t.date).toString();
                    return tType === row.type && tYear === year;
                });
                const maxNum = typeTransactions.reduce((max, t) => {
                    const currentVnum = parseInt(t.voucherNumber, 10) || 0;
                    return currentVnum > max ? currentVnum : max;
                }, 0);
                const baseNumber = voucherConfig?.[row.type] ? parseInt(voucherConfig[row.type], 10) : 0;
                nextVouchers[typeKey] = Math.max(maxNum, baseNumber) + 1;
            }

            const voucherNumber = nextVouchers[typeKey];
            nextVouchers[typeKey]++;

            const categoryAccount = (accounts || []).find(a => a.name === category);
            if (!categoryAccount) {
                toast({ variant:'destructive', title:'Cuenta no encontrada', description:`No se pudo resolver la cuenta contable: ${category}` });
                hasError = true;
                return;
            }
            if ((transactions || []).some(t => t.bankReconciliationFingerprint === row.fingerprint)) return;

            const bank = selectedBankInfo();
            const bankAccount = { code: bank.code, name: bank.name };
            const counterpart = { code: categoryAccount.number, name: categoryAccount.name };

            transactionsToAdd.push({
                id: `${now}-import-${i}`,
                type: row.type,
                date: row.date,
                description: `${row.description} (Conciliación bancaria)`,
                amount: row.amount,
                category: category,
                destination: selectedBank,
                debitAccount: row.type === 'income' ? bankAccount : counterpart,
                creditAccount: row.type === 'income' ? counterpart : bankAccount,
                isInternalTransfer: false,
                isBankReconciliation: true,
                reconciledBankId: bank.id,
                bankReconciliationFingerprint: row.fingerprint,
                voucherNumber: voucherNumber,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            });
        });

        if (hasError) return;
        if (transactionsToAdd.length === 0) {
            toast({ title:'Sin movimientos nuevos', description:'Los movimientos seleccionados ya estaban conciliados o fueron descartados.' });
            onOpenChange(false);
            return;
        }

        saveTransactions([...transactions, ...transactionsToAdd]);
        toast({ title: "Conciliación Exitosa", description: `Se importaron ${transactionsToAdd.length} movimientos faltantes con asiento contable explícito.` });
        onOpenChange(false);
    };

    const sortedAccounts = [...(accounts || [])].sort((a, b) => a.number.localeCompare(b.number));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-xl">
                        <FileSpreadsheet className="w-5 h-5 mr-2 text-emerald-600" />
                        Conciliación Bancaria Automática
                    </DialogTitle>
                </DialogHeader>

                {step === 1 && (
                    <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 mt-4">
                        <Upload className="w-12 h-12 text-emerald-500 mb-4" />
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Conciliar extracto bancario</h3>
                        <p className="text-slate-500 text-sm text-center max-w-xl mb-6">
                            Selecciona primero la cuenta exacta del extracto. Luego carga Excel o CSV. El sistema compara fecha, valor, sentido del movimiento y la cuenta bancaria para evitar falsos emparejamientos.
                        </p>
                        <div className="w-full max-w-md mb-5">
                            <Label className="font-semibold">Cuenta bancaria del extracto *</Label>
                            <Select value={selectedBank} onValueChange={setSelectedBank}>
                                <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Selecciona el banco..." /></SelectTrigger>
                                <SelectContent>
                                    {(bankAccounts || []).map(acc => (
                                        <SelectItem key={acc.id} value={`${acc.id}|${acc.bankName}`}>{acc.bankName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {(bankAccounts || []).length === 0 && <p className="text-xs text-red-600 mt-2">No hay cuentas bancarias configuradas. Créala primero en Cuentas Bancarias.</p>}
                        </div>
                        <Label className={`cursor-pointer px-6 py-3 rounded-lg font-medium shadow-sm transition-colors ${selectedBank ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-500 pointer-events-none'}`}>
                            Seleccionar Extracto
                            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} disabled={!selectedBank} />
                        </Label>
                        <p className="text-xs text-slate-400 mt-3">El saldo del extracto no se interpreta como movimiento; sólo se importan débitos/créditos/valores identificables.</p>
                    </div>
                )}

                {step === 2 && (
                    <div className="flex flex-col flex-1 overflow-hidden mt-2">
                        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg flex items-start gap-3 mb-4">
                            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-bold">¡Encontramos movimientos faltantes!</p>
                                <p className="text-sm mt-1">Revisa la lista, asígnale una cuenta contable a cada uno y confírmalos.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-4 bg-white p-4 border rounded-lg shadow-sm">
                            <Label className="whitespace-nowrap font-bold text-slate-700">Cuenta del Extracto:</Label>
                            <Select value={selectedBank} disabled>
                                <SelectTrigger className="w-[300px] border-slate-300 bg-slate-50">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(bankAccounts || []).map(acc => (
                                        <SelectItem key={acc.id} value={`${acc.id}|${acc.bankName}`}>{acc.bankName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-slate-500">Para cambiar de banco, vuelve atrás y carga nuevamente el extracto.</span>
                        </div>

                        <div className="flex-1 overflow-y-auto border rounded-lg relative">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 sticky top-0 shadow-sm">
                                    <tr>
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3 font-semibold text-slate-700">Fecha</th>
                                        <th className="p-3 font-semibold text-slate-700">Descripción Original</th>
                                        <th className="p-3 font-semibold text-slate-700 text-right">Monto</th>
                                        <th className="p-3 font-semibold text-slate-700">Categoría (PUC)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    <AnimatePresence>
                                        {parsedRows.map(row => (
                                            <motion.tr 
                                                key={row.id} 
                                                initial={{ opacity: 0 }} 
                                                animate={{ opacity: 1 }}
                                                className={selectedRows[row.id] ? 'bg-white' : 'bg-slate-50 opacity-50'}
                                            >
                                                <td className="p-3 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!selectedRows[row.id]} 
                                                        onChange={(e) => setSelectedRows({...selectedRows, [row.id]: e.target.checked})}
                                                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                                    />
                                                </td>
                                                <td className="p-3 text-slate-600 whitespace-nowrap">{formatSafeDate(row.date)}</td>
                                                <td className="p-3 font-medium text-slate-800">{row.description}</td>
                                                <td className={`p-3 text-right font-mono font-bold ${row.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {row.type === 'income' ? '+' : '-'}{row.amount.toLocaleString('es-CO', {minimumFractionDigits: 2})}
                                                </td>
                                                <td className="p-3">
                                                    <select 
                                                        className={`w-full p-2 text-xs border rounded-md ${!rowMappings[row.id] && selectedRows[row.id] ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                                                        value={rowMappings[row.id] || ''}
                                                        onChange={(e) => setRowMappings({...rowMappings, [row.id]: e.target.value})}
                                                        disabled={!selectedRows[row.id]}
                                                    >
                                                        <option value="" disabled>Selecciona una categoría...</option>
                                                        {sortedAccounts.map(acc => (
                                                            <option key={acc.id} value={acc.name}>{acc.number} - {acc.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t flex justify-between items-center">
                            <span className="text-sm text-slate-500 font-medium">
                                {Object.values(selectedRows).filter(Boolean).length} transacciones seleccionadas
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
                                <Button onClick={handleSaveImports} className="bg-emerald-600 hover:bg-emerald-700">
                                    <CheckCircle2 className="w-4 h-4 mr-2" /> Importar Seleccionados
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
// =========================================================================
// CONFIGURACIÓN DE NUMERACIÓN DE COMPROBANTES
// =========================================================================
const VoucherConfigDialog = ({ open, onOpenChange, config, onSave }) => {
    const [incomeBase, setIncomeBase] = useState('');
    const [expenseBase, setExpenseBase] = useState('');

    useEffect(() => {
        if (open) {
            setIncomeBase(config?.income || '');
            setExpenseBase(config?.expense || '');
        }
    }, [open, config]);

    const handleSave = () => {
        onSave({
            ...config,
            income: parseInt(incomeBase, 10) || 0,
            expense: parseInt(expenseBase, 10) || 0
        });
        onOpenChange(false);
    };

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-purple-700">
                        <Edit2 className="w-5 h-5"/> Numeración Inicial
                    </DialogTitle>
                    <DialogDescription>
                        Define la base desde la que iniciará el contador automático. 
                        (Ej: Si pones 450, el siguiente comprobante será el 451).
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-slate-700 font-bold">Base para Recibos de Caja (Ingresos)</Label>
                        <input 
                            type="number" 
                            value={incomeBase} 
                            onChange={(e) => setIncomeBase(e.target.value)} 
                            placeholder="Ej: 450" 
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-slate-700 font-bold">Base para Cuentas de Cobro (Egresos)</Label>
                        <input 
                            type="number" 
                            value={expenseBase} 
                            onChange={(e) => setExpenseBase(e.target.value)} 
                            placeholder="Ej: 100" 
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)} variant="outline">Cancelar</Button>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleSave}>Guardar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default Transactions;