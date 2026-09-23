import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Printer, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Heart, Activity, Trash2, Edit2, Loader2, BookOpen, Wallet, Search, ChevronDown, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import { format, parseISO, addDays, subDays, addMonths, subMonths, addYears, subYears, isSameDay, isSameMonth, isSameYear, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { resolveLiquidityAccount } from '@/lib/liquidityAccounts';
import ContactSelector from '@/components/transactions/ContactSelector';

const MassIntentions = () => {
    const { activeCompany } = useCompany();
    const { canEdit, canDelete, canAdd } = usePermission();
    const { toast } = useToast();

    const [intentions, saveIntentions] = useCompanyData('mass_intentions');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [contacts] = useCompanyData('contacts');
    const [cashAccounts] = useCompanyData('cash_accounts');
    const [bankAccounts] = useCompanyData('bankAccounts');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');

    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('day'); // 'day', 'month', 'year'

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingIntention, setEditingIntention] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);
    
    const printRef = useRef(null);

    // Navegación de fechas
    const handlePrev = () => {
        if (viewMode === 'day') setCurrentDate(subDays(currentDate, 1));
        if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
        if (viewMode === 'year') setCurrentDate(subYears(currentDate, 1));
    };

    const handleNext = () => {
        if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1));
        if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
        if (viewMode === 'year') setCurrentDate(addYears(currentDate, 1));
    };

    const getDisplayDate = () => {
        if (viewMode === 'day') return format(currentDate, "d 'de' MMMM 'de' yyyy", { locale: es });
        if (viewMode === 'month') return format(currentDate, "MMMM 'de' yyyy", { locale: es });
        if (viewMode === 'year') return format(currentDate, "yyyy", { locale: es });
    };

    // FORMATEADOR INTELIGENTE DE FECHA/HORA
    const formatDateTimeString = (dateStr, timeStr) => {
        let timeFormatted = '';
        if (timeStr) {
            const [h, m] = timeStr.split(':');
            let hour = parseInt(h);
            const ampm = hour >= 12 ? 'p.m.' : 'a.m.';
            hour = hour % 12 || 12;
            timeFormatted = `${hour}:${m} ${ampm}`;
        }
        if (viewMode === 'day') return timeFormatted;
        if (dateStr && isValid(parseISO(dateStr))) {
            const dateFormatted = format(parseISO(dateStr), "dd MMM", { locale: es });
            return `${dateFormatted} | ${timeFormatted}`;
        }
        return timeFormatted;
    };

    // Filtrar Intenciones según la vista actual
    const filteredIntentions = useMemo(() => {
        if (!intentions) return [];
        return intentions.filter(i => {
            const iDate = parseISO(i.date);
            if (!isValid(iDate)) return false;
            if (viewMode === 'day') return isSameDay(iDate, currentDate);
            if (viewMode === 'month') return isSameMonth(iDate, currentDate);
            if (viewMode === 'year') return isSameYear(iDate, currentDate);
            return false;
        }).sort((a, b) => {
            const dateA = a.date || '0000-00-00';
            const dateB = b.date || '0000-00-00';
            if (dateA !== dateB) return dateA.localeCompare(dateB);

            const timeA = a.time || '00:00';
            const timeB = b.time || '00:00';
            if (timeA !== timeB) return timeA.localeCompare(timeB);

            return (a.name || '').localeCompare(b.name || '');
        });
    }, [intentions, currentDate, viewMode]);

    // AGRUPACIÓN PARA EL MENÚ LATERAL
    const grouped = useMemo(() => {
        return {
            difuntos: filteredIntentions.filter(i => i.type === 'difunto'),
            gracias: filteredIntentions.filter(i => i.type === 'gracias'),
            salud: filteredIntentions.filter(i => i.type === 'salud'),
            otras: filteredIntentions.filter(i => i.type === 'otra' || !i.type)
        };
    }, [filteredIntentions]);

    // NUEVA AGRUPACIÓN INTELIGENTE PARA EL PDF (Agrupa por Misas = Fecha + Hora)
    const printGroups = useMemo(() => {
        const groups = {};
        filteredIntentions.forEach(i => {
            const dateStr = i.date || '1970-01-01';
            const timeStr = i.time || '00:00';
            const key = viewMode === 'day' ? timeStr : `${dateStr}|${timeStr}`;
            
            if (!groups[key]) {
                groups[key] = {
                    date: dateStr,
                    time: timeStr,
                    difuntos: [],
                    gracias: [],
                    salud: [],
                    otras: [],
                    totalAmount: 0
                };
            }
            groups[key].totalAmount += (parseFloat(i.amount) || 0);
            
            const t = i.type || 'otra';
            if (t === 'difunto') groups[key].difuntos.push(i);
            else if (t === 'gracias') groups[key].gracias.push(i);
            else if (t === 'salud') groups[key].salud.push(i);
            else groups[key].otras.push(i);
        });

        return Object.values(groups).sort((a, b) => {
            if (viewMode !== 'day' && a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        });
    }, [filteredIntentions, viewMode]);

    const grandTotalControl = printGroups.reduce((sum, g) => sum + g.totalAmount, 0);

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const getNextVoucherNumber = (dateStr) => {
        if (!transactions || transactions.length === 0) return 1;
        const year = (typeof dateStr === 'string' && dateStr.includes('-')) ? dateStr.split('-')[0] : new Date(dateStr).getFullYear().toString();
        const typeTransactions = transactions.filter(t => {
            const tYear = (typeof t.date === 'string' && t.date.includes('-')) ? t.date.split('-')[0] : new Date(t.date).getFullYear().toString();
            return (t.voucherPrefix === 'I' || t.type === 'income') && tYear === year;
        });
        return typeTransactions.reduce((max, t) => (parseInt(t.voucherNumber, 10) > max ? parseInt(t.voucherNumber, 10) : max), 0) + 1;
    };

    const handleDelete = async (id) => {
        if (!canDelete) return toast({ variant: "destructive", title: "Acceso Denegado" });

        const intentionToDelete = (intentions || []).find(i => i.id === id);
        if (!intentionToDelete) return;

        const linkedTransaction = intentionToDelete.transactionId
            ? (transactions || []).find(t => String(t.id) === String(intentionToDelete.transactionId))
            : null;

        if (linkedTransaction) {
            const lockReason = linkedTransaction.isLocked
                ? 'El comprobante de esta ofrenda ya fue oficializado y es inalterable.'
                : periodLockReason(linkedTransaction.date);

            if (lockReason) {
                toast({
                    variant: 'destructive',
                    title: 'Intención protegida por cierre contable',
                    description: lockReason
                });
                return;
            }
        }

        if (!window.confirm("¿Seguro que deseas eliminar esta intención?")) return;

        try {
            if (linkedTransaction) {
                await saveTransactions((transactions || []).filter(t => String(t.id) !== String(linkedTransaction.id)));
            }
            await saveIntentions((intentions || []).filter(i => i.id !== id));
            toast({ title: "Intención eliminada exitosamente" });
        } catch (error) {
            console.error('No fue posible eliminar la intención:', error);
            toast({
                variant: 'destructive',
                title: 'No se pudo eliminar',
                description: error?.message || 'La intención o su comprobante están protegidos.'
            });
        }
    };

    const handleSaveIntention = async (data) => {
        if (!editingIntention && !canAdd) return;
        if (editingIntention && !canEdit) {
            toast({ variant: 'destructive', title: 'Acceso denegado', description: 'Tu perfil no tiene permiso para editar intenciones.' });
            return;
        }

        const amountNum = Number(data.amount || 0);
        if (!Number.isFinite(amountNum) || amountNum < 0) {
            toast({ variant: 'destructive', title: 'Ofrenda inválida', description: 'La ofrenda debe ser un valor numérico igual o mayor que cero.' });
            return;
        }
        if (amountNum > 0 && (!data.destination || !data.category)) {
            toast({ variant: 'destructive', title: 'Datos contables incompletos', description: 'Selecciona la clasificación PUC y la cuenta destino antes de guardar la ofrenda.' });
            return;
        }

        let updatedIntentions = [...(intentions || [])];
        let updatedTransactions = [...(transactions || [])];
        const now = Date.now().toString();
        const intentionId = editingIntention ? editingIntention.id : `int-${now}`;
        let transactionId = editingIntention ? editingIntention.transactionId : null;
        let linkedTransaction = transactionId
            ? updatedTransactions.find(t => String(t.id) === String(transactionId))
            : null;

        if (transactionId && !linkedTransaction) transactionId = null;

        if (linkedTransaction) {
            const sourceLockReason = linkedTransaction.isLocked
                ? 'El comprobante de esta ofrenda ya fue oficializado y es inalterable.'
                : periodLockReason(linkedTransaction.date);
            if (sourceLockReason) {
                toast({
                    variant: 'destructive',
                    title: 'Intención protegida por cierre contable',
                    description: sourceLockReason
                });
                return;
            }
        }

        const accountingDate = data.paymentDate || data.date;
        if (amountNum > 0 && accountingDate > format(new Date(), 'yyyy-MM-dd')) {
            toast({ variant: 'destructive', title: 'Fecha contable futura', description: 'La fecha de ingreso de la ofrenda no puede ser posterior a hoy.' });
            return;
        }
        if (amountNum > 0) {
            const targetLockReason = periodLockReason(accountingDate);
            if (targetLockReason) {
                toast({
                    variant: 'destructive',
                    title: 'Período contable cerrado',
                    description: targetLockReason
                });
                return;
            }
        }

        const typeLabels = { difunto: 'Difuntos', gracias: 'A. de Gracias', salud: 'Salud', otra: 'Otras Intenciones' };
        const descType = typeLabels[data.type] || 'Otras Intenciones';
        const cleanName = (data.name || '').replace(/^[+✝]\s*/, '').trim();
        const selectedContact = data.contactId
            ? (contacts || []).find(contact => String(contact.id) === String(data.contactId))
            : null;
        const contactName = selectedContact?.name || '';

        if (!cleanName) {
            toast({ variant: 'destructive', title: 'Nombre requerido', description: 'Indica por quién se ofrece la intención.' });
            return;
        }

        const incomeAccount = amountNum > 0
            ? (accounts || []).find(account =>
                (data.categoryAccountCode && String(account.number) === String(data.categoryAccountCode)) ||
                (!data.categoryAccountCode && account.name === data.category)
            )
            : null;
        const liquidityAccount = amountNum > 0
            ? resolveLiquidityAccount(data.destination, { bankAccounts, cashAccounts })
            : null;

        if (amountNum > 0 && (!incomeAccount || !String(incomeAccount.number || '').startsWith('4'))) {
            toast({ variant: 'destructive', title: 'Cuenta de ingreso inválida', description: 'La ofrenda debe clasificarse en una cuenta PUC de ingresos (clase 4).' });
            return;
        }
        if (amountNum > 0 && !liquidityAccount?.code) {
            toast({ variant: 'destructive', title: 'Cuenta destino inválida', description: 'La caja o banco seleccionado no tiene una cuenta contable válida.' });
            return;
        }

        if (amountNum > 0) {
            const financialDescription = `Intención Eucaristía (${descType}): ${cleanName}${data.offeredBy ? ` (Ofrece: ${data.offeredBy})` : ''}`;
            const previousYear = linkedTransaction ? String(linkedTransaction.date || '').slice(0, 4) : '';
            const targetYear = String(accountingDate || '').slice(0, 4);
            const voucherNumber = linkedTransaction && previousYear === targetYear
                ? linkedTransaction.voucherNumber
                : getNextVoucherNumber(accountingDate);

            const txData = {
                ...(linkedTransaction || {}),
                id: transactionId || `tx-int-${now}`,
                type: 'income',
                voucherPrefix: 'I',
                voucherNumber,
                date: accountingDate,
                description: financialDescription,
                amount: amountNum,
                category: incomeAccount.name,
                contactId: selectedContact?.id || '',
                contact: contactName,
                destination: data.destination,
                debitAccount: { code: String(liquidityAccount.code), name: liquidityAccount.name },
                creditAccount: { code: String(incomeAccount.number), name: incomeAccount.name },
                isInternalTransfer: false,
                sourceModule: 'mass_intentions',
                massIntentionId: intentionId,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            };

            if (linkedTransaction) {
                updatedTransactions = updatedTransactions.map(t => String(t.id) === String(linkedTransaction.id) ? txData : t);
            } else {
                transactionId = txData.id;
                updatedTransactions.push(txData);
            }
        } else if (linkedTransaction) {
            updatedTransactions = updatedTransactions.filter(t => String(t.id) !== String(linkedTransaction.id));
            transactionId = null;
        } else {
            transactionId = null;
        }

        const newIntention = {
            ...data,
            amount: amountNum,
            paymentDate: amountNum > 0 ? accountingDate : null,
            category: amountNum > 0 ? incomeAccount.name : data.category,
            categoryAccountCode: amountNum > 0 ? String(incomeAccount.number) : (data.categoryAccountCode || ''),
            contactId: selectedContact?.id || '',
            contact: contactName,
            name: cleanName,
            id: intentionId,
            transactionId
        };

        if (editingIntention) {
            updatedIntentions = updatedIntentions.map(i => i.id === editingIntention.id ? newIntention : i);
        } else {
            updatedIntentions.push(newIntention);
        }

        try {
            const transactionsChanged =
                Boolean(linkedTransaction) ||
                amountNum > 0 ||
                Boolean(editingIntention?.transactionId);

            if (transactionsChanged) {
                await saveTransactions(updatedTransactions);
            }
            await saveIntentions(updatedIntentions);

            const savedTransaction = transactionId
                ? updatedTransactions.find(t => String(t.id) === String(transactionId))
                : null;
            toast({
                title: editingIntention ? 'Intención actualizada' : 'Intención guardada',
                description: amountNum > 0
                    ? `Comprobante I-${String(savedTransaction?.voucherNumber || '').padStart(4, '0')} vinculado a la ofrenda.`
                    : 'Registro pastoral guardado sin movimiento contable.'
            });
            setDialogOpen(false);
            setEditingIntention(null);
        } catch (error) {
            console.error('No fue posible guardar la intención:', error);
            toast({
                variant: 'destructive',
                title: 'No se pudo guardar',
                description: error?.message || 'Revisa el período contable y los datos de la ofrenda.'
            });
        }
    };

    const handlePrintPdf = () => {
        if (!printRef.current) return;
        setIsPrinting(true);
        const printContent = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=800,height=900');
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => style.outerHTML).join('\n');

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
              <head>
                  <title>Intenciones_Misa_${format(currentDate, 'yyyyMMdd')}</title>
                  ${styles}
                  <style>
                      @media print {
                          @page { margin: 15mm; size: letter portrait; }
                          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-family: 'Times New Roman', serif; }
                          .print-shadow { box-shadow: none !important; border: none !important; }
                      }
                      .serif-font { font-family: 'Georgia', 'Times New Roman', serif; }
                      .leader-line { border-bottom: 2px dotted #94a3b8; flex-grow: 1; margin: 0 10px; position: relative; top: -6px; }
                      .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
                  </style>
              </head>
              <body class="bg-white">
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
        }, 500);
    };

    // COMPONENTE PARA RENDERIZAR CADA BLOQUE EN EL PDF
    const renderPrintCategory = (title, items, colorClass) => {
        if (!items || items.length === 0) return null;
        const prefix = title === 'DIFUNTOS' ? '✝ ' : '• ';
        const showAmount = viewMode !== 'day'; // Muestra precios solo en reportes
        
        return (
            <div className="mb-6 break-inside-avoid">
                <h3 className={`${colorClass} font-bold text-sm tracking-widest uppercase mb-3 border-b border-slate-200 pb-1`}>{title}</h3>
                <div className="space-y-2.5">
                    {items.map(i => {
                        const clName = (i.name || '').replace(/^[+✝]\s*/, '').trim();
                        return (
                            <div key={i.id} className="flex items-baseline text-[15px] text-[#222] serif-font">
                                <div className="bg-white pr-2 whitespace-nowrap">
                                    <span className="font-semibold">{prefix}{clName}</span>
                                    {i.offeredBy && <span className="text-[0.85em] italic text-[#555] font-normal ml-1.5">(Ofrece: {i.offeredBy})</span>}
                                </div>
                                <div className="leader-line"></div>
                                {showAmount && (
                                    <span className="bg-white pl-2 font-mono text-xs whitespace-nowrap font-bold text-slate-700">
                                        ${parseFloat(i.amount || 0).toLocaleString('es-CO')}
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };

    const IntentionItem = ({ intention, icon, iconColor }) => {
        const cleanName = (intention.name || '').replace(/^[+✝]\s*/, '').trim();
        const prefix = intention.type === 'difunto' ? '✝ ' : '';
        const linkedTransaction = intention.transactionId
            ? (transactions || []).find(t => String(t.id) === String(intention.transactionId))
            : null;
        const isAccountingProtected = Boolean(linkedTransaction && (linkedTransaction.isLocked || periodLockReason(linkedTransaction.date)));
        const voucherLabel = linkedTransaction?.voucherNumber
            ? `${linkedTransaction.voucherPrefix || 'I'}-${String(linkedTransaction.voucherNumber).padStart(4, '0')}`
            : '';

        return (
            <div className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`text-slate-400 shrink-0 mt-1 self-start ${iconColor}`}>{icon}</div>
                    <div className="truncate">
                        <p className="font-medium text-slate-800 truncate" title={`${prefix}${cleanName}`}>{prefix}{cleanName}</p>
                        {intention.offeredBy && <p className="text-[11px] text-slate-500 italic truncate" title={`Ofrece: ${intention.offeredBy}`}>Ofrece: {intention.offeredBy}</p>}
                        {intention.amount > 0 && <p className="text-[11px] text-slate-400 mt-0.5 truncate">Ofrenda: ${parseFloat(intention.amount).toLocaleString('es-CO')} | <span className="font-semibold">{intention.category}</span>{voucherLabel ? ` | Comp. ${voucherLabel}` : ''}</p>}
                        {isAccountingProtected && <p className="text-[10px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Protegida por cierre contable</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3 pl-2 shrink-0">
                    <span className="text-sm text-slate-500 font-mono">
                        {formatDateTimeString(intention.date, intention.time)}
                    </span>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && <Button disabled={isAccountingProtected} title={isAccountingProtected ? 'Protegida por cierre contable' : 'Editar intención'} variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50 disabled:text-slate-300" onClick={() => { setEditingIntention(intention); setDialogOpen(true); }}>
                            <Edit2 className="w-4 h-4" />
                        </Button>}
                        {canDelete && <Button disabled={isAccountingProtected} title={isAccountingProtected ? 'Protegida por cierre contable' : 'Eliminar intención'} variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 disabled:text-slate-300" onClick={() => handleDelete(intention.id)}>
                            <Trash2 className="w-4 h-4" />
                        </Button>}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Helmet><title>Libro Diario de Misa - {activeCompany?.name || 'Parroquia'}</title></Helmet>
            
            <div className="mx-auto max-w-[1520px] space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-600">Libro diario de misa</p>
                        <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">Intenciones</h1>
                        <p className="mt-2 max-w-2xl font-serif text-sm italic leading-6 text-slate-500">"La Eucaristía es fuente y cumbre de toda la vida cristiana." <span className="text-xs text-slate-400">(Lumen Gentium 11)</span></p>
                    </div>
                    <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                        <div className="bg-[#8b6f4e] text-white px-3 py-2 rounded-lg flex items-center font-semibold text-sm">
                            <BookOpen className="w-4 h-4 mr-2" />
                            {activeCompany?.name || 'Parroquia'}
                        </div>
                    </div>
                </div>

                <div className="hertur-surface grid grid-cols-1 gap-3 rounded-2xl p-3 lg:grid-cols-2">
                    <div className="flex w-fit max-w-full rounded-xl border border-slate-200/70 bg-slate-100/80 p-1">
                        <button onClick={() => setViewMode('day')} className={`px-6 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'day' ? 'bg-[#5c4a3d] text-white shadow-md' : 'text-slate-600 hover:bg-slate-200'}`}>Día</button>
                        <button onClick={() => setViewMode('month')} className={`px-6 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'month' ? 'bg-[#5c4a3d] text-white shadow-md' : 'text-slate-600 hover:bg-slate-200'}`}>Mes</button>
                        <button onClick={() => setViewMode('year')} className={`px-6 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'year' ? 'bg-[#5c4a3d] text-white shadow-md' : 'text-slate-600 hover:bg-slate-200'}`}>Año</button>
                    </div>

                    <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1 sm:w-auto lg:justify-self-end">
                        <Button variant="ghost" size="icon" onClick={handlePrev} className="hover:bg-white text-slate-600"><ChevronLeft className="w-5 h-5" /></Button>
                        <div className="px-4 py-1.5 font-bold text-slate-800 text-sm flex items-center min-w-[160px] justify-center">
                            <CalendarIcon className="w-4 h-4 mr-2 text-[#8b6f4e]" />
                            {getDisplayDate()}
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleNext} className="hover:bg-white text-slate-600"><ChevronRight className="w-5 h-5" /></Button>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:col-span-2 lg:justify-end">
                        {canAdd && (
                            <Button onClick={() => { setEditingIntention(null); setDialogOpen(true); }} className="bg-[#5c4a3d] text-white shadow-sm hover:bg-[#4a3f35]">
                                <Plus className="w-4 h-4 mr-2" /> Nueva intención
                            </Button>
                        )}
                        <Button variant="outline" onClick={handlePrintPdf} disabled={isPrinting || filteredIntentions.length === 0} className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                            {isPrinting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                            Imprimir / PDF
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 space-y-6">
                        
                        <div className="bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
                            <div className="bg-purple-50/50 p-4 border-b border-purple-100 flex items-center gap-3">
                                <div className="bg-purple-600 text-white p-2 rounded-lg shadow-sm"><Plus className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-bold text-purple-900 tracking-wide">DIFUNTOS</h3>
                                    <p className="text-xs font-semibold text-purple-600">{grouped.difuntos.length} intenciones</p>
                                </div>
                            </div>
                            <div className="p-2">
                                {grouped.difuntos.length > 0 ? grouped.difuntos.map(i => <IntentionItem key={i.id} intention={i} icon={<Plus className="w-4 h-4"/>} iconColor="text-purple-400" />) : <p className="p-4 text-center text-sm text-slate-400">No hay intenciones registradas.</p>}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
                            <div className="bg-emerald-50/50 p-4 border-b border-emerald-100 flex items-center gap-3">
                                <div className="bg-emerald-500 text-white p-2 rounded-lg shadow-sm"><Heart className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-bold text-emerald-900 tracking-wide">ACCIÓN DE GRACIAS</h3>
                                    <p className="text-xs font-semibold text-emerald-600">{grouped.gracias.length} intenciones</p>
                                </div>
                            </div>
                            <div className="p-2">
                                {grouped.gracias.length > 0 ? grouped.gracias.map(i => <IntentionItem key={i.id} intention={i} icon={<div className="w-2 h-2 rounded-full bg-emerald-400 mx-1"></div>} iconColor="text-emerald-400" />) : <p className="p-4 text-center text-sm text-slate-400">No hay intenciones registradas.</p>}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                            <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center gap-3">
                                <div className="bg-blue-500 text-white p-2 rounded-lg shadow-sm"><Activity className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-bold text-blue-900 tracking-wide">POR LA SALUD</h3>
                                    <p className="text-xs font-semibold text-blue-600">{grouped.salud.length} intenciones</p>
                                </div>
                            </div>
                            <div className="p-2">
                                {grouped.salud.length > 0 ? grouped.salud.map(i => <IntentionItem key={i.id} intention={i} icon={<div className="w-2 h-2 rounded-full bg-blue-400 mx-1"></div>} iconColor="text-blue-400" />) : <p className="p-4 text-center text-sm text-slate-400">No hay intenciones registradas.</p>}
                            </div>
                        </div>

                        {grouped.otras.length > 0 && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-slate-100 p-4 border-b border-slate-200 flex items-center gap-3">
                                    <div className="bg-slate-600 text-white p-2 rounded-lg shadow-sm"><BookOpen className="w-5 h-5" /></div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 tracking-wide">OTRAS INTENCIONES</h3>
                                        <p className="text-xs font-semibold text-slate-500">{grouped.otras.length} intenciones</p>
                                    </div>
                                </div>
                                <div className="p-2">
                                    {grouped.otras.map(i => <IntentionItem key={i.id} intention={i} icon={<div className="w-2 h-2 rounded-full bg-slate-400 mx-1"></div>} iconColor="text-slate-400" />)}
                                </div>
                            </div>
                        )}

                    </div>

                    <div className="lg:col-span-5 relative">
                        <div className="sticky top-6 bg-[#fdfbf7] p-6 rounded-2xl border border-[#e8e2d9] shadow-inner">
                            <h3 className="text-sm font-bold text-[#8b6f4e] mb-4 flex items-center uppercase tracking-widest"><Printer className="w-4 h-4 mr-2"/> Vista previa para impresión</h3>
                            
                            <div ref={printRef} className="bg-white p-8 md:p-10 shadow-xl print-shadow mx-auto relative" style={{ minHeight: '600px', width: '100%', maxWidth: '215.9mm' }}>
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02] z-0">
                                    <BookOpen style={{ width: '300px', height: '300px' }} />
                                </div>

                                <div className="relative z-10">
                                    {viewMode === 'day' ? (
                                        // VISTA DIARIA: PÁGINAS SEPARADAS POR HORA DE MISA (Sin Precios)
                                        printGroups.length === 0 ? (
                                            <div className="text-center py-10 text-gray-400 italic serif-font">No hay intenciones registradas para este día.</div>
                                        ) : (
                                            printGroups.map((group, idx) => {
                                                const timeFormatted = group.time ? format(parseISO(`2000-01-01T${group.time}`), 'h:mm a') : '';
                                                const dateFormatted = format(currentDate, "d 'de' MMMM 'de' yyyy", { locale: es });
                                                const isLastPage = idx === printGroups.length - 1;

                                                return (
                                                    <div key={idx} style={{ pageBreakAfter: isLastPage ? 'auto' : 'always' }} className={isLastPage ? '' : 'mb-20 print:mb-0'}>
                                                        <div className="text-center mb-8">
                                                            <h3 className="text-sm font-bold text-[#555] tracking-widest uppercase serif-font mb-4">
                                                                {activeCompany?.name || 'PARROQUIA MARÍA AUXILIO DE LOS CRISTIANOS'}
                                                            </h3>
                                                            <div className="flex justify-center mb-3">
                                                                <span className="text-4xl text-[#333] font-serif">✝</span>
                                                            </div>
                                                            <h1 className="text-xl md:text-2xl font-black tracking-widest text-[#222] uppercase serif-font mb-1">
                                                                INTENCIONES DE LA EUCARISTÍA
                                                            </h1>
                                                            <h2 className="text-lg font-bold text-[#444] serif-font capitalize">
                                                                {dateFormatted} - {timeFormatted}
                                                            </h2>
                                                            <div className="flex justify-center mt-3 opacity-50">
                                                                <span className="w-16 h-px bg-black block mx-2 mt-2"></span>
                                                                <span className="text-xs">❀</span>
                                                                <span className="w-16 h-px bg-black block mx-2 mt-2"></span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-6">
                                                            {renderPrintCategory('DIFUNTOS', group.difuntos, 'text-[#6b21a8]')}
                                                            {renderPrintCategory('ACCIÓN DE GRACIAS', group.gracias, 'text-[#059669]')}
                                                            {renderPrintCategory('POR LA SALUD', group.salud, 'text-[#2563eb]')}
                                                            {renderPrintCategory('OTRAS INTENCIONES', group.otras, 'text-[#475569]')}
                                                        </div>

                                                        <div className="mt-16 text-center border-t border-slate-200 pt-4 opacity-70">
                                                            <p className="text-xs italic serif-font text-slate-600">"Pedid y se os dará; buscad y hallaréis; llamad y se os abrirá." (Mt 7,7)</p>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )
                                    ) : (
                                        // VISTA MES/AÑO: LISTA CONTINUA (Con Precios y Totales)
                                        <>
                                            <div className="text-center mb-8">
                                                <h3 className="text-sm font-bold text-[#555] tracking-widest uppercase serif-font mb-4">
                                                    {activeCompany?.name || 'PARROQUIA MARÍA AUXILIO DE LOS CRISTIANOS'}
                                                </h3>
                                                <div className="flex justify-center mb-3">
                                                    <span className="text-4xl text-[#333] font-serif">✝</span>
                                                </div>
                                                <h1 className="text-xl md:text-2xl font-black tracking-widest text-[#222] uppercase serif-font mb-1">
                                                    REPORTE DE INTENCIONES
                                                </h1>
                                                <h2 className="text-lg font-bold text-[#444] serif-font capitalize">
                                                    {getDisplayDate()}
                                                </h2>
                                                <div className="mt-2 bg-slate-50 border border-slate-200 py-1.5 px-4 inline-block rounded-lg">
                                                    <span className="text-sm font-bold text-slate-700">TOTAL OFRENDAS ASOCIADAS: ${grandTotalControl.toLocaleString('es-CO')}</span>
                                                </div>
                                                <div className="flex justify-center mt-3 opacity-50">
                                                    <span className="w-16 h-px bg-black block mx-2 mt-2"></span>
                                                    <span className="text-xs">❀</span>
                                                    <span className="w-16 h-px bg-black block mx-2 mt-2"></span>
                                                </div>
                                            </div>

                                            {printGroups.length === 0 ? (
                                                <div className="text-center py-10 text-gray-400 italic serif-font">
                                                    No hay intenciones registradas para este periodo.
                                                </div>
                                            ) : (
                                                <div className="space-y-12">
                                                    {printGroups.map((group, idx) => {
                                                        const timeFormatted = group.time ? format(parseISO(`2000-01-01T${group.time}`), 'h:mm a') : '';
                                                        const dateFormatted = group.date ? format(parseISO(group.date), "dd MMM", { locale: es }) : '';
                                                        const groupTitle = `${dateFormatted.toUpperCase()} - ${timeFormatted}`;

                                                        return (
                                                            <div key={idx} className="break-inside-avoid">
                                                                <div className="text-center border-b-2 border-black pb-1 mb-4 bg-slate-50/50 p-2 rounded-t-lg">
                                                                    <h2 className="text-lg font-bold text-[#222] serif-font uppercase tracking-widest">{groupTitle}</h2>
                                                                    {group.totalAmount > 0 && (
                                                                        <p className="text-xs text-slate-500 font-mono mt-0.5 font-bold">Ofrendas Misa: ${group.totalAmount.toLocaleString('es-CO')}</p>
                                                                    )}
                                                                </div>

                                                                {renderPrintCategory('DIFUNTOS', group.difuntos, 'text-[#6b21a8]')}
                                                                {renderPrintCategory('ACCIÓN DE GRACIAS', group.gracias, 'text-[#059669]')}
                                                                {renderPrintCategory('POR LA SALUD', group.salud, 'text-[#2563eb]')}
                                                                {renderPrintCategory('OTRAS INTENCIONES', group.otras, 'text-[#475569]')}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            
                                            <div className="mt-16 text-center border-t border-slate-200 pt-4 opacity-70">
                                                <p className="text-xs italic serif-font text-slate-600">"Pedid y se os dará; buscad y hallaréis; llamad y se os abrirá." (Mt 7,7)</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <IntentionDialog 
                open={dialogOpen} 
                onOpenChange={setDialogOpen} 
                intention={editingIntention} 
                onSave={handleSaveIntention}
                accounts={accounts}
                contacts={contacts}
                cashAccounts={cashAccounts}
                bankAccounts={bankAccounts}
                currentDate={currentDate}
            />
        </>
    );
};

// COMPONENTE FORMULARIO DE INTENCIÓN
const IntentionDialog = ({ open, onOpenChange, intention, onSave, accounts, contacts, cashAccounts, bankAccounts, currentDate }) => {
    const { toast } = useToast();
    
    const [formData, setFormData] = useState({
        name: '',
        offeredBy: '',
        contactId: '',
        type: 'difunto',
        date: format(currentDate, 'yyyy-MM-dd'),
        time: '07:00',
        amount: '',
        paymentDate: format(new Date(), 'yyyy-MM-dd'),
        category: '',
        categoryAccountCode: '',
        destination: 'caja_principal|CAJA PRINCIPAL'
    });
    
    const [searchPuc, setSearchPuc] = useState('');
    const [isPucOpen, setIsPucOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const pucRef = useRef(null);

    const incomeAccounts = useMemo(() => {
        return (accounts || [])
            .filter(a => String(a.number).startsWith('4'))
            .sort((a, b) => String(a.number).localeCompare(String(b.number)));
    }, [accounts]);

    const filteredAccounts = useMemo(() => {
        return incomeAccounts.filter(acc => 
            acc.name.toLowerCase().includes(searchPuc.toLowerCase()) || 
            String(acc.number).includes(searchPuc)
        );
    }, [incomeAccounts, searchPuc]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (pucRef.current && !pucRef.current.contains(event.target)) {
                setIsPucOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (open) {
            if (intention) {
                setFormData({
                    ...intention,
                    contactId: intention.contactId || '',
                    paymentDate: intention.paymentDate || (intention.transactionId ? intention.date : format(new Date(), 'yyyy-MM-dd'))
                });
            } else {
                setFormData({
                    name: '',
                    offeredBy: '',
                    contactId: '',
                    type: 'difunto',
                    date: format(currentDate, 'yyyy-MM-dd'),
                    time: '07:00',
                    amount: '',
                    paymentDate: format(new Date(), 'yyyy-MM-dd'),
                    category: '',
                    categoryAccountCode: '',
                    destination: 'caja_principal|CAJA PRINCIPAL'
                });
            }
            setSearchPuc('');
            setIsPucOpen(false);
            setIsSaving(false);
        }
    }, [open, intention, currentDate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        if (!formData.name) return;
        
        if (parseFloat(formData.amount) > 0 && !formData.paymentDate) {
            toast({ variant: 'destructive', title: 'Falta fecha contable', description: 'Indica la fecha en que se recibió la ofrenda.' });
            return;
        }

        if (parseFloat(formData.amount) > 0 && !formData.category) {
            toast({ 
                variant: 'destructive', 
                title: "Falta Clasificación (PUC)", 
                description: "Debes seleccionar a qué tipo de misa pertenece esta ofrenda para la contabilidad." 
            });
            return;
        }

        setIsSaving(true);
        try {
            await onSave(formData);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent 
                className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto"
                onPointerDownOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#4a3f35] font-serif border-b pb-2">
                        {intention ? 'Editar Intención' : 'Registrar Nueva Intención'}
                    </DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    
                    <div className="space-y-1.5">
                        <Label className="text-slate-700 font-bold">Por quién se ofrece (Nombre)</Label>
                        <input 
                            required 
                            autoFocus
                            placeholder="Ej: José Miguel Castro Vega"
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8b6f4e] focus:border-[#8b6f4e] outline-none transition-all" 
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-slate-700 font-bold flex items-center gap-1">
                            Ofrecido por / Nota adicional <span className="text-[10px] font-normal text-slate-400">(Opcional)</span>
                        </Label>
                        <input 
                            placeholder="Ej: Su esposa e hijos, Familia Pérez..."
                            value={formData.offeredBy || ''} 
                            onChange={e => setFormData({...formData, offeredBy: e.target.value})} 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8b6f4e] focus:border-[#8b6f4e] outline-none transition-all" 
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-slate-700 font-bold flex items-center gap-1">
                            Contacto <span className="text-[10px] font-normal text-slate-400">(Opcional)</span>
                        </Label>
                        <p className="text-xs text-slate-500">Vincula la persona registrada en Contactos, igual que en una Transacción.</p>
                        <ContactSelector
                            contacts={contacts || []}
                            value={formData.contactId || ''}
                            onChange={val => setFormData(prev => ({ ...prev, contactId: val }))}
                            placeholder="Seleccionar contacto..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-slate-700 font-bold">Tipo de Intención</Label>
                            <Select value={formData.type} onValueChange={val => setFormData({...formData, type: val})}>
                                <SelectTrigger className="border-slate-300">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="difunto"><span className="text-purple-700 font-medium">✝ Difunto</span></SelectItem>
                                    <SelectItem value="gracias"><span className="text-emerald-700 font-medium">♥ Acción de Gracias</span></SelectItem>
                                    <SelectItem value="salud"><span className="text-blue-700 font-medium">✚ Por la Salud</span></SelectItem>
                                    <SelectItem value="otra"><span className="text-slate-700 font-medium">Otra Intención</span></SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-slate-700 font-bold">Fecha de la Misa</Label>
                            <input 
                                type="date" 
                                required 
                                value={formData.date} 
                                onChange={e => setFormData({...formData, date: e.target.value})} 
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8b6f4e]" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-slate-700 font-bold">Hora</Label>
                            <input 
                                type="time" 
                                required 
                                value={formData.time} 
                                onChange={e => setFormData({...formData, time: e.target.value})} 
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8b6f4e]" 
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-slate-700 font-bold">Ofrenda / Estipendio ($)</Label>
                            <input 
                                type="number" 
                                min="0"
                                step="1"
                                placeholder="Dejar vacío si es gratis"
                                value={formData.amount} 
                                onChange={e => setFormData({...formData, amount: e.target.value})} 
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8b6f4e]" 
                            />
                        </div>
                    </div>

                    {parseFloat(formData.amount) > 0 && (
                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                            <div className="space-y-1.5">
                                <Label className="text-amber-900 font-bold">Fecha de ingreso de la ofrenda</Label>
                                <p className="text-xs text-amber-700">Es la fecha contable del comprobante I; puede ser distinta de la fecha en que se celebrará la misa.</p>
                                <input
                                    type="date"
                                    required
                                    max={format(new Date(), 'yyyy-MM-dd')}
                                    value={formData.paymentDate || ''}
                                    onChange={e => setFormData({...formData, paymentDate: e.target.value})}
                                    className="w-full p-2 border border-amber-300 bg-white rounded-lg focus:ring-2 focus:ring-amber-500"
                                />
                            </div>

                            <div className="space-y-1.5" ref={pucRef}>
                                <Label className="text-blue-900 font-bold flex items-center gap-2">
                                    <BookOpen className="w-4 h-4"/> Clasificación del Ingreso (PUC)
                                </Label>
                                <p className="text-xs text-blue-700 mb-2">Selecciona a qué cuenta contable pertenece esta ofrenda.</p>
                                
                                <div className="relative">
                                    <div 
                                        onClick={() => setIsPucOpen(!isPucOpen)}
                                        className={`flex items-center justify-between w-full p-2.5 bg-white border rounded-lg cursor-pointer transition-colors ${!formData.category ? 'border-red-400 focus:ring-red-500' : 'border-blue-300'}`}
                                    >
                                        <span className={`text-sm truncate ${formData.category ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                                            {formData.category ? formData.category : 'Buscar y seleccionar tipo de misa...'}
                                        </span>
                                        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                    </div>

                                    <AnimatePresence>
                                        {isPucOpen && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -5 }}
                                                className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
                                            >
                                                <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                                                    <div className="relative">
                                                        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                                                        <input 
                                                            autoFocus
                                                            type="text"
                                                            placeholder="Buscar por número o nombre..."
                                                            value={searchPuc}
                                                            onChange={(e) => setSearchPuc(e.target.value)}
                                                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#8b6f4e]"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar bg-white">
                                                    {filteredAccounts.length > 0 ? (
                                                        filteredAccounts.map(acc => (
                                                            <div 
                                                                key={acc.id}
                                                                onClick={() => {
                                                                    setFormData({...formData, category: acc.name, categoryAccountCode: String(acc.number)});
                                                                    setIsPucOpen(false);
                                                                    setSearchPuc('');
                                                                }}
                                                                className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer rounded-md flex flex-col transition-colors border-b border-slate-50 last:border-0"
                                                            >
                                                                <span className="font-mono text-xs font-bold text-blue-600 mb-0.5">
                                                                    {acc.number}
                                                                </span>
                                                                <span className="text-sm font-medium text-slate-700 leading-tight">
                                                                    {acc.name}
                                                                </span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="p-4 text-center text-sm text-slate-500">
                                                            No se encontraron resultados
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="space-y-1.5 border-t border-slate-200 pt-4 mt-2">
                                <Label className="text-amber-900 font-bold flex items-center gap-2">
                                    <Wallet className="w-4 h-4"/> Cuenta Destino (Caja o Banco)
                                </Label>
                                <Select value={formData.destination} onValueChange={val => setFormData({...formData, destination: val})}>
                                    <SelectTrigger className="border-amber-300 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="caja_principal|CAJA PRINCIPAL">Caja Principal</SelectItem>
                                        {(cashAccounts || []).map(acc => (
                                            <SelectItem key={acc.id} value={`${acc.id}|${acc.name}`}>{acc.name} (Caja Menor)</SelectItem>
                                        ))}
                                        {(bankAccounts || []).map(acc => (
                                            <SelectItem key={acc.id} value={`${acc.id}|${acc.bankName}`}>{acc.bankName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                        </div>
                    )}

                    <DialogFooter className="pt-4 border-t border-slate-100 mt-6 pb-2">
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" disabled={isSaving} className="bg-[#5c4a3d] hover:bg-[#4a3f35] text-white shadow-sm disabled:opacity-60">{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{isSaving ? 'Guardando...' : 'Guardar Intención'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default MassIntentions;