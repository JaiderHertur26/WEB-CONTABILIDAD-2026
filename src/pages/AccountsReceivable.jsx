import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Download, Edit2, Trash2, Search, CheckCircle, DollarSign, ClipboardList, Printer, Loader2, Lock, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { exportToExcel } from '@/lib/excel';
import { parseAccountingDate, getAccountingYear, accountingDateValue } from '@/lib/accountingDate';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import TrackingSheetVoucher from '@/components/transactions/TrackingSheetVoucher';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { usePermission } from '@/hooks/usePermission';
import { useCompany } from '@/contexts/CompanyContext';
import { useDestructiveAction } from '@/contexts/DestructiveActionContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { resolveLiquidityAccount, liquidityEndpointOptions } from '@/lib/liquidityAccounts';
import { isNativeApp, shareJsPdf } from '@/lib/nativeFiles';
import ContactSelector from '@/components/transactions/ContactSelector';
import AccountsLedgerHeader from '@/components/accounts/AccountsLedgerHeader';

const Highlight = ({ text, highlight }) => {
  if (!highlight || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>{parts.map((part, i) => part.toLowerCase() === highlight.toLowerCase() ? <span key={i} className="bg-yellow-200 text-slate-900 font-semibold rounded-sm px-0.5">{part}</span> : part)}</>
  );
};

const getCategoryName = (code) => {
  const categories = {
    '1': 'ACTIVOS',
    '2': 'PASIVOS',
    '3': 'PATRIMONIO',
    '4': 'INGRESOS',
    '5': 'GASTOS',
    '6': 'COSTOS DE VENTAS',
    '7': 'COSTOS DE PRODUCCIÓN'
  };
  return categories[code] || 'OTRAS';
};

const AccountSelector = ({ accounts, value, onChange, disabled, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const selectedAccount = accounts.find(a => a.name === value);
  
  const filteredAccounts = accounts.filter(account => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (account.number.toLowerCase().includes(search) || account.name.toLowerCase().includes(search));
  });

  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const code = account.number ? account.number.charAt(0) : '?';
    if (!groups[code]) groups[code] = [];
    groups[code].push(account);
    return groups;
  }, {});

  const handleOpenChange = nextOpen => {
    setOpen(nextOpen);
    if (!nextOpen) setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between bg-white border-slate-300 text-slate-900 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 text-left font-normal">
          {selectedAccount ? (
            <span className="truncate">
              {selectedAccount.number} - {selectedAccount.name}
            </span>
          ) : (
            <span className="text-slate-500">{placeholder || "Selecciona una cuenta..."}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[60] w-[min(420px,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false} className="w-full">
          <CommandInput placeholder="Buscar por nombre o código..." value={searchQuery} onValueChange={setSearchQuery} className="h-10" />
          <CommandList className="max-h-[300px] overflow-y-auto">
            {filteredAccounts.length === 0 && (<div className="py-6 text-center text-sm text-slate-500">No se encontró la cuenta "{searchQuery}"</div>)}
            
            {Object.keys(groupedAccounts).sort().map(code => (
               <CommandGroup key={code} heading={`${code} - ${getCategoryName(code)}`}>
                  {groupedAccounts[code].map((account) => (
                    <CommandItem 
                      key={account.id || account.number} 
                      value={account.name} 
                      onSelect={() => { onChange(account.name); setOpen(false); setSearchQuery(""); }}
                      className="cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100"
                    >
                      <Check className={cn("mr-2 h-4 w-4 text-blue-600 flex-shrink-0", value === account.name ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col w-full min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate"><Highlight text={account.name} highlight={searchQuery} /></div>
                        <div className="text-xs text-slate-500 font-mono truncate"><Highlight text={account.number} highlight={searchQuery} /></div>
                      </div>
                    </CommandItem>
                  ))}
               </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const AccountsReceivable = () => {
    const { activeCompany } = useCompany();
    const { canEdit, canDelete, canAdd, isReadOnly, isConsolidatedReadOnly } = usePermission();
    const [receivables, saveReceivables] = useCompanyData('accountsReceivable');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts'); 
    const [bankAccounts] = useCompanyData('bankAccounts');
    const [cashAccounts] = useCompanyData('cash_accounts');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    const [contacts] = useCompanyData('contacts');
    const [massIntentions, saveMassIntentions] = useCompanyData('mass_intentions');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
    const [receivableToPay, setReceivableToPay] = useState(null);
    const [editingReceivable, setEditingReceivable] = useState(null);
    const [receivableForTracking, setReceivableForTracking] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [printDialogOpen, setPrintDialogOpen] = useState(false);
    const [itemToPrint, setItemToPrint] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const voucherRef = useRef(null);

    const { toast } = useToast();
    const { requestDestructiveAuthorization, releaseDestructiveAuthorization } = useDestructiveAction();

    // CORRECCIÓN: Función que cuenta los comprobantes basados en el año real
    const getNextVoucherNumber = (type, dateStr) => {
        if (!transactions) return 1;
        const year = getAccountingYear(dateStr).toString();
        const typeTransactions = transactions.filter(t => {
            let tType = t.type;
            if (t.isInternalTransfer || t.type === 'transfer') tType = 'transfer';
            const tYear = getAccountingYear(t.date).toString();
            return tType === type && tYear === year;
        });
        const maxNum = typeTransactions.reduce((max, t) => {
            return (t.voucherNumber && t.voucherNumber > max) ? t.voucherNumber : max;
        }, 0);
        return maxNum + 1;
    };

    const receivableAccount = () => {
        const account = (accounts || []).find(a => String(a.number) === '13050505')
            || (accounts || []).find(a => String(a.number).startsWith('130505'))
            || (accounts || []).find(a => String(a.number).startsWith('13'));
        return account
            ? { code: String(account.number), name: account.name }
            : { code: '13050505', name: 'CUENTAS POR COBRAR' };
    };

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const handleSaveReceivable = (receivableData) => {
        if (editingReceivable ? !canEdit : !canAdd) return;
        if (!canEdit && editingReceivable) return;

        const { isNew, ...data } = receivableData;
        const selectedContact = data.contactId
            ? (contacts || []).find(contact => String(contact.id) === String(data.contactId))
            : null;
        if (selectedContact) {
            data.customer = selectedContact.name;
            data.contact = selectedContact.name;
        }
        const linkedIntention = data.massIntentionId
            ? (massIntentions || []).find(item => String(item.id) === String(data.massIntentionId))
            : null;
        if (linkedIntention?.receivableId && String(linkedIntention.receivableId) !== String(editingReceivable?.id || '')) {
            toast({ variant:'destructive', title:'Intención ya vinculada', description:'Esta intención ya pertenece a otra cuenta por cobrar.' });
            return;
        }
        if (linkedIntention?.transactionId && String(linkedIntention.receivableId || '') !== String(editingReceivable?.id || '')) {
            toast({ variant:'destructive', title:'Ofrenda ya recibida', description:'Esta intención ya tiene un comprobante de ingreso. No puede causarse nuevamente como cuenta por cobrar.' });
            return;
        }
        const amount = Number(data.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast({ variant:'destructive', title:'Monto inválido', description:'La cuenta por cobrar debe ser mayor a cero.' });
            return;
        }
        const revenue = (accounts || []).find(a => a.name === data.linkedAccount);
        if (!revenue) {
            toast({ variant:'destructive', title:'Cuenta inválida', description:'No se pudo resolver la cuenta de ingreso seleccionada.' });
            return;
        }
        const lockReason = periodLockReason(data.issueDate);
        if (lockReason) {
            toast({ variant:'destructive', title:'Período contable cerrado', description: lockReason });
            return;
        }

        let updatedReceivables;
        let updatedTransactions = [...(transactions || [])];
        let savedReceivableId = editingReceivable?.id || null;

        if (isNew) {
            const newReceivableId = Date.now().toString();
            savedReceivableId = newReceivableId;
            const voucherNumber = getNextVoucherNumber('adjustment', data.issueDate);
            const ar = receivableAccount();

            updatedReceivables = [...(receivables || []), {
                ...data,
                amount,
                id: newReceivableId,
                status: 'Pendiente',
                paidAmount: 0,
                balance: amount,
                payments: [],
                internalPayments: []
            }];

            updatedTransactions.push({
                id: `txn-ar-accrual-${newReceivableId}`,
                type: 'adjustment',
                voucherPrefix: 'A',
                date: data.issueDate,
                description: `Causación CxC: ${data.description}`,
                amount,
                category: data.linkedAccount,
                contactId: data.contactId || '',
                contact: data.contact || data.customer || '',
                sourceModule: data.massIntentionId ? 'mass_intentions' : 'accounts_receivable',
                massIntentionId: data.massIntentionId || '',
                debitAccount: ar,
                creditAccount: { code: String(revenue.number), name: revenue.name },
                isReceivableAccrual: true,
                isReceivablePayable: true,
                receivableId: newReceivableId,
                voucherNumber,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            });

            toast({ title: "Cuenta por cobrar creada", description: `Causación registrada en A-${String(voucherNumber).padStart(4, '0')} sin mover Caja/Banco.` });
        } else {
            const current = editingReceivable;
            const officialPayments = (current.payments || []).filter(p => !p.reversedAt);
            const accrual = updatedTransactions.find(t =>
                t.receivableId === current.id && t.isReceivableAccrual
            ) || updatedTransactions.find(t => t.id === `txn-inc-${current.id}`);

            if (officialPayments.length > 0 || current.status === 'Parcial' || current.status === 'Cobrado') {
                toast({ variant:'destructive', title:'CxC con recaudos', description:'No puede editarse la causación después de registrar cobros oficiales.' });
                return;
            }
            const sourceLockReason = accrual
                ? periodLockReason(accrual.date)
                : periodLockReason(current.issueDate);
            if (accrual?.isLocked || sourceLockReason) {
                toast({
                    variant:'destructive',
                    title:'Causación oficializada',
                    description: accrual?.isLocked
                        ? 'El asiento de esta CxC pertenece a un período oficializado.'
                        : sourceLockReason
                });
                return;
            }

            updatedReceivables = receivables.map(r =>
                r.id === current.id ? { ...r, ...data, amount, balance: amount } : r
            );

            if (accrual) {
                const ar = receivableAccount();
                updatedTransactions = updatedTransactions.map(t => t.id === accrual.id ? {
                    ...t,
                    type: 'adjustment',
                    voucherPrefix: 'A',
                    date: data.issueDate,
                    description: `Causación CxC: ${data.description}`,
                    amount,
                    category: data.linkedAccount,
                    contactId: data.contactId || '',
                    contact: data.contact || data.customer || '',
                    sourceModule: data.massIntentionId ? 'mass_intentions' : 'accounts_receivable',
                    massIntentionId: data.massIntentionId || '',
                    debitAccount: ar,
                    creditAccount: { code: String(revenue.number), name: revenue.name },
                    destination: undefined,
                    isReceivableAccrual: true,
                    isReceivablePayable: true,
                    receivableId: current.id,
                } : t);
            }
            toast({ title: "Cuenta por cobrar actualizada" });
        }

        saveTransactions(updatedTransactions);
        saveReceivables(updatedReceivables);

        const previousMassIntentionId = editingReceivable?.massIntentionId || '';
        if (previousMassIntentionId || data.massIntentionId) {
            saveMassIntentions((massIntentions || []).map(item => {
                if (String(item.id) === String(previousMassIntentionId) && String(previousMassIntentionId) !== String(data.massIntentionId || '')) {
                    return { ...item, receivableId: '' };
                }
                if (String(item.id) === String(data.massIntentionId || '')) {
                    return { ...item, receivableId: savedReceivableId };
                }
                return item;
            }));
        }

        setDialogOpen(false);
    };

    const handleDeleteReceivable = async (id) => {
        if (!canDelete) return;
        const target = (receivables || []).find(r => r.id === id);
        if (!target) return;
        const accrual = (transactions || []).find(t =>
            (t.receivableId === id && t.isReceivableAccrual) ||
            t.id === `txn-inc-${id}`
        );
        const hasPayments = (target?.payments || []).some(p => !p.reversedAt) ||
            (transactions || []).some(t => t.receivableId === id && t.isReceivableCollection);
        if (hasPayments) {
            toast({ variant:'destructive', title:'CxC con recaudos', description:'No puede eliminarse una cuenta por cobrar que ya tiene cobros oficiales.' });
            return;
        }
        const sourceLockReason = accrual
            ? periodLockReason(accrual.date)
            : periodLockReason(target?.issueDate);
        if (accrual?.isLocked || sourceLockReason) {
            toast({
                variant:'destructive',
                title:'CxC oficializada',
                description: accrual?.isLocked
                    ? 'La causación pertenece a un período oficializado y es inalterable.'
                    : sourceLockReason
            });
            return;
        }

        const destructiveAuthorization = await requestDestructiveAuthorization({
            title: 'Eliminar cuenta por cobrar',
            subject: target.description || target.concept || target.contact || 'Cuenta por cobrar seleccionada',
            description: accrual
                ? 'Se eliminará la CxC y también su causación contable vinculada.'
                : 'Se eliminará la CxC seleccionada.',
        });
        if (!destructiveAuthorization?.sessionToken) return;

        try {
            const options = { destructiveAuthorization };
            if (accrual) {
                const transactionSaved = await saveTransactions(
                    (transactions || []).filter(t => t.id !== accrual.id),
                    options
                );
                if (transactionSaved === false) throw new Error('No se pudo retirar la causación contable vinculada.');
            }

            const receivableSaved = await saveReceivables(
                (receivables || []).filter(r => r.id !== id),
                options
            );
            if (receivableSaved === false) throw new Error('No se pudo eliminar la cuenta por cobrar.');

            if (target?.massIntentionId) {
                await saveMassIntentions((massIntentions || []).map(item =>
                    String(item.id) === String(target.massIntentionId) ? { ...item, receivableId: '' } : item
                ));
            }
            toast({ title: "Cuenta por cobrar eliminada", description: "La operación fue autorizada con Acceso Total y se retiró su causación contable." });
        } catch (error) {
            toast({ variant:'destructive', title:'Eliminación bloqueada', description:error?.message || 'No se pudo eliminar la cuenta por cobrar.' });
        } finally {
            await releaseDestructiveAuthorization(destructiveAuthorization);
        }
    };

    const handleMarkAsCollected = (paymentData) => {
        if (!canAdd) return;
        const { receivable, destination, amount: requestedAmount, paymentDate } = paymentData;
        const currentDate = paymentDate || format(new Date(), 'yyyy-MM-dd');
        const lockReason = periodLockReason(currentDate);
        if (lockReason) {
            toast({ variant:'destructive', title:'Período contable cerrado', description: lockReason });
            return;
        }

        const previousPaid = receivable?.paidAmount != null
            ? Number(receivable.paidAmount || 0)
            : (receivable?.payments || []).filter(p => !p.reversedAt).reduce((sum,p)=>sum+Number(p.amount||0),0);
        const remainingBefore = Math.max(0, Number(receivable?.amount || 0) - previousPaid);
        const paymentAmount = Number(requestedAmount == null || requestedAmount === '' ? remainingBefore : requestedAmount);
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > remainingBefore + 0.01) {
            toast({ variant:'destructive', title:'Monto inválido', description:'El cobro debe ser mayor a cero y no puede superar el saldo pendiente.' });
            return;
        }

        const liquidity = resolveLiquidityAccount(destination, { bankAccounts, cashAccounts });
        if (!liquidity?.code) {
            toast({ variant:'destructive', title:'Destino inválido', description:'No se pudo resolver la cuenta de Caja/Banco seleccionada.' });
            return;
        }
        const ar = receivableAccount();
        const voucherNumber = getNextVoucherNumber('income', currentDate);
        const receiptId = `txn-ar-collection-${receivable.id}-${Date.now()}`;
        const receipt = {
            id: receiptId,
            type: 'income',
            voucherPrefix: 'I',
            date: currentDate,
            description: `Cobro CxC: ${receivable.description}`,
            amount: paymentAmount,
            category: ar.name,
            contactId: receivable.contactId || '',
            contact: receivable.contact || receivable.customer || '',
            massIntentionId: receivable.massIntentionId || '',
            destination,
            debitAccount: { code: liquidity.code, name: liquidity.name },
            creditAccount: ar,
            isReceivableCollection: true,
            receivableId: receivable.id,
            voucherNumber,
            company_id: activeCompany?.id,
            companyId: activeCompany?.id
        };

        const newPaid = previousPaid + paymentAmount;
        const balance = Math.max(0, Number(receivable.amount || 0) - newPaid);
        const newStatus = balance <= 0.01 ? 'Cobrado' : 'Parcial';
        const paymentRecord = { id: receiptId, date: currentDate, amount: paymentAmount, destination, voucherNumber };

        saveTransactions([...(transactions || []), receipt]);
        saveReceivables((receivables || []).map(r => r.id === receivable.id ? {
            ...r,
            status: newStatus,
            paidAmount: newPaid,
            balance,
            payments: [...(r.payments || []), paymentRecord],
            collectedAt: newStatus === 'Cobrado' ? currentDate : r.collectedAt,
        } : r));

        toast({ title: newStatus === 'Cobrado' ? "Cuenta cobrada" : "Abono oficial registrado", description: `Comprobante I-${String(voucherNumber).padStart(4, '0')} · Saldo $${balance.toLocaleString('es-CO')}.` });
        setPaymentDialogOpen(false);
    };

    const handleSaveTracking = (receivableId, newPayment) => {
        if (!canAdd) return;
        const updatedReceivables = receivables.map(r => {
            if (r.id === receivableId) {
                const currentPayments = r.internalPayments || [];
                return { ...r, internalPayments: [...currentPayments, newPayment] };
            }
            return r;
        });
        
        saveReceivables(updatedReceivables);

        const updatedItem = updatedReceivables.find(r => r.id === receivableId);
        setReceivableForTracking(updatedItem);

        const totalPaid = (updatedItem.internalPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const remaining = parseFloat(updatedItem.amount) - totalPaid;

        if (remaining <= 0) {
            setTrackingDialogOpen(false);
            setReceivableToPay(updatedItem);
            setTimeout(() => {
                setPaymentDialogOpen(true);
                toast({ title: "¡Saldo Cubierto!", description: "El saldo interno llegó a cero. Procede a confirmar el cobro oficial." });
            }, 300);
        } else {
             toast({ title: "Abono registrado", description: "Se ha actualizado la hoja de apuntes interna." });
        }
    };

    const handlePrintToPdf = async () => {
        if (!voucherRef.current || isPrinting) return;
    
        setIsPrinting(true);
        toast({ title: "Generando PDF...", description: "Por favor espera un momento." });
    
        try {
          const canvas = await html2canvas(voucherRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
          });
          
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
          });
          
          const imgWidth = 210;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

          if (isNativeApp()) {
            await shareJsPdf(
              pdf,
              `Hoja_Apuntes_Cuenta_por_Cobrar_${itemToPrint?.id || 'registro'}.pdf`,
              'Hoja de Apuntes - Cuenta por Cobrar'
            );
          } else {
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
          }
          
        } catch (error) {
          console.error("Error generating PDF:", error);
          toast({
            variant: "destructive",
            title: "Error al generar PDF",
            description: "Ocurrió un problema al crear el archivo PDF.",
          });
        } finally {
          setIsPrinting(false);
          setPrintDialogOpen(false);
        }
    };

    const openPrintPreview = (item) => {
        setItemToPrint(item);
        setPrintDialogOpen(true);
    };

    const handleExport = () => {
        if(filteredReceivables.length === 0) {
            toast({ variant: 'destructive', title: "No hay datos para exportar"});
            return;
        }
        exportToExcel(filteredReceivables.map(r => ({
            'Cliente': r.customer, 'Descripción': r.description, 'Fecha Emisión': r.issueDate, 'Fecha Vencimiento': r.dueDate, 'Monto': r.amount, 'Estado': r.status
        })), `Cuentas_Por_Cobrar`);
    };

    const filteredReceivables = (receivables || []).filter(r => {
        const search = searchTerm.toLowerCase();
        return String(r.customer || '').toLowerCase().includes(search) ||
            String(r.contact || '').toLowerCase().includes(search) ||
            String(r.description || '').toLowerCase().includes(search);
    }).sort((a, b) => accountingDateValue(a.dueDate) - accountingDateValue(b.dueDate));

    const ledgerStats = useMemo(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return (receivables || []).reduce((stats, item) => {
            const paid = item.paidAmount != null
                ? Number(item.paidAmount || 0)
                : (item.payments || []).filter(p => !p.reversedAt).reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const balance = Math.max(0, Number(item.amount || 0) - paid);
            if (!['Cobrado', 'Anulada'].includes(item.status)) stats.outstanding += balance;
            if (['Pendiente', 'Parcial'].includes(item.status) && item.dueDate && item.dueDate < today) stats.overdue += 1;
            if (item.status === 'Parcial') stats.partial += 1;
            if (item.massIntentionId) stats.massLinked += 1;
            return stats;
        }, { outstanding: 0, overdue: 0, partial: 0, massLinked: 0 });
    }, [receivables]);

    return (
        <>
        <Helmet><title>Cuentas por Cobrar - JaiderHerTur26</title></Helmet>
        <div className="space-y-5 sm:space-y-6">
            <AccountsLedgerHeader
                kind="receivable"
                activeCompany={activeCompany}
                isReadOnly={isReadOnly}
                isConsolidatedReadOnly={isConsolidatedReadOnly}
                canAdd={canAdd}
                stats={ledgerStats}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onNew={() => { setEditingReceivable(null); setDialogOpen(true); }}
                onExport={handleExport}
            />

            {filteredReceivables.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                    <DollarSign className="mx-auto mb-4 h-14 w-14 text-slate-300" />
                    <p className="font-semibold text-slate-700">No hay cuentas por cobrar en esta búsqueda.</p>
                    <p className="mt-1 text-sm text-slate-400">La cartera aparecerá aquí cuando registres una nueva cuenta.</p>
                </motion.div>
            ) : (
                <>
                    <div className="space-y-3 md:hidden">
                        {filteredReceivables.map(r => {
                            const paid = r.paidAmount != null ? Number(r.paidAmount || 0) : (r.payments || []).filter(p=>!p.reversedAt).reduce((sum,p)=>sum+Number(p.amount||0),0);
                            const balance = Math.max(0, Number(r.amount || 0) - paid);
                            const overdue = ['Pendiente','Parcial'].includes(r.status) && r.dueDate && r.dueDate < format(new Date(), 'yyyy-MM-dd');
                            return (
                                <article key={r.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${overdue ? 'border-l-4 border-l-amber-500' : 'border-slate-200'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-slate-950">{r.customer || r.contact || 'Sin cliente'}</span>
                                                {r.massIntentionId && <span className="rounded-full bg-[#f3ede5] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#6f5438]">Intención de Misa</span>}
                                            </div>
                                            <p className="mt-1 text-sm leading-5 text-slate-600">{r.description}</p>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${r.status === 'Cobrado' ? 'bg-emerald-50 text-emerald-700' : r.status === 'Parcial' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{r.status}</span>
                                    </div>
                                    <div className="mt-4 grid grid-cols-3 gap-2">
                                        <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Vence</p><p className="mt-1 text-xs font-bold text-slate-700">{format(parseAccountingDate(r.dueDate), 'dd/MM/yyyy', { locale: es })}</p></div>
                                        <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Original</p><p className="mt-1 whitespace-nowrap font-mono text-[11px] font-bold text-slate-800">${Number(r.amount||0).toLocaleString('es-CO')}</p></div>
                                        <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Saldo</p><p className="mt-1 whitespace-nowrap font-mono text-[11px] font-black text-emerald-800">${balance.toLocaleString('es-CO')}</p></div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                                        {['Pendiente','Parcial'].includes(r.status) && <Button variant="outline" className="rounded-xl" onClick={()=>{setReceivableForTracking(r);setTrackingDialogOpen(true)}}><ClipboardList className="mr-2 h-4 w-4"/>Apuntes</Button>}
                                        {['Pendiente','Parcial'].includes(r.status) && canAdd && <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={()=>{setReceivableToPay(r);setPaymentDialogOpen(true)}}><CheckCircle className="mr-2 h-4 w-4"/>Cobrar</Button>}
                                        {canEdit && <Button variant="outline" className="rounded-xl" onClick={()=>{setEditingReceivable(r);setDialogOpen(true)}}><Edit2 className="mr-2 h-4 w-4"/>Editar</Button>}
                                        {canDelete && <Button variant="outline" className="rounded-xl border-rose-200 text-rose-700" onClick={()=>handleDeleteReceivable(r.id)}><Trash2 className="mr-2 h-4 w-4"/>Eliminar</Button>}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
                        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
                            <thead className="bg-slate-950 text-slate-200"><tr>{['Cliente / Contacto','Descripción','Vencimiento','Monto / Saldo','Estado','Acciones'].map(h=><th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr></thead>
                            <tbody className="divide-y divide-slate-100">{filteredReceivables.map(r=>{
                                const paid=r.paidAmount!=null?Number(r.paidAmount||0):(r.payments||[]).filter(p=>!p.reversedAt).reduce((s,p)=>s+Number(p.amount||0),0);
                                const balance=Math.max(0,Number(r.amount||0)-paid);
                                return <tr key={r.id} className="transition-colors hover:bg-emerald-50/30">
                                    <td className="p-3"><div className="font-bold text-slate-900">{r.customer}</div>{r.massIntentionId&&<div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#8b6f4e]">Intención de Misa</div>}</td>
                                    <td className="p-3 text-slate-600">{r.description}</td>
                                    <td className="p-3 whitespace-nowrap">{format(parseAccountingDate(r.dueDate),'dd/MM/yyyy',{locale:es})}</td>
                                    <td className="p-3"><div className="font-mono font-bold">${Number(r.amount||0).toLocaleString('es-CO')}</div><div className="text-[11px] text-emerald-700">Saldo: ${balance.toLocaleString('es-CO')}</div></td>
                                    <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.status==='Cobrado'?'bg-emerald-100 text-emerald-800':r.status==='Parcial'?'bg-blue-100 text-blue-800':'bg-amber-100 text-amber-800'}`}>{r.status}</span></td>
                                    <td className="p-3"><div className="flex gap-1">{['Pendiente','Parcial'].includes(r.status)&&<Button size="icon" variant="ghost" onClick={()=>{setReceivableForTracking(r);setTrackingDialogOpen(true)}}><ClipboardList className="h-4 w-4"/></Button>}{['Pendiente','Parcial'].includes(r.status)&&canAdd&&<Button size="icon" variant="ghost" className="text-emerald-700" onClick={()=>{setReceivableToPay(r);setPaymentDialogOpen(true)}}><CheckCircle className="h-4 w-4"/></Button>}{canEdit&&<Button size="icon" variant="ghost" onClick={()=>{setEditingReceivable(r);setDialogOpen(true)}}><Edit2 className="h-4 w-4"/></Button>}{canDelete&&<Button size="icon" variant="ghost" className="text-rose-600" onClick={()=>handleDeleteReceivable(r.id)}><Trash2 className="h-4 w-4"/></Button>}</div></td>
                                </tr>
                            })}</tbody>
                        </table></div>
                    </div>
                </>
            )}
        </div>
        <ReceivableDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveReceivable} receivable={editingReceivable} accounts={accounts} contacts={contacts} />
        <PaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} onSave={handleMarkAsCollected} receivable={receivableToPay} bankAccounts={bankAccounts} cashAccounts={cashAccounts} />
        <TrackingSheetDialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen} onSave={handleSaveTracking} receivable={receivableForTracking} type="receivable" onPrint={openPrintPreview} canAdd={canAdd} />
        
        <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
            <DialogContent className="max-w-4xl p-0 max-h-[90vh] overflow-y-auto">
              <div className="p-4 bg-slate-50 border-b flex justify-between items-center sticky top-0 z-10">
                <DialogHeader>
                    <DialogTitle>Vista Previa de Hoja de Apuntes</DialogTitle>
                    <DialogDescription>Genera un PDF con el historial de abonos.</DialogDescription>
                </DialogHeader>
                <Button onClick={handlePrintToPdf} disabled={isPrinting}>
                  {isPrinting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</> : <><Printer className="mr-2 h-4 w-4" /> {isNativeApp() ? 'Compartir PDF' : 'Descargar PDF'}</>}
                </Button>
              </div>
               <div className="p-8 bg-gray-200 flex justify-center">
                 <TrackingSheetVoucher ref={voucherRef} item={itemToPrint} type="receivable" />
               </div>
            </DialogContent>
        </Dialog>
        </>
    );
};

const TrackingSheetDialog = ({ open, onOpenChange, onSave, receivable, type, onPrint, canAdd }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [note, setNote] = useState('');
    const { toast } = useToast();

    const internalPayments = receivable?.internalPayments || [];
    const totalAmount = parseFloat(receivable?.amount || 0);
    const totalPaid = internalPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const remaining = totalAmount - totalPaid;

    useEffect(() => {
        if (open) {
            setAmount('');
            setNote('');
            setDate(format(new Date(), 'yyyy-MM-dd'));
        }
    }, [open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const val = parseFloat(amount);
        if (val <= 0) {
            toast({ variant: 'destructive', title: 'Monto inválido', description: 'El abono debe ser mayor a 0.' });
            return;
        }
        if (val > remaining) {
             toast({ variant: 'destructive', title: 'Monto excesivo', description: 'El abono no puede superar el saldo pendiente.' });
             return;
        }

        onSave(receivable.id, {
            id: Date.now().toString(),
            date,
            amount: val,
            note
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader className="flex flex-row justify-between items-center pr-8">
                    <DialogTitle>Hoja de Apuntes - {type === 'receivable' ? 'Cuentas por Cobrar' : 'Cuentas por Pagar'}</DialogTitle>
                     {onPrint && (
                        <Button variant="outline" size="sm" onClick={() => onPrint(receivable)} className="ml-auto">
                            <Printer className="w-4 h-4 mr-2"/> Imprimir Comprobante
                        </Button>
                    )}
                </DialogHeader>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
                    <div className="md:col-span-1 space-y-4 border-r pr-4">
                        <div className="p-4 bg-slate-50 rounded-lg border">
                            <p className="text-sm text-slate-500">Saldo Inicial</p>
                            <p className="text-xl font-bold text-slate-900">${totalAmount.toLocaleString('es-ES')}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <p className="text-sm text-blue-600">Total Abonado</p>
                            <p className="text-xl font-bold text-blue-700">${totalPaid.toLocaleString('es-ES')}</p>
                        </div>
                         <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                            <p className="text-sm text-green-600">Saldo Pendiente</p>
                            <p className="text-xl font-bold text-green-700">${remaining.toLocaleString('es-ES')}</p>
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                        <div className="space-y-4">
                            <h3 className="font-semibold text-slate-900">Historial de Abonos</h3>
                            {internalPayments.length === 0 ? (
                                <p className="text-sm text-slate-500 italic">No hay abonos registrados.</p>
                            ) : (
                                <div className="max-h-[200px] overflow-y-auto space-y-2">
                                    {internalPayments.map((payment) => (
                                        <div key={payment.id} className="flex justify-between items-center p-2 bg-white border rounded text-sm">
                                            <div>
                                                <span className="font-medium">{format(parseAccountingDate(payment.date), 'dd/MM/yyyy', { locale: es })}</span>
                                                {payment.note && <span className="text-slate-500 ml-2">- {payment.note}</span>}
                                            </div>
                                            <span className="font-mono font-semibold">${parseFloat(payment.amount).toLocaleString('es-ES')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {canAdd ? (
                        <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t">
                            <h3 className="font-semibold text-slate-900">Registrar Nuevo Abono</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label>Fecha</Label>
                                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Monto</Label>
                                    <input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label>Nota (Opcional)</Label>
                                <input type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="Detalle del abono..." />
                            </div>
                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={remaining <= 0}>
                                <Plus className="w-4 h-4 mr-2" /> Registrar Abono
                            </Button>
                        </form>
                        ) : (
                            <div className="pt-4 border-t text-center text-slate-500 italic text-sm">
                                <Lock className="w-4 h-4 inline mr-1"/>
                                El registro de nuevos abonos está deshabilitado en modo lectura.
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};


const ReceivableDialog = ({ open, onOpenChange, onSave, receivable, accounts, contacts }) => {
    const defaultData = { customer: '', contactId: '', massIntentionId: '', description: '', issueDate: format(new Date(), 'yyyy-MM-dd'), dueDate: '', amount: '', linkedAccount: '' };
    const [data, setData] = useState(defaultData);
    const { toast } = useToast();

    useEffect(() => {
        if (!open) return;
        setData(receivable ? { ...defaultData, ...receivable } : defaultData);
    }, [receivable, open]);

    const incomeAccounts = Array.isArray(accounts)
        ? accounts.filter(a => a && a.number && String(a.number).startsWith('4')).sort((a,b) => (a.name || '').localeCompare(b.name || ''))
        : [];

    const handleContactChange = contactId => {
        const contact = (contacts || []).find(c => String(c.id) === String(contactId));
        setData(prev => ({ ...prev, contactId, customer: contact?.name || prev.customer }));
    };

    const handleSubmit = e => {
        e.preventDefault();
        if (!data.linkedAccount) {
            toast({ variant:'destructive', title:'Campo requerido', description:'Debes seleccionar la cuenta de ingreso contrapartida.' });
            return;
        }
        onSave({ ...data, isNew: !receivable });
    };

    const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-100/60';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-600">Cartera</p>
                    <DialogTitle>{receivable ? 'Editar' : 'Nueva'} Cuenta por Cobrar</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
                    <div className="md:col-span-2 space-y-1.5"><Label>Contacto</Label><ContactSelector contacts={contacts || []} value={data.contactId || ''} onChange={handleContactChange} placeholder="Seleccionar contacto..." /></div>
                    <div className="md:col-span-2 space-y-1.5"><Label>Cliente</Label><input required value={data.customer} onChange={e=>setData({...data,customer:e.target.value})} className={inputClass}/></div>
                    <div className="md:col-span-2 space-y-1.5"><Label>Descripción</Label><input required value={data.description} onChange={e=>setData({...data,description:e.target.value})} className={inputClass}/></div>
                    <div className="space-y-1.5"><Label>Fecha de Emisión</Label><input type="date" required value={data.issueDate} onChange={e=>setData({...data,issueDate:e.target.value})} className={inputClass}/></div>
                    <div className="space-y-1.5"><Label>Fecha de Vencimiento</Label><input type="date" required value={data.dueDate} onChange={e=>setData({...data,dueDate:e.target.value})} className={inputClass}/></div>
                    <div className="space-y-1.5"><Label>Monto</Label><input type="number" step="0.01" min="0.01" required value={data.amount} onChange={e=>setData({...data,amount:e.target.value})} className={inputClass}/></div>
                    <div className="space-y-1.5"><Label>Contrapartida (Cuenta de Ingreso)</Label><AccountSelector accounts={incomeAccounts} value={data.linkedAccount} onChange={value=>setData({...data,linkedAccount:value})} placeholder="Seleccionar Ingreso"/></div>
                    <div className="md:col-span-2 grid grid-cols-2 gap-2 pt-3"><DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancelar</Button></DialogClose><Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700">Guardar cuenta</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const PaymentDialog = ({ open, onOpenChange, onSave, receivable, bankAccounts, cashAccounts }) => {
    const [destination, setDestination] = useState('caja_principal|CAJA PRINCIPAL');
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const previousPaid = receivable?.paidAmount != null
        ? Number(receivable.paidAmount || 0)
        : (receivable?.payments || []).filter(p=>!p.reversedAt).reduce((sum,p)=>sum+Number(p.amount||0),0);
    const remaining = Math.max(0, Number(receivable?.amount || 0) - previousPaid);

    useEffect(() => {
        if (open) {
            setDestination('caja_principal|CAJA PRINCIPAL');
            setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
            const paid = receivable?.paidAmount != null
                ? Number(receivable.paidAmount || 0)
                : (receivable?.payments || []).filter(p=>!p.reversedAt).reduce((sum,p)=>sum+Number(p.amount||0),0);
            setAmount(String(Math.max(0, Number(receivable?.amount || 0) - paid)));
        }
    }, [open, receivable]);
    
    const handleSave = () => {
        onSave({ receivable, destination, amount: Number(amount), paymentDate });
    };

    const options = liquidityEndpointOptions({ bankAccounts, cashAccounts });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Registrar Cobro de Cuenta por Cobrar</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="bg-slate-50 border rounded-lg p-3 text-sm">
                        <div className="flex justify-between"><span>Cliente</span><strong>{receivable?.customer}</strong></div>
                        <div className="flex justify-between mt-1"><span>Valor original</span><strong>${Number(receivable?.amount || 0).toLocaleString('es-CO')}</strong></div>
                        <div className="flex justify-between mt-1"><span>Cobrado</span><strong className="text-green-700">${previousPaid.toLocaleString('es-CO')}</strong></div>
                        <div className="flex justify-between mt-1"><span>Saldo pendiente</span><strong className="text-amber-700">${remaining.toLocaleString('es-CO')}</strong></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1"><Label>Fecha del cobro</Label><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} className="w-full p-2 border rounded-lg"/></div>
                        <div className="space-y-1"><Label>Monto a cobrar</Label><input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full p-2 border rounded-lg"/></div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="destination">¿Dónde se recibió el dinero?</Label>
                        <select id="destination" value={destination} onChange={e => setDestination(e.target.value)} className="w-full p-2 border rounded-lg">
                            {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                    <Button onClick={handleSave} disabled={Number(amount)<=0||Number(amount)>remaining} className="bg-green-600 hover:bg-green-700">{Number(amount)<remaining ? 'Registrar Abono' : 'Confirmar Cobro'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AccountsReceivable;