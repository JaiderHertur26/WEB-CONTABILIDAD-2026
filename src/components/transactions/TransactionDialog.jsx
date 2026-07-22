import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useToast } from '@/components/ui/use-toast';
import { Check, ChevronsUpDown, AlertTriangle, Lock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePermission } from '@/hooks/usePermission';
import ContactSelector from '@/components/transactions/ContactSelector';
import { format } from 'date-fns';

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
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: 'income',
    category: '',
    contactId: '',
    destination: 'caja_principal|CAJA PRINCIPAL',
    isFixedAsset: false,
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
      setFormData({
        ...transaction,
        date: new Date(transaction.date).toISOString().split('T')[0],
        destination: transaction.destination || 'caja_principal|CAJA PRINCIPAL',
      });
    } else {
      setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        type: 'income',
        category: '',
        contactId: '',
        destination: 'caja_principal|CAJA PRINCIPAL',
        isFixedAsset: false,
      });
    }
    setRegisterAsInvoice(false);
  }, [transaction, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!formData.category) {
      toast({ variant: "destructive", title: "Campo Requerido", description: "Por favor, selecciona una categoría contable." });
      return;
    }
    if (!formData.destination) {
      toast({ variant: "destructive", title: "Campo Requerido", description: "Por favor, selecciona un Origen/Destino." });
      return;
    }

    const dataToSave = { ...formData };
    
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
                items: [{
                    description: dataToSave.description,
                    productName: dataToSave.description,
                    productQuantity: 1,
                    amount: dataToSave.amount,
                    date: dataToSave.date
                }],
                total: dataToSave.amount,
                status: 'issued',
                dateRange: format(new Date(dataToSave.date), 'dd/MM/yyyy')
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
      return (accounts || []).sort((a, b) => a.number.localeCompare(b.number));
  }, [accounts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type" className="text-slate-700">Tipo</Label>
              <select id="type" disabled={isReadOnly} value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-500">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 flex flex-col">
                <Label className="text-slate-700 mb-2">Categoría (Cuenta Contable)</Label>
                <div className="w-full relative z-50">
                  <AccountSelector accounts={sortedAccounts} value={formData.category} onChange={(val) => setFormData({ ...formData, category: val })} disabled={isReadOnly} />
                </div>
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-slate-700">Monto</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">$</span>
                <input id="amount" type="number" step="0.01" required disabled={isReadOnly} value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500" />
              </div>
            </div>
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

          {formData.type === 'expense' && !registerAsInvoice && (
            <div className="flex items-center space-x-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <input type="checkbox" id="isFixedAsset" disabled={isReadOnly} checked={formData.isFixedAsset} onChange={(e) => setFormData({ ...formData, isFixedAsset: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
              <Label htmlFor="isFixedAsset" className="text-sm font-medium text-slate-700 cursor-pointer disabled:cursor-not-allowed">
                ¿Es un Activo Fijo? <span className="text-slate-400 font-normal">(Creará item en inventario)</span>
              </Label>
            </div>
          )}

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