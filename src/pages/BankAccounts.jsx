import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Landmark, Edit2, Trash2, ArrowRightLeft, Banknote, Briefcase, Lock, AlertTriangle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';
import { usePermission } from '@/hooks/usePermission';

const BankAccounts = () => {
    const { activeCompany } = useCompany();
    const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();
    const [accounts, saveAccounts] = useCompanyData('bankAccounts');
    const [chartOfAccounts, saveChartOfAccounts] = useCompanyData('accounts');

    // Dialog States
    const [dialogOpen, setDialogOpen] = useState(false);
    const [movementDialogOpen, setMovementDialogOpen] = useState(false);
    const [interestDialogOpen, setInterestDialogOpen] = useState(false);

    const [editingAccount, setEditingAccount] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);

    const [transactions, saveTransactions] = useCompanyData('transactions');
    const { toast } = useToast();

    const accountsWithCalculatedBalances = useMemo(() => {
        if (!accounts || !transactions) return [];
        return accounts.map(acc => {
            const initialBalance = parseFloat(acc.initialBalance || 0);
            const initialInvestmentBalance = parseFloat(acc.initialInvestmentBalance || 0);
            const movements = transactions.reduce((accBalances, t) => {
                const amount = parseFloat(t.amount);
                if (t.destination && t.destination.startsWith(acc.id)) {
                    if (t.type === 'income') {
                        if (t.description && t.description.includes('Aporte Ordinario')) accBalances.investmentBalance += amount;
                        else accBalances.balance += amount;
                    } else if (t.type === 'expense') { accBalances.balance -= amount; }
                }
                return accBalances;
            }, { balance: 0, investmentBalance: 0 });
            return { ...acc, balance: initialBalance + movements.balance, investmentBalance: initialInvestmentBalance + movements.investmentBalance };
        });
    }, [accounts, transactions]);

    const handleSaveAccount = (accountData) => {
        if (isReadOnly) return;
        if (!canAdd && !editingAccount) return;
        if (!canEdit && editingAccount) return;
        let updated;
        if (editingAccount) {
            // NUEVO: Se guarda la fecha
            updated = accounts.map(acc => acc.id === editingAccount.id ? { ...acc, ...accountData, initialBalance: parseFloat(accountData.initialBalance || 0), initialInvestmentBalance: parseFloat(accountData.initialInvestmentBalance || 0) } : acc);
            toast({ title: "Cuenta actualizada" });
            if (accountData.accountingCode && accountData.accountingConcept) {
                const existingIdx = chartOfAccounts.findIndex(c => c.number === accountData.accountingCode);
                if (existingIdx >= 0) {
                    const updatedChart = [...chartOfAccounts];
                    updatedChart[existingIdx] = { ...updatedChart[existingIdx], name: accountData.accountingConcept };
                    saveChartOfAccounts(updatedChart);
                } else {
                    const newChartAccount = { id: crypto.randomUUID(), number: accountData.accountingCode, name: accountData.accountingConcept };
                    saveChartOfAccounts([...chartOfAccounts, newChartAccount].sort((a, b) => a.number.localeCompare(b.number)));
                }
            }
        } else {
            const newAccountId = Date.now().toString();
            // NUEVO: Se guarda la fecha
            updated = [...(accounts || []), { ...accountData, id: newAccountId, initialBalance: parseFloat(accountData.initialBalance || 0), initialInvestmentBalance: parseFloat(accountData.initialInvestmentBalance || 0) }];
            if (accountData.accountingCode && accountData.accountingConcept) {
                const exists = (chartOfAccounts || []).some(c => c.number === accountData.accountingCode);
                if (!exists) {
                    const newChartAccount = { id: crypto.randomUUID(), number: accountData.accountingCode, name: accountData.accountingConcept };
                    saveChartOfAccounts([...(chartOfAccounts || []), newChartAccount].sort((a, b) => a.number.localeCompare(b.number)));
                }
            }
        }
        saveAccounts(updated);
        setDialogOpen(false);
        setEditingAccount(null);
    };

    const handleDeleteAccount = (id) => {
        if (!canDelete) return;
        saveAccounts(accounts.filter(acc => acc.id !== id));
        toast({ title: "Cuenta eliminada" });
    };

    const getNextVoucherNumber = (type, date) => {
        const year = new Date(date).getFullYear().toString();
        const typeTransactions = (transactions || []).filter(t => {
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

    const handleSaveMovement = (movementData) => {
        if (!canAdd) return;
        const amount = parseFloat(movementData.amount);
        const [year, month, day] = movementData.date.split('-').map(Number);
        const movementDate = new Date(year, month - 1, day);
        const now = Date.now();

        const voucherNumber = getNextVoucherNumber('transfer', movementData.date);

        const { sourceAccount } = movementData;
        const [sourceId, sourceName] = sourceAccount.split('|');
        const expenseTransaction = { id: `${now}-exp`, type: 'expense', description: `Aporte Ordinario a cuenta ${selectedAccount.bankName}`, amount: amount, category: movementData.linkedAccount, date: movementDate, destination: sourceAccount, isInternalTransfer: true, voucherNumber };
        const incomeTransaction = { id: `${now}-inc`, type: 'income', description: `Aporte Ordinario desde ${sourceName}`, amount: amount, category: movementData.linkedAccount, date: movementDate, destination: `${selectedAccount.id}|${selectedAccount.bankName}`, isInternalTransfer: true, voucherNumber };
        saveTransactions([...(transactions || []), expenseTransaction, incomeTransaction]);
        setMovementDialogOpen(false);
        toast({ title: "Aporte Ordinario registrado", description: `Se creó una transferencia interna desde ${sourceName}.` });
    };

    const handleSaveInterest = (interestData) => {
        if (!canAdd) return;
        const amount = parseFloat(interestData.amount);
        const [year, month, day] = interestData.date.split('-').map(Number);
        const movementDate = new Date(year, month - 1, day);
        const now = Date.now();
        const voucherNumber = getNextVoucherNumber('income', interestData.date);

        const incomeTransaction = {
            id: `${now}`,
            type: 'income',
            description: `Abono de intereses / Rendimientos financieros`,
            amount: amount,
            category: interestData.linkedAccount,
            date: movementDate,
            destination: `${selectedAccount.id}|${selectedAccount.bankName}`,
            isInternalTransfer: false,
            voucherNumber
        };

        saveTransactions([...(transactions || []), incomeTransaction]);
        setInterestDialogOpen(false);
        toast({ title: "Intereses registrados", description: `Se sumaron $${amount.toLocaleString('es-ES')} a la cuenta.` });
    };

    return (
        <>
            <Helmet><title>Cuentas Bancarias - JaiderHerTur26</title></Helmet>
            <div className="space-y-6">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
                    <div><h1 className="text-4xl font-bold text-slate-900">Cuentas Bancarias</h1><p className="text-slate-600">Gestiona tus cuentas y aportes ordinarios.</p></div>
                    <div className="flex items-center gap-2">
                        {isReadOnly && <span className="flex items-center text-slate-400 text-sm"><Lock className="w-4 h-4 mr-1" />Acceso Parcial</span>}
                        {canAdd && <Button onClick={() => { setEditingAccount(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" /> Nueva Cuenta</Button>}
                    </div>
                </motion.div>
                {(accountsWithCalculatedBalances || []).length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-white rounded-xl shadow-lg border"><Landmark className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No hay cuentas bancarias guardadas.</p></motion.div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {accountsWithCalculatedBalances.map((account, index) => (
                            <motion.div key={account.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-white rounded-xl shadow-lg p-6 border flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center mb-4">
                                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4"><Banknote className="w-6 h-6 text-blue-600" /></div>
                                        <div><h3 className="font-bold text-lg">{account.bankName}</h3><p className="text-sm text-slate-500">Cta No. {account.accountNumber}</p></div>
                                    </div>
                                    <div className="mb-2">{account.accountingCode && (<span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">PUC: {account.accountingCode} - {account.accountingConcept}</span>)}</div>
                                    <p className="text-sm text-slate-500">Balance Cta. Principal</p>
                                    <p className="text-3xl font-bold text-blue-800">${(account.balance || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                                    <div className="mt-2 flex items-center gap-2 text-sm text-purple-700 bg-purple-100 p-2 rounded-lg"><Briefcase className="w-4 h-4" /><span>Aporte Ordinario: ${(account.investmentBalance || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span></div>
                                </div>

                                <div className="mt-4">
                                    <div className="grid grid-cols-2 gap-2">
                                        {canAdd && <Button variant="outline" size="sm" onClick={() => { setSelectedAccount(account); setMovementDialogOpen(true); }} className="w-full text-xs px-2"><ArrowRightLeft className="w-3 h-3 mr-1" /> Aporte</Button>}
                                        {canAdd && <Button variant="outline" size="sm" onClick={() => { setSelectedAccount(account); setInterestDialogOpen(true); }} className="w-full text-xs px-2 text-green-700 border-green-200 bg-green-50 hover:bg-green-100"><TrendingUp className="w-3 h-3 mr-1" /> Intereses</Button>}
                                    </div>
                                    <div className="flex justify-end gap-1 mt-2 pt-2 border-t border-slate-100">
                                        {(canEdit || (isReadOnly && canAdd)) && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAccount(account); setDialogOpen(true) }}><Edit2 className="w-4 h-4" /></Button>}
                                        {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => handleDeleteAccount(account.id)}><Trash2 className="w-4 h-4" /></Button>}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveAccount} account={editingAccount} isReadOnly={isReadOnly} />
            {selectedAccount && <MovementDialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen} onSave={handleSaveMovement} account={selectedAccount} availableAccounts={accounts} />}
            {selectedAccount && <InterestDialog open={interestDialogOpen} onOpenChange={setInterestDialogOpen} onSave={handleSaveInterest} account={selectedAccount} chartOfAccounts={chartOfAccounts} />}
        </>
    );
};

const AccountDialog = ({ open, onOpenChange, onSave, account, isReadOnly }) => {
    // NUEVO: Agregamos el campo date, por defecto la fecha de hoy
    const [data, setData] = useState({ bankName: '', accountNumber: '', initialBalance: '', initialInvestmentBalance: '', accountingCode: '', accountingConcept: '', date: format(new Date(), 'yyyy-MM-dd') });

    useEffect(() => {
        if (account) setData({ bankName: account.bankName || '', accountNumber: account.accountNumber || '', initialBalance: account.initialBalance || '', initialInvestmentBalance: account.initialInvestmentBalance || '', accountingCode: account.accountingCode || '', accountingConcept: account.accountingConcept || '', date: account.date || format(new Date(), 'yyyy-MM-dd') });
        else setData({ bankName: '', accountNumber: '', initialBalance: '', initialInvestmentBalance: '', accountingCode: '', accountingConcept: '', date: format(new Date(), 'yyyy-MM-dd') });
    }, [account, open]);

    const handleSubmit = (e) => { e.preventDefault(); if (!isReadOnly) onSave(data); };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{account ? 'Editar' : 'Nueva'} Cuenta Bancaria</DialogTitle></DialogHeader>
                {isReadOnly && account && <div className="bg-amber-50 text-amber-800 p-4 rounded-lg flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5" />Modo Solo Lectura</div>}
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2"><Label>Nombre del Banco/Entidad</Label><input required disabled={isReadOnly} value={data.bankName} onChange={e => setData({ ...data, bankName: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Número de Cuenta Bancaria</Label><input required disabled={isReadOnly} value={data.accountNumber} onChange={e => setData({ ...data, accountNumber: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100" /></div>
                        {/* NUEVO CAMPO: Fecha */}
                        <div className="space-y-2"><Label>Fecha Apertura / Saldo</Label><input type="date" required disabled={isReadOnly} value={data.date} onChange={e => setData({ ...data, date: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100" /></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="col-span-2 flex items-center gap-2 text-sm font-semibold text-blue-800 pb-2 border-b border-slate-200 mb-2"><Landmark className="w-4 h-4" /> Vinculación Contable (Automática)</div>
                        <div className="space-y-2"><Label className="text-xs">Código PUC</Label><input disabled={isReadOnly} value={data.accountingCode} onChange={e => setData({ ...data, accountingCode: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-slate-100" /></div>
                        <div className="space-y-2"><Label className="text-xs">Nombre Cuenta PUC</Label><input disabled={isReadOnly} value={data.accountingConcept} onChange={e => setData({ ...data, accountingConcept: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-slate-100" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Saldo Inicial Cta. Principal</Label><input type="number" disabled={isReadOnly} step="0.01" value={data.initialBalance} onChange={e => setData({ ...data, initialBalance: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100" /></div>
                        <div className="space-y-2"><Label>Saldo Inicial Aporte</Label><input type="number" disabled={isReadOnly} step="0.01" value={data.initialInvestmentBalance} onChange={e => setData({ ...data, initialInvestmentBalance: e.target.value })} className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100" /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>{!isReadOnly && <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button>}</div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const MovementDialog = ({ open, onOpenChange, onSave, account, availableAccounts = [] }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [linkedAccount, setLinkedAccount] = useState('');
    const [sourceAccount, setSourceAccount] = useState('caja_principal|CAJA PRINCIPAL');
    const [chartOfAccounts] = useCompanyData('accounts');
    const { toast } = useToast();
    useEffect(() => { if (open) { setAmount(''); setDate(format(new Date(), 'yyyy-MM-dd')); setSourceAccount('caja_principal|CAJA PRINCIPAL'); const defaultInvestmentAccount = (chartOfAccounts || []).find(acc => acc.number === '321501'); setLinkedAccount(defaultInvestmentAccount ? defaultInvestmentAccount.name : ''); } }, [open, chartOfAccounts]);
    const handleSubmit = (e) => { e.preventDefault(); if (!linkedAccount) { toast({ variant: 'destructive', title: 'Error', description: 'Debes seleccionar una cuenta contable vinculada.' }); return; } onSave({ amount, date, linkedAccount, sourceAccount }); };
    const sortedAccounts = [...(chartOfAccounts || [])].sort((a, b) => a.number.localeCompare(b.number));
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Registrar Aporte Ordinario</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2"><Label>Origen de Fondos</Label><select required value={sourceAccount} onChange={e => setSourceAccount(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="caja_principal|CAJA PRINCIPAL">CAJA PRINCIPAL</option>{(availableAccounts || []).map(acc => (<option key={acc.id} value={`${acc.id}|${acc.bankName}`}>{acc.bankName}</option>))}</select></div>
                    <div className="space-y-2"><Label>Monto</Label><input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div className="space-y-2"><Label>Fecha</Label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div className="space-y-2"><Label>Cuenta Contable Vinculada</Label><select required value={linkedAccount} onChange={e => setLinkedAccount(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="" disabled>Selecciona una cuenta</option>{sortedAccounts.map(acc => (<option key={acc.id} value={acc.name}>{acc.number} - {acc.name}</option>))}</select></div>
                    <div className="flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Registrar</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const InterestDialog = ({ open, onOpenChange, onSave, account, chartOfAccounts = [] }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [linkedAccount, setLinkedAccount] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        if (open) {
            setAmount('');
            setDate(format(new Date(), 'yyyy-MM-dd'));
            const defaultAcc = (chartOfAccounts || []).find(acc => acc.number.startsWith('4210')) || (chartOfAccounts || []).find(acc => acc.number.startsWith('4'));
            setLinkedAccount(defaultAcc ? defaultAcc.name : '');
        }
    }, [open, chartOfAccounts]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!linkedAccount) { toast({ variant: 'destructive', title: 'Error', description: 'Selecciona una cuenta de Ingreso.' }); return; }
        onSave({ amount, date, linkedAccount });
    };

    const incomeAccounts = [...(chartOfAccounts || [])].filter(a => a.number.startsWith('4')).sort((a, b) => a.number.localeCompare(b.number));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Registrar Intereses / Rendimientos</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Cuenta Destino</Label>
                        <input disabled value={account?.bankName || ''} className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-600 font-medium" />
                    </div>
                    <div className="space-y-2">
                        <Label>Monto (Intereses)</Label>
                        <input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Ej: 228.00" />
                    </div>
                    <div className="space-y-2"><Label>Fecha</Label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                    <div className="space-y-2">
                        <Label>Cuenta Contable de Ingreso</Label>
                        <select required value={linkedAccount} onChange={e => setLinkedAccount(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                            <option value="" disabled>Selecciona una cuenta de ingreso</option>
                            {incomeAccounts.map(acc => (<option key={acc.id} value={acc.name}>{acc.number} - {acc.name}</option>))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700">Abonar Intereses</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default BankAccounts;