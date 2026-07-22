import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ArrowRightLeft, BookOpen, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// COMPONENTE: Buscador Inteligente para Cuentas Contables (Combobox)
// ============================================================================
const SearchableSelect = ({ options, value, onChange, placeholder, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    // Cerrar el menú si se hace clic afuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);
    const filteredOptions = options.filter(opt => 
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div 
                className={cn("w-full px-3 py-2 border rounded-lg bg-white cursor-pointer flex justify-between items-center text-sm transition-colors hover:bg-slate-50", className)}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={selectedOption ? "text-slate-900 font-medium" : "text-slate-500 truncate"}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </div>
            
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col overflow-hidden" style={{ maxHeight: '280px' }}>
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                            <input
                                type="text"
                                autoFocus
                                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                placeholder="Buscar por número o nombre..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar">
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                            <div 
                                key={opt.value}
                                className="px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors border-b border-slate-50 last:border-0"
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
                                {opt.label}
                            </div>
                        )) : (
                            <div className="px-3 py-6 text-sm text-slate-500 text-center flex flex-col items-center">
                                <Search className="w-6 h-6 text-slate-300 mb-2" />
                                No se encontraron cuentas
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
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

  const sortedAccounts = [...(chartOfAccounts || [])].sort((a, b) => a.number.localeCompare(b.number));
  
  // Preparar opciones para el buscador inteligente
  const searchableAccountOptions = sortedAccounts.map(acc => ({
      value: acc.name,
      label: `${acc.number} - ${acc.name}`
  }));

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
                  <SearchableSelect 
                      options={searchableAccountOptions}
                      value={debitAccount}
                      onChange={setDebitAccount}
                      placeholder="Buscar cuenta..."
                      className="border-purple-200 focus:ring-purple-500"
                  />
                  <p className="text-[10px] text-slate-500">Ej: Escribe '1524' o 'Muebles'</p>
                </div>
                <div className="space-y-2 relative">
                  <Label className="text-orange-700">Cuenta Crédito (Disminuye)</Label>
                  <SearchableSelect 
                      options={searchableAccountOptions}
                      value={creditAccount}
                      onChange={setCreditAccount}
                      placeholder="Buscar cuenta..."
                      className="border-orange-200 focus:ring-orange-500"
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