import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Download, Edit2, Trash2, Search, CheckCircle, ClipboardList, Printer, Loader2, Lock, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { exportToExcel } from '@/lib/excel';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import TrackingSheetVoucher from '@/components/transactions/TrackingSheetVoucher';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { usePermission } from '@/hooks/usePermission';
import { useCompany } from '@/contexts/CompanyContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
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
            <PopoverContent className="w-[400px] p-0 z-[60]" align="start">
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

const AccountsPayable = () => {
    const { activeCompany } = useCompany();
    const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();
    const [payables, savePayables] = useCompanyData('accountsPayable');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [bankAccounts] = useCompanyData('bankAccounts');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
    const [payableToPay, setPayableToPay] = useState(null);
    const [editingPayable, setEditingPayable] = useState(null);
    const [payableForTracking, setPayableForTracking] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [printDialogOpen, setPrintDialogOpen] = useState(false);
    const [itemToPrint, setItemToPrint] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const voucherRef = useRef(null);

    const { toast } = useToast();

    // CORRECCIÓN: Función que cuenta los comprobantes basados en el año real
    const getNextVoucherNumber = (type, dateStr) => {
        if (!transactions) return 1;
        const year = new Date(dateStr).getFullYear().toString();
        const typeTransactions = transactions.filter(t => {
            let tType = t.type;
            if (t.isInternalTransfer || t.type === 'transfer') tType = 'transfer';
            const tYear = new Date(t.date).getFullYear().toString();
            return tType === type && tYear === year;
        });
        const maxNum = typeTransactions.reduce((max, t) => {
            return (t.voucherNumber && t.voucherNumber > max) ? t.voucherNumber : max;
        }, 0);
        return maxNum + 1;
    };

    const handleSavePayable = (payableData) => {
        if (!canAdd && !editingPayable) return;
        if (!canEdit && editingPayable) return;

        const { isNew, ...data } = payableData;
        let updatedPayables;
        let updatedTransactions = [...(transactions || [])];

        if (isNew) {
            const newPayableId = Date.now().toString();
            const voucherNumber = getNextVoucherNumber('expense', data.issueDate); // Usar la fecha de emisión

            updatedPayables = [...(payables || []), { ...data, id: newPayableId, status: 'Pendiente', internalPayments: [] }];

            const newExpenseTransaction = {
                id: `txn-exp-${newPayableId}`,
                type: 'expense',
                date: data.issueDate,
                description: `Gasto por compra a crédito: ${data.description}`,
                amount: data.amount,
                category: data.linkedAccount,
                destination: 'pending_payable',
                isReceivablePayable: true,
                voucherNumber: voucherNumber
            };
            updatedTransactions.push(newExpenseTransaction);

            toast({ title: "Cuenta por pagar creada", description: `Se ha generado el comprobante E-${String(voucherNumber).padStart(4, '0')} (Pendiente).` });
        } else {
            updatedPayables = payables.map(p => p.id === editingPayable.id ? { ...p, ...data } : p);
            const transactionIndex = updatedTransactions.findIndex(t => t.id === `txn-exp-${editingPayable.id}`);
            if (transactionIndex > -1) {
                updatedTransactions[transactionIndex] = {
                    ...updatedTransactions[transactionIndex],
                    date: data.issueDate,
                    description: `Gasto por compra a crédito: ${data.description}`,
                    amount: data.amount,
                    category: data.linkedAccount,
                };
            }
            toast({ title: "Cuenta por pagar actualizada" });
        }

        saveTransactions(updatedTransactions);
        savePayables(updatedPayables);
        setDialogOpen(false);
    };

    const handleDeletePayable = (id) => {
        if (!canDelete) return;
        saveTransactions(transactions.filter(t => t.id !== `txn-exp-${id}`));
        savePayables(payables.filter(p => p.id !== id));
        toast({ title: "Cuenta por pagar eliminada", description: "La transacción asociada también fue eliminada." });
    };

    const handleMarkAsPaid = (paymentData) => {
        if (!canAdd) return;
        const { payable, origin } = paymentData;

        const currentDate = format(new Date(), 'yyyy-MM-dd');
        const newVoucherNumber = getNextVoucherNumber('expense', currentDate);

        const updatedTransactions = transactions.map(t => {
            if (t.id === `txn-exp-${payable.id}`) {
                return {
                    ...t,
                    destination: origin,
                    date: currentDate,
                    description: `${t.description} (Pagado)`,
                    voucherNumber: newVoucherNumber
                };
            }
            return t;
        });

        saveTransactions(updatedTransactions);

        const updatedPayables = payables.map(p => p.id === payable.id ? { ...p, status: 'Pagado' } : p);
        savePayables(updatedPayables);

        toast({ title: "¡Cuenta Pagada!", description: `Se ha generado el comprobante de pago E-${String(newVoucherNumber).padStart(4, '0')}.` });
        setPaymentDialogOpen(false);
    };

    const handleSaveTracking = (payableId, newPayment) => {
        if (!canAdd) return;
        const updatedPayables = payables.map(p => {
            if (p.id === payableId) {
                const currentPayments = p.internalPayments || [];
                return { ...p, internalPayments: [...currentPayments, newPayment] };
            }
            return p;
        });

        savePayables(updatedPayables);

        const updatedItem = updatedPayables.find(p => p.id === payableId);
        setPayableForTracking(updatedItem);

        const totalPaid = (updatedItem.internalPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const remaining = parseFloat(updatedItem.amount) - totalPaid;

        if (remaining <= 0) {
            setTrackingDialogOpen(false);
            setPayableToPay(updatedItem);
            setTimeout(() => {
                setPaymentDialogOpen(true);
                toast({ title: "¡Saldo Cubierto!", description: "El saldo interno llegó a cero. Procede a confirmar el pago oficial." });
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

            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);

            window.open(pdfUrl, '_blank');

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
        if (filteredPayables.length === 0) {
            toast({ variant: 'destructive', title: "No hay datos para exportar" });
            return;
        }
        exportToExcel(filteredPayables.map(p => ({
            'Proveedor': p.supplier, 'Descripción': p.description, 'Fecha Emisión': p.issueDate, 'Fecha Vencimiento': p.dueDate, 'Monto': p.amount, 'Estado': p.status
        })), `Cuentas_Por_Pagar`);
    };

    const filteredPayables = (payables || []).filter(p =>
        p.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    return (
        <>
            <Helmet><title>Cuentas por Pagar - JaiderHerTur26</title></Helmet>
            <div className="space-y-6">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
                    <div><h1 className="text-4xl font-bold text-slate-900">Cuentas por Pagar</h1><p className="text-slate-600">Gestiona tus deudas y obligaciones con proveedores.</p></div>
                    <div className="flex items-center gap-2">
                        {isReadOnly && <span className="flex items-center text-slate-400 text-sm"><Lock className="w-4 h-4 mr-1" />Acceso Parcial</span>}
                        {canAdd && <Button onClick={() => { setEditingPayable(null); setDialogOpen(true); }} className="bg-red-600 hover:bg-red-700"><Plus className="w-4 h-4 mr-2" /> Nueva Cuenta</Button>}
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6 border flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px] relative"><Label>Buscar:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Proveedor o descripción..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full mt-1 pl-10 pr-4 py-2 border rounded-lg" /></div>
                    <div className="flex gap-2 flex-wrap"><Button onClick={handleExport} variant="outline"><Download className="w-4 h-4 mr-2" /> Exportar</Button></div>
                </motion.div>

                {filteredPayables.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-white rounded-xl shadow-lg border">
                        <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                        <p className="text-slate-500">¡Felicidades! No tienes cuentas por pagar pendientes.</p>
                    </motion.div>
                ) : (
                    <div className="bg-white rounded-xl shadow-lg border overflow-x-auto"><table className="w-full text-sm">
                        <thead className="bg-slate-50"><tr>{['Proveedor', 'Descripción', 'Vencimiento', 'Monto', 'Estado', 'Acciones'].map(h => <th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr></thead>
                        <tbody className="divide-y">{filteredPayables.map(p => (<tr key={p.id} className={`hover:bg-slate-50 ${p.status === 'Pagado' ? 'text-slate-400' : ''}`}>
                            <td className="p-3 font-medium">{p.supplier}</td><td className="p-3">{p.description}</td><td className="p-3">{format(new Date(p.dueDate), 'dd/MM/yyyy', { locale: es })}</td><td className="p-3 font-mono">${parseFloat(p.amount).toLocaleString('es-ES')}</td>
                            <td className="p-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${p.status === 'Pagado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{p.status}</span></td>
                            <td className="p-3"><div className="flex gap-1">
                                {p.status === 'Pendiente' && (
                                    <>
                                        <Button size="icon" variant="ghost" className="hover:text-blue-600" onClick={() => { setPayableForTracking(p); setTrackingDialogOpen(true); }} title="Hoja de Apuntes"><ClipboardList className="w-4 h-4" /></Button>
                                        {canAdd && <Button size="icon" variant="ghost" className="hover:text-green-600" onClick={() => { setPayableToPay(p); setPaymentDialogOpen(true); }} title="Marcar como Pagado"><CheckCircle className="w-4 h-4" /></Button>}
                                    </>
                                )}
                                {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingPayable(p); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                                {canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDeletePayable(p.id)}><Trash2 className="w-4 h-4" /></Button>}
                            </div></td>
                        </tr>))}</tbody>
                    </table></div>
                )}
            </div>
            <PayableDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSavePayable} payable={editingPayable} accounts={accounts} />
            <PaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} onSave={handleMarkAsPaid} payable={payableToPay} bankAccounts={bankAccounts} />
            <TrackingSheetDialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen} onSave={handleSaveTracking} payable={payableForTracking} type="payable" onPrint={openPrintPreview} canAdd={canAdd} />

            <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
                <DialogContent className="max-w-4xl p-0 max-h-[90vh] overflow-y-auto">
                    <div className="p-4 bg-slate-50 border-b flex justify-between items-center sticky top-0 z-10">
                        <DialogHeader>
                            <DialogTitle>Vista Previa de Hoja de Apuntes</DialogTitle>
                            <DialogDescription>Genera un PDF con el historial de abonos.</DialogDescription>
                        </DialogHeader>
                        <Button onClick={handlePrintToPdf} disabled={isPrinting}>
                            {isPrinting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</> : <><Printer className="mr-2 h-4 w-4" /> Descargar PDF</>}
                        </Button>
                    </div>
                    <div className="p-8 bg-gray-200 flex justify-center">
                        <TrackingSheetVoucher ref={voucherRef} item={itemToPrint} type="payable" />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

const TrackingSheetDialog = ({ open, onOpenChange, onSave, payable, type, onPrint, canAdd }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [note, setNote] = useState('');
    const { toast } = useToast();

    const internalPayments = payable?.internalPayments || [];
    const totalAmount = parseFloat(payable?.amount || 0);
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

        onSave(payable.id, {
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
                        <Button variant="outline" size="sm" onClick={() => onPrint(payable)} className="ml-auto">
                            <Printer className="w-4 h-4 mr-2" /> Imprimir Comprobante
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
                        <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                            <p className="text-sm text-red-600">Saldo Pendiente</p>
                            <p className="text-xl font-bold text-red-700">${remaining.toLocaleString('es-ES')}</p>
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
                                                <span className="font-medium">{format(new Date(payment.date), 'dd/MM/yyyy', { locale: es })}</span>
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
                                <Lock className="w-4 h-4 inline mr-1" />
                                El registro de nuevos abonos está deshabilitado en modo lectura.
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};


const PayableDialog = ({ open, onOpenChange, onSave, payable, accounts }) => {
    const defaultData = { supplier: '', description: '', issueDate: format(new Date(), 'yyyy-MM-dd'), dueDate: '', amount: '', linkedAccount: '' };
    const [data, setData] = useState(defaultData);
    const { toast } = useToast();

    useEffect(() => {
        if (open) {
            if (payable) setData(payable);
            else setData(defaultData);
        }
    }, [payable, open]);

    const handleSubmit = e => {
        e.preventDefault();
        if (!data.linkedAccount) {
            toast({ variant: 'destructive', title: 'Campo Requerido', description: 'Debes seleccionar la cuenta de gasto contrapartida.' });
            return;
        }
        onSave({ ...data, isNew: !payable });
    };

    const expenseAccounts = Array.isArray(accounts)
        ? accounts
            .filter(a => a && a.number && a.number.toString().startsWith("5")) // 5 = EGRESOS
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        : [];

    return (<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{payable ? 'Editar' : 'Nueva'} Cuenta por Pagar</DialogTitle></DialogHeader><form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="md:col-span-2 space-y-1"><Label>Proveedor</Label><input required value={data.supplier} onChange={e => setData({ ...data, supplier: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
        <div className="md:col-span-2 space-y-1"><Label>Descripción</Label><input required value={data.description} onChange={e => setData({ ...data, description: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Fecha de Emisión</Label><input type="date" required value={data.issueDate} onChange={e => setData({ ...data, issueDate: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Fecha de Vencimiento</Label><input type="date" required value={data.dueDate} onChange={e => setData({ ...data, dueDate: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Monto</Label><input type="number" step="0.01" required value={data.amount} onChange={e => setData({ ...data, amount: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1">
            <Label>Contrapartida (Cuenta de Gasto)</Label>
            <AccountSelector
                accounts={expenseAccounts}
                value={data.linkedAccount}
                onChange={value => setData({ ...data, linkedAccount: value })}
                placeholder="Seleccionar Gasto"
            />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-red-600 hover:bg-red-700">Guardar</Button></div>
    </form></DialogContent></Dialog>);
};

const PaymentDialog = ({ open, onOpenChange, onSave, payable, bankAccounts }) => {
    const [origin, setOrigin] = useState('caja_principal|CAJA PRINCIPAL');
    useEffect(() => {
        if (open) {
            setOrigin('caja_principal|CAJA PRINCIPAL');
        }
    }, [open]);

    const handleSave = () => {
        onSave({ payable, origin });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Registrar Pago</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <p>Vas a marcar la cuenta de <strong>{payable?.supplier}</strong> por un monto de <strong>${parseFloat(payable?.amount || 0).toLocaleString('es-ES')}</strong> como pagada.</p>
                    <div className="space-y-2">
                        <Label htmlFor="origin">¿Desde dónde se realizó el pago?</Label>
                        <select id="origin" value={origin} onChange={e => setOrigin(e.target.value)} className="w-full p-2 border rounded-lg">
                            <option value="caja_principal|CAJA PRINCIPAL">Caja Principal (Efectivo)</option>
                            {(bankAccounts || []).map(b_acc => (
                                <option key={b_acc.id} value={`${b_acc.id}|${b_acc.bankName}`}>{b_acc.bankName}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                    <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700">Confirmar Pago</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AccountsPayable;