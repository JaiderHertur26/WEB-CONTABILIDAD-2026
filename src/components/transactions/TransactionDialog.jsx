import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useToast } from '@/components/ui/use-toast';
import { Check, ChevronsUpDown, AlertTriangle, Lock, FileText, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePermission } from '@/hooks/usePermission';
import ContactSelector from '@/components/transactions/ContactSelector';
import { format } from 'date-fns';
import { parseAccountingDate, toAccountingDateInput } from '@/lib/accountingDate';
import { defaultUsefulLifeYears, getFixedAssetAccounts, suggestDepreciationAccounts } from '@/lib/fixedAssetLifecycle';

// Utility component for highlighting text
const Highlight = ({ text, highlight }) => {
  if (!highlight || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>{parts.map((part, i) => part.toLowerCase() === highlight.toLowerCase() ? <span key={i} className="bg-yellow-200 text-slate-900 font-semibold rounded-sm px-0.5">{part}</span> : part)}</>
  );
};

// Enhanced Account Selector Component
const AccountSelector = ({ accounts, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedAccount = accounts.find(a => a.name === value);
  const filteredAccounts = accounts.filter(account => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (account.number.toLowerCase().includes(search) || account.name.toLowerCase().includes(search));
  });

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between bg-white border-slate-300 text-slate-900 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500">
          {selectedAccount ? (
            <span className="truncate flex items-center"><span className="font-mono text-xs text-slate-500 mr-2 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{selectedAccount.number}</span>{selectedAccount.name}</span>
          ) : (
            <span className="text-slate-500">Selecciona una cuenta contable...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-[60]" align="start">
        <Command shouldFilter={false} className="w-full">
          <CommandInput placeholder="Buscar por nombre o código..." value={searchQuery} onValueChange={setSearchQuery} className="h-10" />
          <CommandList className="max-h-[300px] overflow-y-auto">
            {filteredAccounts.length === 0 && (<div className="py-6 text-center text-sm text-slate-500">No se encontró la cuenta "{searchQuery}"</div>)}
            <CommandGroup>
              {filteredAccounts.map((account) => (
                <CommandItem key={account.id || account.number} value={account.name} onSelect={() => { onChange(account.name); setOpen(false); setSearchQuery(""); }} className="cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100">
                  <Check className={cn("mr-2 h-4 w-4 text-blue-600 flex-shrink-0", value === account.name ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col w-full min-w-0">
                    <div className="font-medium text-sm text-slate-900 truncate"><Highlight text={account.name} highlight={searchQuery} /></div>
                    <div className="text-xs text-slate-500 font-mono truncate"><Highlight text={account.number} highlight={searchQuery} /></div>
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

const TransactionDialog = ({ open, onOpenChange, transaction, onSave }) => {
  const { canEdit, canAdd } = usePermission();
  const isEditing = !!transaction;
  const isReadOnly = isEditing && !canEdit;

  const [formData, setFormData] = useState({
    date: toAccountingDateInput(new Date()),
    description: '',
    amount: '',
    type: 'income',
    category: '',
    contactId: '',
    destination: 'caja_principal|CAJA PRINCIPAL',
    isFixedAsset: false,
    fixedAssetAccountCode: '',
    fixedAssetAccountName: '',
    fixedAssetUsefulLifeYears: 10,
    fixedAssetResidualValue: 0,
    fixedAssetModel: '',
    fixedAssetLocation: '',
    fixedAssetAccumulatedDepreciationAccountCode: '',
    fixedAssetAccumulatedDepreciationAccountName: '',
    fixedAssetDepreciationExpenseAccountCode: '',
    fixedAssetDepreciationExpenseAccountName: '',
    allocations: [{ id: 'allocation-1', category: '', amount: '' }],
  });
  
  const [registerAsInvoice, setRegisterAsInvoice] = useState(false);

  const [accounts] = useCompanyData('accounts');
  const [contacts] = useCompanyData('contacts');
  const [bankAccounts] = useCompanyData('bankAccounts');
  const [cashAccounts] = useCompanyData('cash_accounts');
  const [invoices, saveInvoices] = useCompanyData('invoices');
  const [purchaseInvoices, savePurchaseInvoices] = useCompanyData('purchase_invoices');
  const { toast } = useToast();

  useEffect(() => {
    if (transaction) {
      const existingAllocations = Array.isArray(transaction.allocations) && transaction.allocations.length > 0
        ? transaction.allocations.map((line, index) => ({
            id: line.id || `allocation-${index + 1}`,
            category: line.category || '',
            amount: line.amount ?? '',
          }))
        : [{
            id: 'allocation-1',
            category: transaction.category || '',
            amount: transaction.amount ?? '',
          }];

      setFormData({
        ...transaction,
        date: toAccountingDateInput(transaction.date),
        destination: transaction.destination || 'caja_principal|CAJA PRINCIPAL',
        allocations: existingAllocations,
      });
    } else {
      setFormData({
        date: toAccountingDateInput(new Date()),
        description: '',
        amount: '',
        type: 'income',
        category: '',
        contactId: '',
        destination: 'caja_principal|CAJA PRINCIPAL',
isFixedAsset: false,
        fixedAssetAccountCode: '',
        fixedAssetAccountName: '',
        fixedAssetUsefulLifeYears: 10,
        fixedAssetResidualValue: 0,
        fixedAssetModel: '',
        fixedAssetLocation: '',
        fixedAssetAccumulatedDepreciationAccountCode: '',
        fixedAssetAccumulatedDepreciationAccountName: '',
        fixedAssetDepreciationExpenseAccountCode: '',
        fixedAssetDepreciationExpenseAccountName: '',
        allocations: [{ id: 'allocation-1', category: '', amount: '' }],
      });
    }
    setRegisterAsInvoice(false);
  }, [transaction, open]);

  const updateAllocation = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      allocations: prev.allocations.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      ),
    }));
  };

  const addAllocation = () => {
    setFormData(prev => ({
      ...prev,
      allocations: [
        ...prev.allocations,
        { id: `allocation-${Date.now()}`, category: '', amount: '' },
      ],
    }));
  };

  const removeAllocation = (index) => {
    setFormData(prev => ({
      ...prev,
      allocations: prev.allocations.length === 1
        ? prev.allocations
        : prev.allocations.filter((_, lineIndex) => lineIndex !== index),
    }));
  };

  const allocationTotal = (formData.allocations || []).reduce(
    (sum, line) => sum + (Number(line.amount) || 0),
    0
  );

  const fixedAssetAccounts = React.useMemo(
    () => getFixedAssetAccounts(accounts || []),
    [accounts]
  );

  const handleFixedAssetAccountChange = (code) => {
    const selected = fixedAssetAccounts.find(account => String(account.number) === String(code));
    if (!selected) return;
    const suggested = suggestDepreciationAccounts(selected, accounts || []);

    setFormData(prev => {
      const currentTotal = (prev.allocations || []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
      const next = {
        ...prev,
        fixedAssetAccountCode: selected.number,
        fixedAssetAccountName: selected.name,
        fixedAssetUsefulLifeYears: defaultUsefulLifeYears(selected.number),
        fixedAssetAccumulatedDepreciationAccountCode: suggested.accumulated?.number || '',
        fixedAssetAccumulatedDepreciationAccountName: suggested.accumulated?.name || '',
        fixedAssetDepreciationExpenseAccountCode: suggested.expense?.number || '',
        fixedAssetDepreciationExpenseAccountName: suggested.expense?.name || '',
      };

      if (prev.type === 'expense') {
        next.allocations = [{
          id: prev.allocations?.[0]?.id || 'allocation-1',
          category: selected.name,
          amount: currentTotal || prev.allocations?.[0]?.amount || '',
        }];
      }
      return next;
    });
  };

  const handleTypeChange = (type) => {
    setFormData(prev => {
      if (!prev.isFixedAsset) return { ...prev, type };
      const currentTotal = (prev.allocations || []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
      if (type === 'income') {
        return {
          ...prev,
          type,
          destination: '',
          allocations: [{ id: prev.allocations?.[0]?.id || 'allocation-1', category: '', amount: currentTotal || '' }],
        };
      }
      const selected = fixedAssetAccounts.find(account => String(account.number) === String(prev.fixedAssetAccountCode));
      return {
        ...prev,
        type,
        destination: prev.destination || 'caja_principal|CAJA PRINCIPAL',
        allocations: [{
          id: prev.allocations?.[0]?.id || 'allocation-1',
          category: selected?.name || '',
          amount: currentTotal || '',
        }],
      };
    });
  };

  const handleFixedAssetToggle = (checked) => {
    setFormData(prev => ({
      ...prev,
      isFixedAsset: checked,
      destination: checked && prev.type === 'income'
        ? ''
        : (!checked && !prev.destination ? 'caja_principal|CAJA PRINCIPAL' : prev.destination),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isReadOnly) return;

    const normalizedAllocations = (formData.allocations || []).map((line, index) => {
      const account = (accounts || []).find(a => a.name === line.category);
      const isAssetDebitLine = formData.isFixedAsset && formData.type === 'expense' && index === 0;
      return {
        id: line.id || `allocation-${index + 1}`,
        category: isAssetDebitLine ? formData.fixedAssetAccountName : line.category,
        amount: Number(line.amount) || 0,
        accountNumber: isAssetDebitLine ? formData.fixedAssetAccountCode : (account?.number || ''),
      };
    });

    if (
      normalizedAllocations.length === 0 ||
      normalizedAllocations.some(line => !line.category || line.amount <= 0)
    ) {
      toast({ variant: "destructive", title: "Distribución incompleta", description: "Cada línea debe tener una cuenta contable y un valor mayor que cero." });
      return;
    }

    if (formData.isFixedAsset) {
      if (!formData.fixedAssetAccountCode || !formData.fixedAssetAccountName) {
        toast({ variant: "destructive", title: "Cuenta del activo requerida", description: "Selecciona la cuenta PUC a la que quedará vinculado el activo fijo." });
        return;
      }
      if (normalizedAllocations.length !== 1) {
        toast({ variant: "destructive", title: "Asiento del activo incompleto", description: "El alta del activo debe tener una sola cuenta de contrapartida en esta transacción." });
        return;
      }
      if (formData.type === 'income') {
        const counterpartCode = String(normalizedAllocations[0].accountNumber || '');
        if (counterpartCode === String(formData.fixedAssetAccountCode || '')) {
          toast({ variant: "destructive", title: "Contrapartida inválida", description: "En un ingreso de activo fijo, selecciona como contrapartida la cuenta de ingreso, donación o patrimonio correspondiente." });
          return;
        }
        if (!counterpartCode.startsWith('3') && !counterpartCode.startsWith('4')) {
          toast({ variant: "destructive", title: "Contrapartida no permitida", description: "Para una incorporación en especie usa una cuenta de patrimonio/donación (clase 3) o de ingreso (clase 4)." });
          return;
        }
      }
    }

    if (!formData.destination && !(formData.isFixedAsset && formData.type === 'income')) {
      toast({ variant: "destructive", title: "Campo Requerido", description: "Por favor, selecciona un Origen/Destino." });
      return;
    }

    const dataToSave = {
      ...formData,
      destination: formData.isFixedAsset && formData.type === 'income' ? '' : formData.destination,
      allocations: normalizedAllocations,
      amount: normalizedAllocations.reduce((sum, line) => sum + line.amount, 0),
      category: normalizedAllocations[0].category,
      _accountNumber: normalizedAllocations[0].accountNumber || '',
    };
    
    // Ensure ID exists for linking
    if (!dataToSave.id) {
        dataToSave.id = crypto.randomUUID();
    }

    // =======================================================================
    // INYECTAR EL NOMBRE REAL DEL CONTACTO ANTES DE GUARDAR
    // =======================================================================
    if (dataToSave.contactId) {
        const foundContact = contacts?.find(c => String(c.id) === String(dataToSave.contactId));
        if (foundContact) {
            dataToSave.contact = foundContact.name;
        }
    } else {
        dataToSave.contact = '';
    }
    // =======================================================================

    if (registerAsInvoice && !isEditing) {
        if (!dataToSave.contactId) {
             toast({ variant: "destructive", title: "Contacto Requerido", description: "Para registrar como factura, debes seleccionar un contacto." });
             return;
        }

        try {
            const isExpense = dataToSave.type === 'expense';
            const targetCollection = isExpense ? purchaseInvoices : invoices;
            const saveTarget = isExpense ? savePurchaseInvoices : saveInvoices;
            const prefix = isExpense ? 'GAS' : 'ING';
            
            // Calculate ID based on existing length + 1
            const count = (targetCollection || []).length + 1;
            const invoiceNumber = `${prefix}-${String(count).padStart(5, '0')}`;
            
            const contact = contacts.find(c => c.id === dataToSave.contactId) || { name: 'Desconocido', id: dataToSave.contactId };
            
            const newInvoice = {
                id: `inv-tx-${Date.now()}`,
                type: dataToSave.type, // 'income' or 'expense'
                sourceType: 'transaction',
                transactionId: dataToSave.id,
                invoiceNumber: invoiceNumber,
                createdAt: new Date().toISOString(),
                // Map based on type for InvoiceDetail compatibility
                clientData: !isExpense ? contact : undefined,
                supplierData: isExpense ? contact : undefined,
                items: dataToSave.allocations.map(line => ({
                    description: `${dataToSave.description} · ${line.category}`,
                    productName: line.category,
                    productQuantity: 1,
                    amount: line.amount,
                    date: dataToSave.date
                })),
                total: dataToSave.amount,
                status: 'issued',
                dateRange: format(parseAccountingDate(dataToSave.date), 'dd/MM/yyyy')
            };
            
            saveTarget([...(targetCollection || []), newInvoice]);
            toast({ title: "Documento Generado", description: `Se creó la factura ${invoiceNumber} asociada.` });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error al crear factura", description: "La transacción se guardará, pero falló la creación de factura." });
        }
    }

    onSave(dataToSave);
  };
  
  const sortedAccounts = React.useMemo(() => {
      return [...(accounts || [])].sort((a, b) => String(a.number || '').localeCompare(String(b.number || '')));
  }, [accounts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-2xl font-bold text-slate-900">{isEditing ? 'Editar' : 'Nueva'} Transacción</DialogTitle>
            {isReadOnly && <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full flex items-center border border-slate-200"><Lock className="w-3 h-3 mr-1"/> Solo Lectura</span>}
          </div>
        </DialogHeader>
        
        {isReadOnly && (
             <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg flex items-center gap-2">
                 <AlertTriangle className="w-4 h-4" />
                 No tienes permisos para editar transacciones existentes.
             </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type" className="text-slate-700">Tipo</Label>
              <select id="type" disabled={isReadOnly} value={formData.type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-500">
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date" className="text-slate-700">Fecha</Label>
              <input id="date" type="date" required disabled={isReadOnly} value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-700">Descripción</Label>
            <input id="description" required disabled={isReadOnly} placeholder="Detalle de la transacción..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500" />
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-slate-800 font-semibold">Distribución contable</Label>
                <p className="text-xs text-slate-500 mt-0.5">Agrega una o varias cuentas dentro de la misma transacción.</p>
              </div>
              {!isReadOnly && !formData.isFixedAsset && (
                <Button type="button" variant="outline" size="sm" onClick={addAllocation} className="bg-white">
                  <Plus className="w-4 h-4 mr-1" /> Agregar cuenta
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {(formData.allocations || []).map((line, index) => (
                <div key={line.id || index} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_170px_40px] gap-2 items-end rounded-lg bg-white border border-slate-200 p-3">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs text-slate-600">{formData.isFixedAsset && formData.type === 'income' ? 'Contrapartida contable' : formData.isFixedAsset ? 'Cuenta del activo' : `Cuenta ${index + 1}`}</Label>
                    <AccountSelector
                      accounts={sortedAccounts}
                      value={line.category}
                      onChange={(val) => updateAllocation(index, 'category', val)}
                      disabled={isReadOnly || (formData.isFixedAsset && formData.type === 'expense')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-600">Valor</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        disabled={isReadOnly}
                        value={line.amount}
                        onChange={(e) => updateAllocation(index, 'amount', e.target.value)}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isReadOnly || formData.allocations.length === 1}
                    onClick={() => removeAllocation(index)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                    title="Quitar cuenta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm font-medium text-slate-600">Total de la transacción</span>
              <span className="text-lg font-bold text-slate-900">
                $ {allocationTotal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {formData.isFixedAsset && formData.type === 'income' ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <Label className="text-violet-800">Ingreso de activo en especie</Label>
                <p className="mt-1 text-xs text-violet-700">No afecta Caja ni Bancos. El bien se debita a su cuenta PUC y la cuenta seleccionada arriba será la contrapartida contable.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="destination" className="text-slate-700">Origen/Destino</Label>
                <select id="destination" required disabled={isReadOnly} value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-500">
                  <optgroup label="Cajas Principales">
                    <option value="caja_principal|CAJA PRINCIPAL">CAJA PRINCIPAL</option>
                  </optgroup>
                  {(bankAccounts && bankAccounts.length > 0) && (
                    <optgroup label="Bancos">
                      {bankAccounts.map(b_acc => (
                        <option key={b_acc.id} value={`${b_acc.id}|${b_acc.bankName}`}>{b_acc.bankName}</option>
                      ))}
                    </optgroup>
                  )}
                  {(cashAccounts && cashAccounts.length > 0) && (
                    <optgroup label="Cajas Menores y Mayores">
                      {cashAccounts.map(c_acc => (
                        <option key={c_acc.id} value={`${c_acc.id}|${c_acc.name}`}>{c_acc.name} ({c_acc.type})</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="contactId" className="text-slate-700">Contacto (Opcional)</Label>
              <ContactSelector
                contacts={contacts || []}
                value={formData.contactId}
                onChange={(val) => setFormData({ ...formData, contactId: val })}
                disabled={isReadOnly}
                placeholder="Seleccionar contacto..."
              />
            </div>
          </div>

          {!isEditing && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center space-x-2">
                    <input 
                        type="checkbox" 
                        id="registerAsInvoice" 
                        checked={registerAsInvoice} 
                        onChange={(e) => setRegisterAsInvoice(e.target.checked)} 
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                    />
                    <Label htmlFor="registerAsInvoice" className="text-sm font-medium text-slate-700 cursor-pointer flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-500" /> Registrar como Factura / Soporte
                    </Label>
                  </div>
                  {registerAsInvoice && (
                      <p className="text-xs text-slate-500 mt-1 ml-6">
                          Se generará automáticamente un documento en el módulo de Facturación con los datos de esta transacción.
                      </p>
                  )}
              </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2">
              <input type="checkbox" id="isFixedAsset" disabled={isReadOnly} checked={formData.isFixedAsset} onChange={(e) => handleFixedAssetToggle(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50" />
              <div>
                <Label htmlFor="isFixedAsset" className="cursor-pointer text-sm font-semibold text-slate-800">¿Esta transacción incorpora un Activo Fijo?</Label>
                <p className="mt-0.5 text-xs text-slate-500">Registrará el bien en Activos Fijos y lo vinculará al asiento contable. Disponible tanto para compras como para incorporaciones en especie.</p>
              </div>
            </div>

            {formData.isFixedAsset && (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">Cuenta del Activo (PUC) *</Label>
                  <select value={formData.fixedAssetAccountCode || ''} onChange={(e) => handleFixedAssetAccountChange(e.target.value)} disabled={isReadOnly} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Seleccionar cuenta del activo...</option>
                    {fixedAssetAccounts.map(account => <option key={account.id || account.number} value={account.number}>{account.number} · {account.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Vida útil (años)</Label>
                  <input type="number" min="0" step="1" value={formData.fixedAssetUsefulLifeYears ?? 10} onChange={(e) => setFormData({...formData, fixedAssetUsefulLifeYears: e.target.value})} disabled={isReadOnly} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Valor residual</Label>
                  <input type="number" min="0" step="0.01" value={formData.fixedAssetResidualValue || 0} onChange={(e) => setFormData({...formData, fixedAssetResidualValue: e.target.value})} disabled={isReadOnly} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Marca / Modelo / Serie</Label>
                  <input value={formData.fixedAssetModel || ''} onChange={(e) => setFormData({...formData, fixedAssetModel: e.target.value})} disabled={isReadOnly} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Ubicación del bien</Label>
                  <input value={formData.fixedAssetLocation || ''} onChange={(e) => setFormData({...formData, fixedAssetLocation: e.target.value})} disabled={isReadOnly} placeholder="Templo, despacho, casa cural..." className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </div>
                {formData.fixedAssetAccountCode && (
                  <div className="sm:col-span-2 rounded-lg border border-violet-100 bg-white p-3 text-xs text-slate-600">
                    <span className="font-semibold text-violet-700">Vinculación contable:</span> {formData.fixedAssetAccountCode} · {formData.fixedAssetAccountName}
                    {formData.fixedAssetDepreciationExpenseAccountCode && <span> · Gasto dep. {formData.fixedAssetDepreciationExpenseAccountCode}</span>}
                    {formData.fixedAssetAccumulatedDepreciationAccountCode && <span> · Dep. acum. {formData.fixedAssetAccumulatedDepreciationAccountCode}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2">
            <DialogClose asChild><Button type="button" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50">Cancelar</Button></DialogClose>
            {!isReadOnly && <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white shadow-md">{isEditing ? 'Guardar Cambios' : 'Crear Transacción'}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionDialog;