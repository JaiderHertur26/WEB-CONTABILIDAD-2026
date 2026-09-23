import { getAccountingYear } from '@/lib/accountingDate';
import React, { useState, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Wallet, Banknote, TrendingUp, TrendingDown, Landmark, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useToast } from '@/components/ui/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';
import { calculateLiquidityBalances } from '@/lib/financialMovements';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { resolveLiquidityAccount } from '@/lib/liquidityAccounts';

const CashAccounts = () => {
  const { isConsolidated, activeCompany } = useCompany();
  const [cashAccounts, saveCashAccounts] = useCompanyData('cash_accounts');
  const [initialBalance, saveInitialBalance] = useCompanyData('initialBalance');
  const [accounts, saveAccounts] = useCompanyData('accounts');
  const [transactions, saveTransactions] = useCompanyData('transactions');
  const [bankAccounts] = useCompanyData('bankAccounts');
  const [fiscalYears] = useCompanyData('fiscal_years');
  const [monthlyClosings] = useCompanyData('monthly_closings');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const { toast } = useToast();
  const { canAdd, canEdit, canDelete, isReadOnly } = usePermission();

  const [formData, setFormData] = useState({
    name: '',
    type: 'Menor',
    accounting_account: '',
    accounting_concept: '',
    initial_balance: 0,
    date: format(new Date(), 'yyyy-MM-dd'),
    is_opening_balance: true
  });
  const [fundingSource, setFundingSource] = useState('');

  const allAccounts = useMemo(() => {
    const list = [];
    if (initialBalance && initialBalance.length > 0) {
      const totalInitialBalance = initialBalance.reduce((acc, curr) => acc + (parseFloat(curr.balance) || 0), 0);
      const main = initialBalance[0];
      list.push({
        id: 'caja_principal',
        name: 'CAJA PRINCIPAL',
        type: 'Principal',
        accounting_account: main.accountingCode || '11050501',
        accounting_concept: main.accountingName || 'CAJA PRINCIPAL',
        initial_balance: totalInitialBalance,
        date: main.date || format(new Date(), 'yyyy-MM-dd'),
        isMain: true
      });
    } else {
      list.push({
        id: 'caja_principal',
        name: 'CAJA PRINCIPAL',
        type: 'Principal',
        accounting_account: '11050501',
        accounting_concept: 'CAJA PRINCIPAL',
        initial_balance: 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        isMain: true
      });
    }
    if (cashAccounts) list.push(...cashAccounts);
    return list;
  }, [initialBalance, cashAccounts]);

  const handleOpenDialog = (account = null) => {
    if (account) {
      setEditingAccount(account);
      const existingAcc = (accounts || []).find(a => a.number === account.accounting_account);
      setFormData({
        name: account.name,
        type: account.type,
        accounting_account: account.accounting_account || '',
        accounting_concept: existingAcc ? existingAcc.name : (account.accounting_concept || account.name),
        initial_balance: account.initial_balance,
        date: account.date || format(new Date(), 'yyyy-MM-dd'),
        is_opening_balance: true
      });
    } else {
      setEditingAccount(null);
      setFormData({
        name: '',
        type: 'Menor',
        accounting_account: '',
        accounting_concept: '',
        initial_balance: 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        is_opening_balance: true
      });
      setFundingSource('');
    }
    setIsDialogOpen(true);
  };

  const getNextVoucherNumber = (type, dateStr = formData.date) => {
    const year = String(dateStr || '').includes('-')
      ? String(dateStr).split('-')[0]
      : String(new Date(dateStr || Date.now()).getFullYear());

    const typeTransactions = (transactions || []).filter(t => {
      let transactionType = t.type;
      if (t.isInternalTransfer || t.type === 'transfer' || t.type === 'adjustment') {
        transactionType = 'transfer';
      }
      const transactionYear = String(t.date || '').includes('-')
        ? String(t.date).split('-')[0]
        : String(getAccountingYear(t.date));
      return transactionType === type && transactionYear === year;
    });

    const maxNumber = typeTransactions.reduce(
      (max, t) => Math.max(max, Number(t.voucherNumber) || 0),
      0
    );

    return maxNumber + 1;
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if ((editingAccount && !canEdit) || (!editingAccount && !canAdd)) return;

    if (!formData.name && (!editingAccount || !editingAccount.isMain)) { toast({ variant: 'destructive', title: 'Error', description: 'El nombre de la caja es obligatorio' }); return; }
    if (!formData.accounting_account) { toast({ variant: 'destructive', title: 'Error', description: 'El número de cuenta contable es obligatorio' }); return; }
    if (!formData.accounting_concept) { toast({ variant: 'destructive', title: 'Error', description: 'El concepto de la cuenta contable es obligatorio' }); return; }

    const existingAcc = (accounts || []).find(a => a.number === formData.accounting_account);
    const isNumberChanged = editingAccount && editingAccount.accounting_account !== formData.accounting_account;
    const financialFieldsChanged = editingAccount && (
      isNumberChanged ||
      String(formData.date || '') !== String(editingAccount.date || '') ||
      Number(formData.initial_balance || 0) !== Number(editingAccount.initial_balance || 0)
    );
    const newFinancialOpening = !editingAccount && Number(formData.initial_balance || 0) !== 0;
    const periodOptions = { fiscalYears, monthlyClosings };
    const targetLockReason = getAccountingPeriodLockReason(formData.date, periodOptions);
    const sourceLockReason = editingAccount
      ? getAccountingPeriodLockReason(editingAccount.date, periodOptions)
      : null;
    const lockReason = financialFieldsChanged
      ? (sourceLockReason || targetLockReason)
      : (newFinancialOpening ? targetLockReason : null);
    if (lockReason) {
      toast({ variant:'destructive', title:'Período contable cerrado', description: lockReason });
      return;
    }
    if (editingAccount && isNumberChanged && cashHasHistory(editingAccount)) {
      toast({ variant:'destructive', title:'Cuenta contable protegida', description:'Esta caja ya tiene movimientos y no puede cambiarse su código PUC.' });
      return;
    }

    if (existingAcc && (!editingAccount || (isNumberChanged && !editingAccount.isMain))) { toast({ variant: 'destructive', title: 'Cuenta existente', description: `El código ${formData.accounting_account} ya existe.` }); return; }

    if (editingAccount?.isMain) {
      const oldCode = editingAccount.accounting_account;
      const newCode = formData.accounting_account;
      const newConcept = formData.accounting_concept;
      const newBalanceData = [{ balance: formData.initial_balance, date: formData.date, accountingCode: newCode, accountingName: newConcept }];
      saveInitialBalance(newBalanceData);

      let updatedAccounts = [...(accounts || [])];
      const existingNewAccIndex = updatedAccounts.findIndex(a => a.number === newCode);
      const existingOldAccIndex = updatedAccounts.findIndex(a => a.number === oldCode);
      if (oldCode === newCode) {
        if (existingNewAccIndex >= 0) updatedAccounts[existingNewAccIndex] = { ...updatedAccounts[existingNewAccIndex], name: newConcept };
        else updatedAccounts.push({ id: crypto.randomUUID(), number: newCode, name: newConcept });
      } else {
        if (existingNewAccIndex >= 0) updatedAccounts[existingNewAccIndex] = { ...updatedAccounts[existingNewAccIndex], name: newConcept };
        else if (existingOldAccIndex >= 0) updatedAccounts[existingOldAccIndex] = { ...updatedAccounts[existingOldAccIndex], number: newCode, name: newConcept };
        else updatedAccounts.push({ id: crypto.randomUUID(), number: newCode, name: newConcept });
      }
      updatedAccounts.sort((a, b) => a.number.localeCompare(b.number));
      saveAccounts(updatedAccounts);
      toast({ title: 'Caja Principal actualizada' });
      setIsDialogOpen(false);
      return;
    }

    const newId = editingAccount ? editingAccount.id : crypto.randomUUID();
    let finalInitialBalance = formData.initial_balance;
    let newTransactions = [...(transactions || [])];

    if (!editingAccount && !formData.is_opening_balance) {
      if (!fundingSource) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debes seleccionar la fuente de los fondos.' });
        return;
      }
      const fundingAmount = Number(formData.initial_balance || 0);
      if (!Number.isFinite(fundingAmount) || fundingAmount <= 0) {
        toast({ variant:'destructive', title:'Monto inválido', description:'El fondeo desde otra cuenta debe ser mayor a cero.' });
        return;
      }
      const source = resolveLiquidityAccount(fundingSource, { bankAccounts, cashAccounts });
      if (!source?.code) {
        toast({ variant:'destructive', title:'Fuente inválida', description:'No se pudo resolver la cuenta contable de origen.' });
        return;
      }
      finalInitialBalance = 0;
      const transferVoucherNumber = getNextVoucherNumber('transfer', formData.date);
      newTransactions.push({
        id: `txn-cash-funding-${newId}`,
        date: formData.date,
        description: `Fondeo inicial de caja: ${formData.name}`,
        amount: fundingAmount,
        type: 'transfer',
        voucherPrefix: 'T',
        voucherNumber: transferVoucherNumber,
        category: 'FONDEO CAJA',
        fromAccount: fundingSource,
        toAccount: `${newId}|${formData.name}`,
        debitAccount: { code: formData.accounting_account, name: formData.accounting_concept },
        creditAccount: { code: source.code, name: source.name },
        isInternalTransfer: true,
        isCashFunding: true,
        company_id: activeCompany?.id,
        companyId: activeCompany?.id
      });
      toast({ title: 'Transferencia generada', description: `Se trasladaron $${fundingAmount.toLocaleString('es-CO')} desde ${source.label || source.name}.` });
    }

    if (editingAccount) {
      const updatedCashAccounts = cashAccounts.map(acc => acc.id === editingAccount.id ? { ...acc, ...formData, initial_balance: finalInitialBalance, date: formData.date } : acc);
      saveCashAccounts(updatedCashAccounts);
      const originalAccInChart = (accounts || []).find(a => a.number === editingAccount.accounting_account);
      if (originalAccInChart) {
        const updatedAccounts = accounts.map(a => a.id === originalAccInChart.id ? { ...a, number: formData.accounting_account, name: formData.accounting_concept } : a);
        saveAccounts(updatedAccounts);
      } else {
        const newChartAccount = { id: crypto.randomUUID(), number: formData.accounting_account, name: formData.accounting_concept };
        saveAccounts([...accounts, newChartAccount].sort((a, b) => a.number.localeCompare(b.number)));
      }
      toast({ title: 'Caja actualizada' });
    } else {
      const newCashAccount = { ...formData, date: formData.date, id: newId, initial_balance: finalInitialBalance, created_at: new Date().toISOString() };
      saveCashAccounts([...(cashAccounts || []), newCashAccount]);

      const newChartAccount = { id: crypto.randomUUID(), number: formData.accounting_account, name: formData.accounting_concept, linked_cash_account_id: newId };
      const updatedAccounts = [...(accounts || []), newChartAccount].sort((a, b) => a.number.localeCompare(b.number));
      saveAccounts(updatedAccounts);

      if (newTransactions.length > (transactions || []).length) saveTransactions(newTransactions);
      toast({ title: 'Caja creada' });
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (account) => {
    if (!canDelete) return;
    if (account.isMain) { toast({ variant: 'destructive', title: 'Acción no permitida', description: 'No se puede eliminar la Caja Principal.' }); return; }
    if (cashHasHistory(account)) {
      toast({ variant:'destructive', title:'Caja con historial', description:'No puede eliminarse una caja que ya participa en movimientos contables.' });
      return;
    }
    if (Math.abs(Number(account.initial_balance || 0)) > 0.0001) {
      toast({ variant:'destructive', title:'Saldo inicial protegido', description:'No puede eliminarse una caja que conserva saldo inicial. Debe conservarse la trazabilidad de apertura.' });
      return;
    }
    const lockReason = getAccountingPeriodLockReason(account.date, { fiscalYears, monthlyClosings });
    if (lockReason) {
      toast({ variant:'destructive', title:'Período contable cerrado', description: lockReason });
      return;
    }
    if (window.confirm('¿Estás seguro de eliminar esta caja sin movimientos ni saldo inicial?')) {
      saveCashAccounts(cashAccounts.filter(acc => acc.id !== account.id));
      if (account.accounting_account) {
        const accToDelete = (accounts || []).find(a => a.number === account.accounting_account);
        if (accToDelete) saveAccounts(accounts.filter(a => a.id !== accToDelete.id));
      }
      toast({ title: 'Caja eliminada' });
    }
  };

  const liquidityBalances = useMemo(() => calculateLiquidityBalances({
    transactions: transactions || [],
    initialBalances: initialBalance || [],
    bankAccounts: bankAccounts || [],
    cashAccounts: cashAccounts || [],
    accounts: accounts || [],
  }), [transactions, initialBalance, bankAccounts, cashAccounts, accounts]);

  const calculateCurrentBalance = (account) =>
    account.id === 'caja_principal'
      ? Number(liquidityBalances.mainCash || 0)
      : Number(liquidityBalances.customCash?.[String(account.id)] || 0);

  const cashHasHistory = (account) => (transactions || []).some(t => {
    const id = String(account?.id || '');
    const code = String(account?.accounting_account || '');
    const name = String(account?.accounting_concept || account?.name || '').trim().toLowerCase();
    const endpointIds = [t.destination, t.fromAccount, t.toAccount]
      .map(value => String(value || '').split('|')[0]);
    const sideMatch = side => side && (
      (code && String(side.code || '') === code) ||
      (name && String(side.name || '').trim().toLowerCase() === name)
    );
    return endpointIds.includes(id) || sideMatch(t.debitAccount) || sideMatch(t.creditAccount);
  });

  return (
    <>
      <Helmet><title>Cajas - JaiderHerTur26</title></Helmet>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h1 className="text-4xl font-bold text-slate-900">Cajas</h1><p className="text-slate-600">Administra Cajas Menores y Mayores</p></div>
          {canAdd && <Button onClick={() => handleOpenDialog()} className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" /> Nueva Caja</Button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allAccounts.map(account => {
            const currentBalance = calculateCurrentBalance(account);
            const initialBalance = parseFloat(account.initial_balance);
            const difference = currentBalance - initialBalance;
            const isMain = account.isMain;
            return (
              <motion.div key={account.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={cn("p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow relative flex flex-col justify-between", isMain ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-slate-200")}>
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className={cn("p-3 rounded-lg", isMain ? "bg-emerald-100 text-emerald-700" : account.type === 'Mayor' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600')}>{isMain ? <Landmark className="w-6 h-6" /> : (account.type === 'Mayor' ? <Banknote className="w-6 h-6" /> : <Wallet className="w-6 h-6" />)}</div>
                    <div className="flex gap-2">
                      {(canEdit || (isReadOnly && canAdd)) && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600" onClick={() => handleOpenDialog(account)}><Edit2 className="w-4 h-4" /></Button>}
                      {canDelete && !isMain && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => handleDelete(account)}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">{account.name}{isMain && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">PRINCIPAL</span>}</h3>
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Tipo:</span><span className={cn("font-medium px-2 py-0.5 rounded text-xs", isMain ? "bg-emerald-100 text-emerald-700" : (account.type === 'Mayor' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'))}>Caja {account.type}</span></div>
                    <div className="flex justify-between text-sm items-center"><span className="text-slate-500">Cuenta Contable:</span><div className="flex flex-col items-end"><span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-bold">{account.accounting_account || 'N/A'}</span></div></div>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Saldo Inicial:</span><span className="font-mono text-slate-700">${initialBalance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</span></div>
                  {Math.abs(difference) > 0 && (<div className="flex justify-end text-xs items-center gap-1">{difference > 0 ? <span className="text-green-600 flex items-center bg-green-50 px-1.5 py-0.5 rounded"><TrendingUp className="w-3 h-3 mr-1" />+${difference.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span> : <span className="text-red-600 flex items-center bg-red-50 px-1.5 py-0.5 rounded"><TrendingDown className="w-3 h-3 mr-1" />-${Math.abs(difference).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>}</div>)}
                  <div className="flex justify-between items-end"><span className="text-slate-500 font-bold text-sm mb-1">Saldo Actual:</span><span className={`text-2xl font-bold ${currentBalance >= 0 ? 'text-slate-900' : 'text-red-600'}`}>${currentBalance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</span></div>
                </div>
              </motion.div>
            );
          })}
          {allAccounts.length === 0 && (<div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed"><Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>No hay cajas registradas</p></div>)}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingAccount ? `Editar ${editingAccount.isMain ? 'Caja Principal' : 'Caja'}` : 'Nueva Caja'}</DialogTitle></DialogHeader>
          {isReadOnly && editingAccount ? (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-lg flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5" />Modo Solo Lectura: No puedes modificar la configuración de las cajas.</div>
          ) : null}
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2"><Label>Nombre de la Caja (Uso interno)</Label><input required disabled={editingAccount?.isMain || isReadOnly} className="w-full px-3 py-2 border rounded-md disabled:bg-slate-100" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label><select className="w-full px-3 py-2 border rounded-md bg-white disabled:bg-slate-100" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} disabled={editingAccount?.isMain || isReadOnly}>{editingAccount?.isMain && <option value="Principal">Caja Principal</option>}<option value="Menor">Caja Menor</option><option value="Mayor">Caja Mayor</option></select></div>
              <div className="space-y-2"><Label>Fecha de Apertura / Saldo</Label><input type="date" required disabled={isReadOnly} className="w-full px-3 py-2 border rounded-md disabled:bg-slate-100" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
            </div>

            <div className="space-y-2">
              <Label>Saldo Inicial de Apertura ($)</Label>
              <input type="number" disabled={isReadOnly} className="w-full px-3 py-2 border rounded-md disabled:bg-slate-100" value={formData.initial_balance} onChange={e => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) })} />
            </div>

            {!editingAccount && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <Label className="block text-sm font-semibold text-slate-700">Origen de los Fondos Iniciales</Label>
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center space-x-2">
                    <input type="radio" id="opt_b" checked={formData.is_opening_balance} onChange={() => setFormData({ ...formData, is_opening_balance: true })} className="text-blue-600 focus:ring-blue-500" />
                    <Label htmlFor="opt_b" className="font-normal text-slate-700">Saldo inicial NO proviene de ninguna caja (Apertura contable)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="radio" id="opt_a" checked={!formData.is_opening_balance} onChange={() => setFormData({ ...formData, is_opening_balance: false })} className="text-blue-600 focus:ring-blue-500" />
                    <Label htmlFor="opt_a" className="font-normal text-slate-700">Saldo inicial proviene de otra caja/banco (Transferencia)</Label>
                  </div>
                </div>

                {!formData.is_opening_balance && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-2">
                    <Label className="text-xs text-slate-500 mb-1 block">Seleccionar Fuente (Se descontará el saldo inicial de allí)</Label>
                    <select value={fundingSource} onChange={e => setFundingSource(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                      <option value="">Seleccionar...</option>
                      <optgroup label="Cajas Principales">
                        <option value="caja_principal|CAJA PRINCIPAL">CAJA PRINCIPAL</option>
                      </optgroup>
                      {(bankAccounts && bankAccounts.length > 0) && (
                        <optgroup label="Bancos">
                          {bankAccounts.map(b => <option key={b.id} value={`${b.id}|${b.bankName}`}>{b.bankName}</option>)}
                        </optgroup>
                      )}
                      {(cashAccounts && cashAccounts.length > 0) && (
                        <optgroup label="Otras Cajas">
                          {cashAccounts.map(c => <option key={c.id} value={`${c.id}|${c.name}`}>{c.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </motion.div>
                )}
              </div>
            )}

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4"><h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Banknote className="w-4 h-4" /> Configuración Contable</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="space-y-2"><Label>Número de Cuenta</Label><input required disabled={isReadOnly || (editingAccount && !editingAccount.isMain)} className={cn("w-full px-3 py-2 border rounded-md font-mono", (isReadOnly || (editingAccount && !editingAccount.isMain)) ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "")} value={formData.accounting_account} onChange={e => setFormData({ ...formData, accounting_account: e.target.value.replace(/[^0-9]/g, '') })} /></div><div className="space-y-2"><Label>Concepto (Nombre PUC)</Label><input required disabled={isReadOnly} className="w-full px-3 py-2 border rounded-md disabled:bg-slate-100" value={formData.accounting_concept} onChange={e => setFormData({ ...formData, accounting_concept: e.target.value })} /></div></div></div>

            <DialogFooter><DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>{!isReadOnly && <Button type="submit">Guardar</Button>}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CashAccounts;