import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ArrowRightLeft, BookOpen, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ============================================================================
// COMPONENTE: Buscador Inteligente basado en Popover y Command (Sin Errores de Foco)
// ============================================================================
const Highlight = ({ text, highlight }) => {
  if (!highlight || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>{parts.map((part, i) => part.toLowerCase() === highlight.toLowerCase() ? <span key={i} className="bg-yellow-200 text-slate-900 font-semibold rounded-sm px-0.5">{part}</span> : part)}</>
  );
};

const AccountSelector = ({ accounts, value, onChange, placeholder, borderColorClass }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const selectedAccount = accounts.find(a => a.name === value);
  const filteredAccounts = accounts.filter(account => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (String(account.number).toLowerCase().includes(search) || String(account.name).toLowerCase().includes(search));
  });

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button 
            variant="outline" 
            role="combobox" 
            aria-expanded={open} 
            className={cn("w-full justify-between bg-white text-slate-900 hover:bg-slate-50", borderColorClass)}
        >
          {selectedAccount ? (
            <span className="truncate flex items-center">
                <span className="font-mono text-xs text-slate-500 mr-2 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {selectedAccount.number}
                </span>
                {selectedAccount.name}
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-[9999]" align="start">
        <Command shouldFilter={false} className="w-full">
          <CommandInput placeholder="Buscar por nombre o código..." value={searchQuery} onValueChange={setSearchQuery} className="h-10" />
          <CommandList className="max-h-[300px] overflow-y-auto">
            {filteredAccounts.length === 0 && (<div className="py-6 text-center text-sm text-slate-500">No se encontró la cuenta</div>)}
            <CommandGroup>
              {filteredAccounts.map((account) => (
                <CommandItem 
                    key={account.id || account.number} 
                    value={account.name} 
                    onSelect={() => { 
                        onChange(account.name); 
                        setOpen(false); 
                        setSearchQuery(""); 
                    }} 
                    className="cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100"
                >
                  <Check className={cn("mr-2 h-4 w-4 text-blue-600 flex-shrink-0", value === account.name ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col w-full min-w-0">
                    <div className="font-medium text-sm text-slate-900 truncate">
                        <Highlight text={account.name} highlight={searchQuery} />
                    </div>
                    <div className="text-xs text-slate-500 font-mono truncate">
                        <Highlight text={String(account.number)} highlight={searchQuery} />
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL: InternalTransferDialog
// ============================================================================
const InternalTransferDialog = ({ open, onOpenChange, onSave }) => {
  const [mode, setMode] = useState('money'); // 'money' o 'accounting'
  
  // Campos comunes
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');

  // Campos para modo Dinero
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  
  // Campos para modo Cruce Contable
  const [debitAccount, setDebitAccount] = useState('');
  const [creditAccount, setCreditAccount] = useState('');

  const [bankAccounts] = useCompanyData('bankAccounts');
  const [cashAccounts] = useCompanyData('cash_accounts');
  const [chartOfAccounts] = useCompanyData('accounts');
  const { toast } = useToast();

  const accountOptions = [
    { value: 'caja_principal|CAJA PRINCIPAL', label: 'CAJA PRINCIPAL' },
    ...(bankAccounts || []).map(acc => ({
      value: `${acc.id}|${acc.bankName}`,
      label: `Banco: ${acc.bankName}`,
    })),
    ...(cashAccounts || []).map(acc => ({
      value: `${acc.id}|${acc.name}`,
      label: `Caja: ${acc.name} (${acc.type})`,
    })),
  ];

  const sortedAccounts = React.useMemo(() => {
      return [...(chartOfAccounts || [])].sort((a, b) => String(a.number).localeCompare(String(b.number)));
  }, [chartOfAccounts]);

  useEffect(() => {
    if (open) {
      setMode('money');
      setAmount('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setDescription('');
      setFromAccount('');
      setToAccount('');
      setDebitAccount('');
      setCreditAccount('');
    }
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'money') {
      if (!fromAccount || !toAccount) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar una cuenta de origen y destino.' });
        return;
      }
      if (fromAccount === toAccount) {
        toast({ variant: 'destructive', title: 'Error', description: 'La cuenta de origen y destino no pueden ser la misma.' });
        return;
      }
      onSave({ isAccounting: false, fromAccount, toAccount, amount, date, description });
    } else {
      if (!debitAccount || !creditAccount) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar las cuentas contables Débito y Crédito.' });
        return;
      }
      if (debitAccount === creditAccount) {
        toast({ variant: 'destructive', title: 'Error', description: 'La cuenta Débito y Crédito no pueden ser la misma.' });
        return;
      }
      onSave({ isAccounting: true, debitAccount, creditAccount, amount, date, description });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Nueva Transferencia / Cruce</DialogTitle>
        </DialogHeader>
        
        {/* Selector de Modo */}
        <div className="flex gap-2 mb-2 bg-slate-100 p-1 rounded-lg">
            <button type="button" onClick={() => setMode('money')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${mode === 'money' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                <ArrowRightLeft className="w-4 h-4 mr-2"/>Movimiento Dinero
            </button>
            <button type="button" onClick={() => setMode('accounting')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center ${mode === 'accounting' ? 'bg-white shadow text-purple-600' : 'text-slate-600 hover:text-slate-900'}`}>
                <BookOpen className="w-4 h-4 mr-2"/>Cruce Contable PUC
            </button>
        </div>

        <p className="text-sm text-slate-600 mb-2">
            {mode === 'money' 
                ? "Mueve dinero físico entre tus Cajas y Cuentas Bancarias."
                : "Realiza ajustes entre cuentas del PUC sin afectar el saldo de tus bancos."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descripción / Concepto</Label>
            <input id="description" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={mode === 'money' ? "Ej: Consignación a banco" : "Ej: Cruce de anticipo a construcción terminada"} />
          </div>

          {mode === 'money' ? (
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="space-y-2">
                  <Label htmlFor="fromAccount" className="text-blue-700">Desde (Origen)</Label>
                  <select id="fromAccount" required value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white">
                    <option value="" disabled>Seleccionar origen</option>
                    {accountOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toAccount" className="text-green-700">Hacia (Destino)</Label>
                  <select id="toAccount" required value={toAccount} onChange={(e) => setToAccount(e.target.value)} className="w-full px-3 py-2 border border-green-200 rounded-lg bg-white">
                    <option value="" disabled>Seleccionar destino</option>
                    {accountOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
          ) : (
              <div className="grid grid-cols-1 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="space-y-2 relative">
                  <Label className="text-purple-700">Cuenta Débito (Aumenta)</Label>
                  <AccountSelector 
                      accounts={sortedAccounts}
                      value={debitAccount}
                      onChange={setDebitAccount}
                      placeholder="Buscar cuenta Débito..."
                      borderColorClass="border-purple-300"
                  />
                  <p className="text-[10px] text-slate-500">Ej: Escribe '1524' o 'Muebles'</p>
                </div>
                <div className="space-y-2 relative">
                  <Label className="text-orange-700">Cuenta Crédito (Disminuye)</Label>
                  <AccountSelector 
                      accounts={sortedAccounts}
                      value={creditAccount}
                      onChange={setCreditAccount}
                      placeholder="Buscar cuenta Crédito..."
                      borderColorClass="border-orange-300"
                  />
                  <p className="text-[10px] text-slate-500">Ej: Escribe '4245' o 'Donaciones'</p>
                </div>
              </div>
          )}

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label htmlFor="amount">Monto</Label>
                <input id="amount" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
             </div>
             <div className="space-y-2">
                <Label htmlFor="date">Fecha</Label>
                <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
             </div>
          </div>
          
          <DialogFooter className="pt-4">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit" className={mode === 'money' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}>
                {mode === 'money' ? 'Registrar Movimiento' : 'Aplicar Cruce'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InternalTransferDialog;