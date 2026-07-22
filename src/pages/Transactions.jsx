import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, Printer, Download, Loader2, ArrowRightLeft, Upload, Lock, BookOpen, Table as TableIcon, Store, FileSpreadsheet, CheckCircle2, AlertCircle, FileText, Settings, ChevronDown, ChevronRight, User, FileCheck, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import TransactionDialog from '@/components/transactions/TransactionDialog';
import InternalTransferDialog from '@/components/transactions/InternalTransferDialog';
import StoreTransaction from '@/components/transactions/StoreTransaction';
import { exportToExcel } from '@/lib/excel';
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

const numeroALetras = (num) => {
    if (!num || isNaN(num) || num === 0) return 'CERO PESOS';
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

    const [billingDocuments, saveBillingDocuments] = useCompanyData('billing_documents');
    const [autoBillingCategories, setAutoBillingCategories] = useCompanyData('auto_billing_categories');

    const [processedTransactions, setProcessedTransactions] = useState([]);
    const [filteredTransactions, setFilteredTransactions] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [viewMode, setViewMode] = useState('balances');

    const [dialogOpen, setDialogOpen] = useState(false);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);
    const [storeDialogOpen, setStoreDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [printDialogOpen, setPrintDialogOpen] = useState(false);
    const [transactionToPrint, setTransactionToPrint] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);
    
    const [configBillingOpen, setConfigBillingOpen] = useState(false);
    const [printBillingOpen, setPrintBillingOpen] = useState(false);
    const [billingDocToPrint, setBillingDocToPrint] = useState(null);

    const [printReceiptOpen, setPrintReceiptOpen] = useState(false);
    const [receiptToPrint, setReceiptToPrint] = useState(null);

    const { toast } = useToast();
    const voucherRef = useRef(null);
    const billingRef = useRef(null);
    const receiptRef = useRef(null); 

    const transactionsMap = useMemo(() => {
        return new Map((transactions || []).map(t => [t.id, t]));
    }, [transactions]);

    const availableYears = useMemo(() => {
        const years = new Set((transactions || []).map(t => {
            return (typeof t.date === 'string' && t.date.includes('-')) 
                ? t.date.split('-')[0] 
                : new Date(t.date).getFullYear().toString();
        }));
        const currentYear = new Date().getFullYear().toString();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    const getAssetDetails = (destinationStr, categoryName = '') => {
        if (!destinationStr) {
            const defaultCash = (initialBalances && initialBalances.length > 0) ? initialBalances[0] : null;
            return { code: defaultCash?.accountingCode || '11050501', name: defaultCash?.accountingName || 'CAJA PRINCIPAL' };
        }
        const [id, name] = destinationStr.split('|');
        if (id === 'pending_payable') return { code: '23050101', name: 'CUENTAS POR PAGAR' };
        if (id === 'pending_receivable') return { code: '13050505', name: 'CUENTAS POR COBRAR' };
        if (id === 'caja_principal' || (name && name.toUpperCase().includes('CAJA PRINCIPAL'))) {
            const defaultCash = (initialBalances && initialBalances.length > 0) ? initialBalances[0] : null;
            if (defaultCash) return { code: defaultCash.accountingCode || '11050501', name: defaultCash.accountingName || 'CAJA PRINCIPAL' };
            return { code: '11050501', name: 'CAJA PRINCIPAL' };
        }
        const cashAcc = (cashAccounts || []).find(c => c.id === id);
        if (cashAcc) return { code: cashAcc.accounting_account || '1105', name: cashAcc.name };
        if (id === '12950501' || (name && name.toUpperCase().includes('APORTES COOPERATIVA')) || (categoryName && (categoryName.includes('APORTES COOPERATIVA') || categoryName.includes('12950501')))) return { code: '12950501', name: 'APORTES COOPERATIVA FRATERNIDAD' };
        const bank = (bankAccounts || []).find(b => b.id === id);
        if (bank) return { code: bank.accountingCode || '1110', name: bank.accountingConcept || bank.bankName };
        if (/^\d+$/.test(id) && id.length >= 4) return { code: id, name: name || 'CUENTA DESTINO' };
        return { code: '1120', name: name || 'BANCO DESCONOCIDO' };
    };

    const resolveAccountingRow = (t) => {
        const amount = parseFloat(t.amount);

        if (t.debitAccount && t.creditAccount) {
            return {
                debit: { ...t.debitAccount, value: amount },
                credit: { ...t.creditAccount, value: amount }
            };
        }

        if (t.type === 'transfer' && t.fromAccount && t.toAccount) {
            const debit = getAssetDetails(t.toAccount, t.category);
            const credit = getAssetDetails(t.fromAccount, t.category);
            return { debit: { ...debit, value: amount }, credit: { ...credit, value: amount } };
        }

        const assetAcc = getAssetDetails(t.destination, t.category);
        let debit = { code: '', name: '', value: 0 };
        let credit = { code: '', name: '', value: 0 };

        if (t.isInternalTransfer) {
            let siblingId = '';
            if (t.id.endsWith('-exp')) siblingId = t.id.replace('-exp', '-inc');
            else if (t.id.endsWith('-inc')) siblingId = t.id.replace('-inc', '-exp');
            const sibling = transactionsMap.get(siblingId);
            const contraAcc = sibling ? getAssetDetails(sibling.destination, sibling.category) : { code: '111005', name: 'TRANSFERENCIA EN TRÁNSITO' };

            if (t.type === 'income') {
                debit = { ...assetAcc, value: amount };
                credit = { ...contraAcc, value: amount };
            } else {
                debit = { ...contraAcc, value: amount };
                credit = { ...assetAcc, value: amount };
            }
        } else {
            const catObj = (accounts || []).find(a => a.name === t.category);
            const catAcc = { code: t._accountNumber || (catObj ? catObj.number : (t.type === 'income' ? '4105' : '5105')), name: t.category };
            if (t.type === 'income') {
                debit = { ...assetAcc, value: amount };
                credit = { ...catAcc, value: amount };
            } else {
                debit = { ...catAcc, value: amount };
                credit = { ...assetAcc, value: amount };
            }
        }
        return { debit, credit };
    };

    useEffect(() => {
        if (!transactions || !initialBalances) return;

        const isRelevant = (item) => {
            if (!isConsolidated) return true;
            const relevantIds = companies.filter(c => c.id === activeCompany?.id || c.parentId === activeCompany?.id).map(c => c.id);
            return relevantIds.includes(item._companyId) || (!item._companyId && relevantIds.includes(activeCompany.id));
        };

        let startCash = 0;
        let startBanks = 0;
        let startAportes = 0;

        (initialBalances || []).forEach(ib => { if (isRelevant(ib)) startCash += (parseFloat(ib.balance) || 0); });
        (bankAccounts || []).forEach(ba => { if (isRelevant(ba)) { startBanks += (parseFloat(ba.initialBalance) || 0); startAportes += (parseFloat(ba.initialInvestmentBalance) || 0); } });

        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

        let runningCash = startCash;
        let runningBanks = startBanks;
        let runningAportes = startAportes;

        const calculated = sorted.map(t => {
            const amount = parseFloat(t.amount) || 0;

            if (t.debitAccount && t.creditAccount) {
                const drCode = t.debitAccount.code;
                const crCode = t.creditAccount.code;
                let affected = 'none';

                if (drCode.startsWith('1105')) { runningCash += amount; affected = 'cash'; }
                else if (drCode.startsWith('1110') || drCode.startsWith('1120')) { runningBanks += amount; affected = 'banks'; }

                if (crCode.startsWith('1105')) { runningCash -= amount; affected = 'cash'; }
                else if (crCode.startsWith('1110') || crCode.startsWith('1120')) { runningBanks -= amount; affected = 'banks'; }

                return {
                    ...t,
                    _calculatedCash: runningCash,
                    _calculatedBanks: runningBanks,
                    _calculatedAportes: runningAportes,
                    _accountNumber: drCode,
                    _destName: t.type === 'adjustment' ? 'Ajuste Interno' : (t.destination ? t.destination.split('|')[1] || t.destination.split('|')[0] : 'INVENTARIO GENERAL'),
                    _affectedColumn: affected,
                    _isPending: false,
                    _dualDisplay: `Dr: ${t.debitAccount.name.substring(0, 10)} / Cr: ${t.creditAccount.name.substring(0, 10)}`
                };
            }

            if (t.type === 'transfer') {
                const fromParts = (t.fromAccount || '').split('|');
                const toParts = (t.toAccount || '').split('|');
                const fromId = fromParts[0];
                const toId = toParts[0];

                if (fromId === 'caja_principal' || fromParts[1]?.toUpperCase().includes('CAJA PRINCIPAL')) runningCash -= amount;
                else if (bankAccounts && bankAccounts.some(b => b.id === fromId)) runningBanks -= amount;

                if (toId === 'caja_principal' || toParts[1]?.toUpperCase().includes('CAJA PRINCIPAL')) runningCash += amount;
                else if (bankAccounts && bankAccounts.some(b => b.id === toId)) runningBanks += amount;

                return { ...t, _calculatedCash: runningCash, _calculatedBanks: runningBanks, _calculatedAportes: runningAportes, _accountNumber: 'TRANSFER', _destName: toParts[1] || t.toAccount, _affectedColumn: 'none', _isPending: false };
            }

            const destParts = (t.destination || '').split('|');
            let destName = (destParts[1] || destParts[0] || '').toUpperCase();
            const destId = destParts[0];
            const categoryName = (t.category || '').toUpperCase();
            const accountObj = (accounts || []).find(acc => acc.name === t.category);
            const accountNumber = accountObj ? accountObj.number : 'N/A';
            const isAportesCategory = categoryName.includes('APORTES ORDINARIOS') || categoryName.includes('APORTES COOPERATIVA FRATERNIDAD') || accountNumber === '12950501' || destId === '12950501';
            const isPending = destId === 'pending_payable' || destId === 'pending_receivable';
            const isCashDestination = destId === 'caja_principal' || destName.includes('CAJA PRINCIPAL');

            if (destId === '11201501') destName = 'COOPERATIVA FRATERNIDAD SACERDOTAL';
            if (destId === '12950501') destName = 'APORTES COOPERATIVA FRATERNIDAD';

            let affectedColumn = 'none';

            if (isPending) {
                affectedColumn = 'pending';
            } else if (t.type === 'expense') {
                if (isCashDestination) { runningCash -= amount; affectedColumn = 'cash'; }
                else if (bankAccounts && bankAccounts.some(b => b.id === destId)) { runningBanks -= amount; affectedColumn = 'banks'; }
            } else {
                if (isAportesCategory) { runningAportes += amount; affectedColumn = 'aportes'; }
                else if (isCashDestination) { runningCash += amount; affectedColumn = 'cash'; }
                else if (bankAccounts && bankAccounts.some(b => b.id === destId)) { runningBanks += amount; affectedColumn = 'banks'; }
            }

            return { ...t, _calculatedCash: runningCash, _calculatedBanks: runningBanks, _calculatedAportes: runningAportes, _accountNumber: accountNumber, _destName: isPending ? '(Pendiente)' : destName, _affectedColumn: affectedColumn, _isPending: isPending };
        });
        setProcessedTransactions(calculated);
    }, [transactions, initialBalances, bankAccounts, accounts, isConsolidated, activeCompany, companies]);

    useEffect(() => {
        let result = [...processedTransactions];
        result = result.filter(t => {
            const tYear = (typeof t.date === 'string' && t.date.includes('-')) 
                ? t.date.split('-')[0] 
                : new Date(t.date).getFullYear().toString();
            return tYear === selectedYear;
        });

        if (filterType !== 'all') {
            if (filterType === 'transfer') result = result.filter(t => t.isInternalTransfer || t.type === 'transfer');
            else result = result.filter(t => t.type === filterType && !t.isInternalTransfer);
        }
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(t => (t.description || '').toLowerCase().includes(lower) || (t.category || '').toLowerCase().includes(lower) || (t._accountNumber || '').toLowerCase().includes(lower));
        }
        result.sort((a, b) => new Date(a.date) - new Date(b.date));
        setFilteredTransactions(result);
    }, [processedTransactions, searchTerm, filterType, selectedYear]);

    const getDisplayTransactions = () => {
        const groups = [];
        const processedIds = new Set();
        filteredTransactions.forEach(t => {
            if (processedIds.has(t.id)) return;

            if (t.type === 'transfer') {
                groups.push(t);
                return;
            }

            if (t.isInternalTransfer) {
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
                    const rawDesc = t.description.includes(': ') ? t.description.split(': ')[1] : t.description;
                    const expensePart = isExp ? t : sibling;
                    const incomePart = isExp ? sibling : t;
                    const sourceAsset = getAssetDetails(expensePart.destination, expensePart.category);
                    const destAsset = getAssetDetails(incomePart.destination, incomePart.category);
                    let displayDestName = t._destName;
                    const isAporte = incomePart.category && (incomePart.category.includes('APORTES COOPERATIVA') || incomePart.category.includes('12950501'));
                    if (isAporte) displayDestName = 'APORTES COOPERATIVA FRATERNIDAD';
                    else if (incomePart.destination.startsWith('11201501')) displayDestName = 'COOPERATIVA FRATERNIDAD SACERDOTAL';

                    groups.push({ ...second, id: first.id, description: rawDesc, _mergedAmount: displayAmount, _isMerged: true, _sourceAccount: sourceAsset, _destAccount: destAsset, _rawAmount: amountVal, _destName: displayDestName });
                } else { groups.push(t); }
            } else { groups.push(t); }
        });
        return groups;
    };

    const displayTransactions = useMemo(() => getDisplayTransactions(), [filteredTransactions]);

    const groupedBillingDocuments = useMemo(() => {
        if (!billingDocuments) return {};
        const yearDocs = billingDocuments.filter(d => {
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
    }, [billingDocuments, selectedYear]);

    const getNextVoucherNumber = (type, dateStr) => {
        if (!transactions || transactions.length === 0) return 1;
        
        const year = (typeof dateStr === 'string' && dateStr.includes('-')) 
            ? dateStr.split('-')[0] 
            : new Date(dateStr).getFullYear().toString();
        
        const typeTransactions = transactions.filter(t => {
            let tType = t.type;
            if (t.isInternalTransfer || t.type === 'transfer') tType = 'transfer';
            
            const tYear = (typeof t.date === 'string' && t.date.includes('-')) 
                ? t.date.split('-')[0] 
                : new Date(t.date).getFullYear().toString();
                
            return tType === type && tYear === year;
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
            voucherNumber: transaction.voucherNumber
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

        let updatedTransactions;
        let updatedAssets = [...(fixedAssets || [])];
        let updatedBilling = [...(billingDocuments || [])];
        let transactionId;

        const SMART_PUC_PREFIXES = ['5120', '5125', '5135', '5145', '5220', '5225', '5235', '5245'];
        let shouldAutoGenerateBill = false;
        
        if (transactionData.type === 'expense' && !transactionData.isInternalTransfer) {
            if (Array.isArray(autoBillingCategories)) {
                shouldAutoGenerateBill = autoBillingCategories.includes(transactionData.category);
            } else {
                const catObj = (accounts || []).find(a => a.name === transactionData.category);
                if (catObj && SMART_PUC_PREFIXES.some(prefix => String(catObj.number).startsWith(prefix))) {
                    shouldAutoGenerateBill = true;
                }
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
            const voucherNumber = getNextVoucherNumber(transactionData.type, transactionData.date);
            const newTransaction = { ...transactionData, id: transactionId, voucherNumber };
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
                    voucherNumber: voucherNumber
                });
            }

            toast({ title: "¡Transacción creada!" });
        }

        if (transactionData.type === 'expense' && transactionData.isFixedAsset) {
            const assetPayload = { date: transactionData.date, name: transactionData.description, value: parseFloat(transactionData.amount), year: new Date(transactionData.date).getFullYear().toString(), transactionId: transactionId };
            updatedAssets.push({ ...assetPayload, id: `asset-${transactionId}`, status: 'Bueno', quantity: 1 });
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

        let updatedInventory = [...(inventory || [])];
        let inventoryChanged = false;

        transactionsToDeleteIds.forEach(txId => {
            const tx = transactions.find(t => t.id === txId);
            if (tx && tx.productId && tx.productQuantity) {
                const productIndex = updatedInventory.findIndex(p => p.id === tx.productId);
                if (productIndex >= 0) {
                    const product = { ...updatedInventory[productIndex] };
                    const qty = parseFloat(tx.productQuantity);

                    if (tx.isPurchase || (tx.type === 'expense' && tx.isPurchase)) {
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
        const voucherNumber = getNextVoucherNumber('transfer', transferData.date);

        if (transferData.isAccounting) {
            const debitAccObj = (accounts || []).find(a => a.name === transferData.debitAccount) || { number: '150805', name: transferData.debitAccount };
            const creditAccObj = (accounts || []).find(a => a.name === transferData.creditAccount) || { number: '133005', name: transferData.creditAccount };

            const expenseTransaction = {
                id: `${now}-exp`,
                type: 'expense',
                description: `Cruce: ${transferData.description}`,
                amount: parseFloat(transferData.amount),
                category: transferData.debitAccount, 
                date: transferData.date,
                destination: `${creditAccObj.number}|${creditAccObj.name.toUpperCase()}`, 
                isInternalTransfer: true,
                voucherNumber
            };

            const incomeTransaction = {
                id: `${now}-inc`,
                type: 'income',
                description: `Cruce: ${transferData.description}`,
                amount: parseFloat(transferData.amount),
                category: transferData.creditAccount, 
                date: transferData.date,
                destination: `${debitAccObj.number}|${debitAccObj.name.toUpperCase()}`, 
                isInternalTransfer: true,
                voucherNumber
            };

            if (debitAccObj.number.startsWith('15')) {
                const assetPayload = {
                    date: transferData.date,
                    name: transferData.description, 
                    value: parseFloat(transferData.amount),
                    year: new Date(transferData.date).getFullYear().toString(),
                    transactionId: expenseTransaction.id
                };

                const newAsset = {
                    ...assetPayload,
                    id: `asset-${expenseTransaction.id}`,
                    status: 'Bueno',
                    quantity: 1,
                    category: debitAccObj.name 
                };

                saveFixedAssets([...(fixedAssets || []), newAsset]);
            }

            saveTransactions([...transactions, expenseTransaction, incomeTransaction]);
            toast({ title: "Cruce contable aplicado", description: "Los saldos en el Balance General han sido ajustados." });
            setTransferDialogOpen(false);
            return;
        }

        const { fromAccount, toAccount, amount, date, description } = transferData;
        const [fromId, fromName] = fromAccount.split('|');
        const [toId, toName] = toAccount.split('|');

        const expenseTransaction = { id: `${now}-exp`, type: 'expense', description: `Transferencia a ${toName}: ${description}`, amount: parseFloat(amount), category: 'Transferencia Interna', date, destination: fromAccount, isInternalTransfer: true, voucherNumber };
        const incomeTransaction = { id: `${now}-inc`, type: 'income', description: `Transferencia desde ${fromName}: ${description}`, amount: parseFloat(amount), category: 'Transferencia Interna', date, destination: toAccount, isInternalTransfer: true, voucherNumber };

        saveTransactions([...transactions, expenseTransaction, incomeTransaction]);
        toast({ title: "Transferencia registrada", description: "Se movió el dinero entre cuentas." });
        setTransferDialogOpen(false);
    };

    const handleExport = () => {
        if (displayTransactions.length === 0) return;
        const dataToExport = displayTransactions.map(t => {
            const date = parseISO(t.date);
            let typeLabel = (t.isInternalTransfer || t.type === 'transfer') ? 'Transferencia' : (t.type === 'income' ? 'Ingreso' : 'Egreso');
            if (t._isPending) typeLabel += ' (Pendiente)';
            let voucherPrefix = (t.isInternalTransfer || t.type === 'transfer') ? 'T' : (t.type === 'income' ? 'I' : 'E');
            let displayVoucher = t.voucherNumber ? `${voucherPrefix}-${String(t.voucherNumber).padStart(4, '0')}` : 'N/A';
            const amountValue = t._mergedAmount ? `'${t._mergedAmount}` : parseFloat(t.amount);
            return { 'Comprobante': displayVoucher, 'Fecha': isValid(date) ? format(date, 'dd/MM/yyyy') : 'Fecha inválida', 'Descripción': t.description, 'Tipo': typeLabel, 'Nº Cuenta': t._accountNumber, 'Categoría': t.category, 'Monto': amountValue, 'Destino': t._destName, 'Saldo Caja': t._calculatedCash, 'Saldo Bancos': t._calculatedBanks, 'Saldo Aportes': t._calculatedAportes }
        });
        exportToExcel(dataToExport, `Transacciones_Control_${selectedYear}`, {});
        toast({ title: "¡Exportado!", description: "Informe exportado a Excel." });
    };

    const handleExportAccounting = () => {
        if (displayTransactions.length === 0) { toast({ variant: 'destructive', title: "No hay datos para exportar" }); return; }
        const dataToExport = [];
        displayTransactions.forEach(t => {
            const date = parseISO(t.date);
            let prefix = (t.isInternalTransfer || t.type === 'transfer') ? 'T' : (t.type === 'income' ? 'I' : 'E');
            let vId = t.voucherNumber ? `${prefix}-${String(t.voucherNumber).padStart(4, '0')}` : '-';
            if (t._isMerged && t.isInternalTransfer) {
                dataToExport.push({ 'Fecha': isValid(date) ? format(date, 'dd/MM/yyyy') : '-', 'Comprobante': vId, 'Código': t._destAccount.code, 'Cuenta': t._destAccount.name, 'Descripción': t.description, 'Débito': t._rawAmount, 'Crédito': 0 });
                dataToExport.push({ 'Fecha': isValid(date) ? format(date, 'dd/MM/yyyy') : '-', 'Comprobante': vId, 'Código': t._sourceAccount.code, 'Cuenta': t._sourceAccount.name, 'Descripción': t.description, 'Débito': 0, 'Crédito': t._rawAmount });
            } else {
                const { debit, credit } = resolveAccountingRow(t);
                dataToExport.push({ 'Fecha': isValid(date) ? format(date, 'dd/MM/yyyy') : '-', 'Comprobante': vId, 'Código': debit.code, 'Cuenta': debit.name, 'Descripción': t.description, 'Débito': debit.value, 'Crédito': 0 });
                dataToExport.push({ 'Fecha': isValid(date) ? format(date, 'dd/MM/yyyy') : '-', 'Comprobante': vId, 'Código': credit.code, 'Cuenta': credit.name, 'Descripción': t.description, 'Débito': 0, 'Crédito': credit.value });
            }
        });
        exportToExcel(dataToExport, `Contabilidad_Partida_Doble_${selectedYear}`, {});
        toast({ title: "¡Exportado!", description: "Informe contable exportado a Excel." });
    };

    const handlePrint = (t) => {
        let debit, credit;
        if (t._isMerged) {
            debit = { code: t._destAccount.code, name: t._destAccount.name, value: t._rawAmount };
            credit = { code: t._sourceAccount.code, name: t._sourceAccount.name, value: t._rawAmount };
        } else {
            const resolved = resolveAccountingRow(t);
            debit = resolved.debit;
            credit = resolved.credit;
        }

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
            accountCode: t._accountNumber || (t.type === 'income' ? credit.code : debit.code),
            debitAccount: t.debitAccount || debit,
            creditAccount: t.creditAccount || credit,
            amount: t._rawAmount || t.amount
        };

        setTransactionToPrint(enrichedTransaction);
        setPrintDialogOpen(true);
    };

    const handlePrintToPdf = () => {
        if (!voucherRef.current) return;
        setIsPrinting(true);
        const printContent = voucherRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
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

    // IMPRESIÓN CUENTA DE COBRO (Media Carta Perfecta)
    const handlePrintBillingDocPdf = () => {
        if (!billingRef.current) return;
        setIsPrinting(true);
        const printContent = billingRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
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

    // IMPRESIÓN RECIBO CAJA / DONACIÓN (Media Carta Perfecta)
    const handlePrintReceiptPdf = () => {
        if (!receiptRef.current) return;
        setIsPrinting(true);
        const printContent = receiptRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=700');
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
                        <div className="flex gap-2">
                            <select className="text-sm border rounded-md px-3 py-2 bg-white" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={() => setViewMode('balances')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'balances' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><TableIcon className="w-3 h-3 inline mr-1" /> Control Saldos</button>
                                <button onClick={() => setViewMode('accounting')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'accounting' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><BookOpen className="w-3 h-3 inline mr-1" /> Vista Contable</button>
                                <button onClick={() => setViewMode('billing')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'billing' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-blue-600'}`}><FileText className="w-3 h-3 inline mr-1" /> Cuentas de Cobro</button>
                            </div>
                            {canEdit && <Button variant="outline" size="icon" onClick={() => setConfigBillingOpen(true)} className="ml-1 text-slate-500 hover:text-blue-600 bg-white" title="Configurar Autogeneración Cuentas de Cobro"><Settings className="w-4 h-4"/></Button>}
                        </div>
                    </div>
                    
                    {viewMode !== 'billing' && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {['all', 'income', 'expense', 'transfer'].map(type => (<Button key={type} variant={filterType === type ? 'default' : 'outline'} size="sm" onClick={() => setFilterType(type)} className="capitalize">{type === 'all' ? 'Todas' : type === 'income' ? 'Ingresos' : type === 'expense' ? 'Gastos' : 'Transferencias'}</Button>))}
                            <div className="ml-auto flex gap-2">
                                {viewMode === 'accounting' ? <Button variant="outline" size="sm" onClick={handleExportAccounting} className="bg-white shadow-sm"><Download className="w-4 h-4 mr-2" /> Excel (Partida Doble)</Button> : <Button variant="ghost" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" /> Excel</Button>}
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
                                        const date = parseISO(t.date);
                                        const isIncome = t.type === 'income';
                                        let prefix = (t.isInternalTransfer || t.type === 'transfer') ? 'T' : (isIncome ? 'I' : 'E');
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-50 group">
                                                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{isValid(date) ? format(date, 'dd/MM/yyyy') : '-'}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.voucherNumber ? `${prefix}-${String(t.voucherNumber).padStart(4, '0')}` : '-'}</td>
                                                <td className="px-4 py-3 text-slate-700 font-medium max-w-[200px] truncate" title={t.description}>{t.description}{t._isPending && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full">Pendiente</span>}</td>

                                                <td className="px-4 py-3 text-slate-600">
                                                    {t._dualDisplay ? (
                                                        <div className="flex flex-col text-[10px] leading-tight font-mono text-slate-500" title={t._dualDisplay}>
                                                            <span className="font-bold text-slate-700">{t.category}</span>
                                                            <span>{t._dualDisplay}</span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${t.isInternalTransfer || t.type === 'transfer' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>{t.category}</span>
                                                            <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]">Dest: {t._destName}</span>
                                                        </>
                                                    )}
                                                </td>

                                                <td className={`px-4 py-3 text-right font-mono font-medium ${t._mergedAmount ? 'text-slate-800' : (t.type === 'transfer' ? 'text-slate-800' : (isIncome ? 'text-green-600' : 'text-red-600'))}`}>{t._mergedAmount ? t._mergedAmount : ((isIncome || t.type === 'transfer' ? '' : '-') + parseFloat(t.amount).toLocaleString('es-CO', { minimumFractionDigits: 0 }))}</td>
                                                <td className={`px-4 py-3 text-right font-mono text-slate-600 bg-blue-50/30 ${t._affectedColumn === 'cash' ? 'font-bold text-slate-900' : ''}`}>{t._calculatedCash.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                <td className={`px-4 py-3 text-right font-mono text-slate-600 bg-purple-50/30 ${t._affectedColumn === 'banks' ? 'font-bold text-slate-900' : ''}`}>{t._calculatedBanks.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                <td className={`px-4 py-3 text-right font-mono text-slate-600 bg-green-50/30 ${t._affectedColumn === 'aportes' ? 'font-bold text-slate-900' : ''}`}>{t._calculatedAportes.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50" onClick={() => handlePrint(t)} title="Imprimir Comprobante"><Printer className="w-3 h-3" /></Button>
                                                        
                                                        {/* BOTÓN NUEVO: Cuenta de Cobro solo para Egresos */}
                                                        {t.type === 'expense' && !t.isInternalTransfer && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50" onClick={() => handleGenerateBillingDoc(t)} title="Generar/Ver Cuenta de Cobro">
                                                                <FileText className="w-3 h-3" />
                                                            </Button>
                                                        )}

                                                        {/* BOTÓN NUEVO: Recibo de Caja / Donación para Ingresos */}
                                                        {t.type === 'income' && !t.isInternalTransfer && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50" onClick={() => handleGenerateReceipt(t)} title="Generar Recibo de Caja / Certificado">
                                                                <FileCheck className="w-3 h-3" />
                                                            </Button>
                                                        )}

                                                        {(canEdit || canAdd) && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTransaction(t); setDialogOpen(true); }}><Edit2 className="w-3 h-3" /></Button>}
                                                        {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDelete(t.id)}><Trash2 className="w-3 h-3" /></Button>}
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
                                        const date = parseISO(t.date);
                                        let prefix = (t.isInternalTransfer || t.type === 'transfer') ? 'T' : (t.type === 'income' ? 'I' : 'E');
                                        let vId = t.voucherNumber ? `${prefix}-${String(t.voucherNumber).padStart(4, '0')}` : '-';
                                        if (t._isMerged && t.isInternalTransfer) {
                                            return (
                                                <React.Fragment key={t.id}>
                                                    <tr className="border-t border-slate-100 bg-blue-50"><td className="px-4 py-2 text-slate-500">{isValid(date) ? format(date, 'dd/MM/yyyy') : '-'}</td><td className="px-4 py-2 font-mono text-xs text-slate-400">{vId}</td><td className="px-4 py-2"><div className="flex flex-col"><span className="font-bold text-slate-700 text-xs">{t._destAccount.code}</span><span className="text-slate-600 text-xs uppercase">{t._destAccount.name}</span></div></td><td className="px-4 py-2 text-slate-500 italic text-xs">{t.description}</td><td className="px-4 py-2 text-right font-mono text-slate-800">{t._rawAmount.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td><td className="px-4 py-2 text-right font-mono text-slate-300">-</td></tr>
                                                    <tr className="bg-blue-50"><td className="px-4 py-1 border-none"></td><td className="px-4 py-1 border-none"></td><td className="px-4 py-2 border-none pl-8"><div className="flex flex-col"><span className="font-bold text-slate-700 text-xs">{t._sourceAccount.code}</span><span className="text-slate-600 text-xs uppercase">{t._sourceAccount.name}</span></div></td><td className="px-4 py-2 border-none"></td><td className="px-4 py-2 border-none text-right font-mono text-slate-300">-</td><td className="px-4 py-2 border-none text-right font-mono text-slate-800">{t._rawAmount.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td></tr>
                                                    <tr><td colSpan="6" className="h-1 bg-slate-50 border-b border-slate-200"></td></tr>
                                                </React.Fragment>
                                            );
                                        }
                                        const { debit: debitRow, credit: creditRow } = resolveAccountingRow(t);
                                        let rowColorClass = t.type === 'income' ? 'bg-green-50' : (t.type === 'transfer' ? 'bg-orange-50' : 'bg-red-50');
                                        return (
                                            <React.Fragment key={t.id}>
                                                <tr className={`border-t border-slate-100 ${rowColorClass}`}><td className="px-4 py-2 text-slate-500">{isValid(date) ? format(date, 'dd/MM/yyyy') : '-'}</td><td className="px-4 py-2 font-mono text-xs text-slate-400">{vId}</td><td className="px-4 py-2"><div className="flex flex-col"><span className="font-bold text-slate-700 text-xs">{debitRow.code}</span><span className="text-slate-600 text-xs uppercase">{debitRow.name}</span></div></td><td className="px-4 py-2 text-slate-500 italic text-xs">{t.description}</td><td className="px-4 py-2 text-right font-mono text-slate-800">{debitRow.value.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td><td className="px-4 py-2 text-right font-mono text-slate-300">-</td></tr>
                                                <tr className={`${rowColorClass}`}><td className="px-4 py-1 border-none"></td><td className="px-4 py-1 border-none"></td><td className="px-4 py-2 border-none pl-8"><div className="flex flex-col"><span className="font-bold text-slate-700 text-xs">{creditRow.code}</span><span className="text-slate-600 text-xs uppercase">{creditRow.name}</span></div></td><td className="px-4 py-2 border-none"></td><td className="px-4 py-2 border-none text-right font-mono text-slate-300">-</td><td className="px-4 py-2 border-none text-right font-mono text-slate-800">{creditRow.value.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td></tr>
                                                <tr><td colSpan="6" className="h-1 bg-slate-50 border-b border-slate-200"></td></tr>
                                            </React.Fragment>
                                        );
                                    })}
                                    {displayTransactions.length === 0 && (<tr><td colSpan="6" className="text-center py-8 text-slate-400">No hay registros contables</td></tr>)}
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

            {/* Configuración Auto-Cobros */}
            <AutoBillingConfigDialog
                open={configBillingOpen}
                onOpenChange={setConfigBillingOpen}
                accounts={accounts}
                autoBillingCategories={autoBillingCategories || []}
                onSave={setAutoBillingCategories}
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
                                        receiptToPrint?.voucherNumber
                                    ).padStart(4, "0")}
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
                                    Ref. Egreso N° E-{String(billingDocToPrint?.voucherNumber).padStart(4, "0")}
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
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-semibold">Vista Previa</h3><Button size="sm" onClick={handlePrintToPdf} disabled={isPrinting}>{isPrinting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}Imprimir PDF</Button></div>
                        <div className="p-8 bg-slate-200 overflow-auto max-h-[80vh] flex justify-center"><div ref={voucherRef} className="bg-white shadow-2xl" style={{ width: '215.9mm', minHeight: '139.7mm' }}><Voucher transaction={transactionToPrint} /></div></div>
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
const BankReconciliationDialog = ({ open, onOpenChange, transactions, saveTransactions, accounts, bankAccounts, cashAccounts, activeCompany }) => {
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

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { raw: false, defval: null });
                processBankData(data);
            } catch (error) {
                toast({ variant: 'destructive', title: "Error al leer archivo", description: "Asegúrate de que sea un archivo Excel (.xlsx o .xls) o CSV válido." });
            }
        };
        reader.readAsBinaryString(file);
    };

    const processBankData = (data) => {
        const missingTransactions = [];
        const tempVouchers = {};

        data.forEach((row, index) => {
            const dateStr = row['Fecha'] || row['Date'] || row['FECHA'] || row['fecha'] || '';
            const desc = row['Clase de Movimiento'] || row['Concepto'] || row['Descripción'] || row['Descripcion'] || row['Detalle'] || 'Movimiento Importado';

            const cleanNumber = (val) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                return parseFloat(val.replace(/[^0-9.-]+/g, "")) || 0;
            };

            const amountIn = cleanNumber(row['Consignacion'] || row['Abono'] || row['Ingreso'] || row['Crédito']);
            const amountOut = cleanNumber(row['Retiro'] || row['Cargo'] || row['Egreso'] || row['Débito']);

            const rawAmount = cleanNumber(row['Monto'] || row['Valor'] || row['Saldo']);

            let finalAmount = 0;
            let type = 'income';

            if (amountIn > 0) { finalAmount = amountIn; type = 'income'; }
            else if (amountOut > 0) { finalAmount = amountOut; type = 'expense'; }
            else if (rawAmount !== 0) {
                finalAmount = Math.abs(rawAmount);
                type = rawAmount > 0 ? 'income' : 'expense';
            }

            if (finalAmount === 0 || !dateStr) return;

            let parsedDate = null;
            try {
                const cleanDateStr = dateStr.replace(/\//g, '-');
                parsedDate = new Date(cleanDateStr);
                if (isNaN(parsedDate)) throw new Error('Invalid Date');
            } catch (e) {
                parsedDate = new Date(); 
            }

            const isMatched = (transactions || []).some(t => {
                if (t.type !== type) return false;
                const dbAmount = parseFloat(t.amount);
                const diffAmount = Math.abs(dbAmount - finalAmount);
                if (diffAmount > 1) return false; 

                const tDate = new Date(t.date);
                const diffDays = Math.abs(differenceInDays(parsedDate, tDate));
                if (diffDays > 3) return false; 

                return true; 
            });

            if (!isMatched) {
                const finalDateStr = isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
                missingTransactions.push({
                    id: `import-${index}`,
                    date: finalDateStr,
                    description: desc.substring(0, 100), 
                    amount: finalAmount,
                    type: type,
                    originalRow: row 
                });
            }
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
                const text = t.description.toLowerCase();
                let suggestedCategory = '';
                if (text.includes('interes') || text.includes('rendimiento')) {
                    const c = accounts.find(a => String(a.number).startsWith('4210') || a.name.toLowerCase().includes('financiero'));
                    if (c) suggestedCategory = c.name;
                } else if (text.includes('cuota') || text.includes('manejo') || text.includes('comision') || text.includes('4x1000') || text.includes('gmf')) {
                    const c = accounts.find(a => String(a.number).startsWith('5305') || a.name.toLowerCase().includes('bancario') || a.name.toLowerCase().includes('financiero'));
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

        parsedRows.forEach((row, i) => {
            if (!selectedRows[row.id]) return; 

            const category = rowMappings[row.id];
            if (!category) {
                toast({ variant: 'destructive', title: "Falta Categoría", description: `Asigna una cuenta contable a la transacción: ${row.description}` });
                throw new Error("Categoría faltante");
            }

            const year = (typeof row.date === 'string' && row.date.includes('-')) 
                ? row.date.split('-')[0] 
                : new Date(row.date).getFullYear().toString();
                
            const typeKey = `${row.type}-${year}`;

            if (nextVouchers[typeKey] === undefined) {
                const typeTransactions = transactions.filter(t => {
                    let tType = t.type;
                    if (t.isInternalTransfer || t.type === 'transfer') tType = 'transfer';
                    const tYear = (typeof t.date === 'string' && t.date.includes('-')) 
                        ? t.date.split('-')[0] 
                        : new Date(t.date).getFullYear().toString();
                    return tType === row.type && tYear === year;
                });
                const maxNum = typeTransactions.reduce((max, t) => {
                    const currentVnum = parseInt(t.voucherNumber, 10) || 0;
                    return currentVnum > max ? currentVnum : max;
                }, 0);
                nextVouchers[typeKey] = maxNum + 1;
            }

            const voucherNumber = nextVouchers[typeKey];
            nextVouchers[typeKey]++;

            transactionsToAdd.push({
                id: `${now}-import-${i}`,
                type: row.type,
                date: row.date,
                description: `${row.description} (Conciliación)`,
                amount: row.amount,
                category: category,
                destination: selectedBank,
                isInternalTransfer: false,
                voucherNumber: voucherNumber
            });
        });

        saveTransactions([...transactions, ...transactionsToAdd]);
        toast({ title: "Conciliación Exitosa", description: `Se importaron ${transactionsToAdd.length} movimientos faltantes.` });
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
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 mt-4">
                        <Upload className="w-12 h-12 text-emerald-500 mb-4" />
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Sube tu Extracto Bancario</h3>
                        <p className="text-slate-500 text-sm text-center max-w-md mb-6">
                            Descarga el extracto de tu Cooperativa o Banco en formato <b>Excel (.xlsx) o CSV</b> y súbelo aquí. El sistema detectará automáticamente los intereses, comisiones o ingresos que te falten registrar.
                        </p>
                        <Label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium shadow-sm transition-colors">
                            Seleccionar Archivo
                            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
                        </Label>
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
                            <Select value={selectedBank} onValueChange={setSelectedBank}>
                                <SelectTrigger className="w-[300px] border-slate-300">
                                    <SelectValue placeholder="¿A qué banco ingresó este dinero?" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="caja_principal|CAJA PRINCIPAL">CAJA PRINCIPAL</SelectItem>
                                    {bankAccounts?.map(acc => (
                                        <SelectItem key={acc.id} value={`${acc.id}|${acc.bankName}`}>{acc.bankName}</SelectItem>
                                    ))}
                                    {cashAccounts?.map(acc => (
                                        <SelectItem key={acc.id} value={`${acc.id}|${acc.name}`}>{acc.name} (Caja Menor)</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                                                <td className="p-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                                                <td className="p-3 font-medium text-slate-800">{row.description}</td>
                                                <td className={`p-3 text-right font-mono font-bold ${row.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {row.type === 'income' ? '+' : '-'}${row.amount.toLocaleString('es-ES', {minimumFractionDigits: 2})}
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

export default Transactions;