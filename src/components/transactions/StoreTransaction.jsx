import { getAccountingYear } from '@/lib/accountingDate';
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/components/ui/use-toast';
import { ShoppingCart, PackagePlus, Check, ChevronsUpDown, User } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import ContactSelector from '@/components/transactions/ContactSelector';
import { ensureProductCodes, productMatchesCode, productSearchText, sanitizeProductCode } from '@/lib/productCodes';

const PREDEFINED_CATEGORIES = ['Electrónica', 'Oficina', 'Alimentos', 'Ropa', 'Otros'];
const PREDEFINED_UNITS = ['Unidad', 'Caja', 'Kg', 'Litro', 'Metro'];


const ProductSelector = ({ products, value, onChange }) => {
    const [open, setOpen] = useState(false);
    
    // Sort products by name and ensure valid data
    const sortedProducts = useMemo(() => {
        if (!products || !Array.isArray(products)) return [];
        return [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [products]);

    const selectedProduct = products?.find(p => p.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button 
                    variant="outline" 
                    role="combobox" 
                    aria-expanded={open} 
                    className="w-full justify-between bg-white text-left font-normal"
                >
                    {selectedProduct ? (
                        <span className="truncate font-medium text-slate-900">{selectedProduct.name}</span>
                    ) : (
                        <span className="text-slate-500">Seleccionar producto...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-[9999]" align="start">
                <Command>
                    <CommandInput placeholder="Buscar producto disponible..." />
                    <CommandList>
                        <CommandEmpty>No se encontraron productos disponibles.</CommandEmpty>
                        <CommandGroup heading="Inventario Disponible">
                            {sortedProducts.map(p => (
                                <CommandItem 
                                    key={p.id} 
                                    value={productSearchText(p)}
                                    onSelect={() => { 
                                        onChange(p.id); 
                                        setOpen(false); 
                                    }}
                                    className="cursor-pointer"
                                >
                                    <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col w-full">
                                        <span className="font-medium text-slate-900">{p.name}</span>
                                        <span className="font-mono text-[11px] text-blue-600">{p.sku} · {p.barcode}</span>
                                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                                            <span>Disp: <span className="font-semibold text-slate-700">{p.quantity} {p.unit}</span></span>
                                            <span>Precio: ${parseFloat(p.suggested_price || 0).toLocaleString()}</span>
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

// Reused Account Selector Logic
const AccountSelector = ({ accounts, value, onChange, placeholder, prefixFilter }) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Find currently selected account
    const selectedAccount = accounts?.find(a => 
        a.name === value || a.id === value || `${a.id}|${a.name}` === value || a.name === value?.split('|')[1]
    );
    
    // Normalize value for display if exact object match failed
    const displayValue = selectedAccount 
        ? `${selectedAccount.number} - ${selectedAccount.name}` 
        : (value && value.includes('|') ? value.split('|')[1] : value);

    const filteredAccounts = (accounts || []).filter(account => {
        if (prefixFilter) {
            // Support single prefix or array of prefixes
            const prefixes = Array.isArray(prefixFilter) ? prefixFilter : [prefixFilter];
            if (!prefixes.some(p => account.number.startsWith(p))) return false;
        }
        
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

    const getCategoryName = (code) => {
        const categories = {
          '1': 'ACTIVOS', '2': 'PASIVOS', '3': 'PATRIMONIO', '4': 'INGRESOS',
          '5': 'GASTOS', '6': 'COSTOS DE VENTAS', '7': 'COSTOS DE PRODUCCIÓN'
        };
        return categories[code] || 'OTRAS';
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal bg-white">
                    {displayValue ? (
                        <span className="truncate">{displayValue}</span>
                    ) : (
                        <span className="text-slate-500">{placeholder || "Seleccionar Cuenta..."}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[350px] p-0 z-[9999]"
                align="start"
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                <Command shouldFilter={false} className="w-full">
                    <CommandInput placeholder="Buscar cuenta..." value={searchQuery} onValueChange={setSearchQuery} />
                    <CommandList className="max-h-[300px]">
                        {Object.keys(groupedAccounts).sort().map(code => (
                            <CommandGroup key={code} heading={`${code} - ${getCategoryName(code)}`}>
                                {groupedAccounts[code].map((account) => (
                                    <CommandItem 
                                        key={account.id} 
                                        value={account.name} 
                                        onSelect={() => { 
                                            // Store as ID|Name for consistency with other parts of app
                                            onChange(account.name); // Using name as value primarily for compatibility
                                            setOpen(false); 
                                        }}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", (value === account.name || value?.includes(account.name)) ? "opacity-100" : "opacity-0")} />
                                        <div className="flex flex-col">
                                            <span>{account.name}</span>
                                            <span className="text-xs text-slate-500">{account.number}</span>
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

const StoreTransaction = ({ open, onOpenChange }) => {
    const { canAdd } = usePermission();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('sale');
    
    // Data Hooks
    const [products, saveProducts] = useCompanyData('inventory');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [bankAccounts] = useCompanyData('bankAccounts');
    // FIXED: Changed key from 'cashAccounts' to 'cash_accounts' to match TransactionDialog.jsx
    const [cashAccounts] = useCompanyData('cash_accounts'); 
    const [accounts] = useCompanyData('accounts');
    const [contacts] = useCompanyData('contacts');
    
    // Common State
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [cashAccount, setCashAccount] = useState('caja_principal|CAJA PRINCIPAL');

    // Purchase Tab State (Manual Entry)
    const [prodName, setProdName] = useState('');
    const [prodDesc, setProdDesc] = useState('');
    const [prodCategory, setProdCategory] = useState(PREDEFINED_CATEGORIES[0]);
    const [prodUnit, setProdUnit] = useState(PREDEFINED_UNITS[0]);
    const [prodCost, setProdCost] = useState('');
    const [prodQty, setProdQty] = useState('');
    const [prodSku, setProdSku] = useState('');
    const [purchaseAccount, setPurchaseAccount] = useState(''); // New: Inventory Account
    const [selectedPurchaseContactId, setSelectedPurchaseContactId] = useState(''); // New: Contact ID for Purchase

    // Sale Tab State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [saleQty, setSaleQty] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [saleCode, setSaleCode] = useState('');
    const [incomeAccount, setIncomeAccount] = useState(''); // New: Revenue Account
    
    // Contact State (Replaces individual doc fields)
    const [selectedContactId, setSelectedContactId] = useState('');

    const availableProducts = useMemo(() => {
        if (!products || !Array.isArray(products)) return [];
        return products.map(ensureProductCodes).filter(p => {
            const quantity = parseFloat(p.quantity || 0);
            return !isNaN(quantity) && quantity > 0;
        });
    }, [products]);

    // Computed
    const selectedProductForSale = useMemo(() => {
        return availableProducts.find(p => p.id === selectedProductId);
    }, [availableProducts, selectedProductId]);

    const selectedContact = contacts?.find(c => c.id === selectedContactId);

    useEffect(() => {
        if (!canAdd || !Array.isArray(products) || !products.some(p => !p.sku || !p.barcode)) return;
        saveProducts(products.map(ensureProductCodes));
    }, [products, canAdd, saveProducts]);

    const resolveSaleCode = (rawCode, notify = false) => {
        const code = sanitizeProductCode(rawCode);
        if (!code) return false;
        const match = availableProducts.find(p => productMatchesCode(p, code));
        if (match) {
            setSelectedProductId(match.id);
            setSaleCode(match.barcode || match.sku);
            return true;
        }
        if (notify) toast({ variant:'destructive', title:'Código no encontrado', description:'No existe un producto disponible con ese SKU o código de barras.' });
        return false;
    };

    // Update Sale Price and Defaults when product selected
    useEffect(() => {
        if (selectedProductForSale) {
            setSalePrice(selectedProductForSale.suggested_price || '');
        }
    }, [selectedProductForSale]);

    // Initial Default Accounts
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            // Default Purchase Account (1435)
            const defaultInv = accounts.find(a => a.number.startsWith('1435')) || accounts.find(a => a.number.startsWith('14'));
            if (defaultInv && !purchaseAccount) setPurchaseAccount(defaultInv.name);

            // Default Income Account (4135)
            const defaultInc = accounts.find(a => a.number.startsWith('4135')) || accounts.find(a => a.number.startsWith('4'));
            if (defaultInc && !incomeAccount) setIncomeAccount(defaultInc.name);
        }
    }, [accounts, open]);

    // Sales Calculations
    const subtotal = useMemo(() => {
        const qty = parseFloat(saleQty) || 0;
        const price = parseFloat(salePrice) || 0;
        return qty * price;
    }, [saleQty, salePrice]);

    const getNextVoucherNumber = (type, dateStr = date) => {
        const year = String(dateStr || '').includes('-')
            ? String(dateStr).split('-')[0]
            : String(new Date(dateStr || Date.now()).getFullYear());

        const typeTransactions = (transactions || []).filter(t => {
            let transactionType = t.type;
            if (t.isInventoryCostEntry || t.type === 'adjustment') {
                transactionType = 'adjustment';
            } else if (t.isInternalTransfer || t.type === 'transfer') {
                transactionType = 'transfer';
            }
            const transactionYear = String(t.date || '').includes('-')
                ? String(t.date).split('-')[0]
                : String(getAccountingYear(t.date));
            return transactionType === type && transactionYear === year;
        });

        return typeTransactions.reduce(
            (max, t) => Math.max(max, Number(t.voucherNumber) || 0),
            0
        ) + 1;
    };

    const getAccountObject = (identifier) => {
        // Identifier is usually "Name" (from selector) or "ID|Name" (from select)
        if (!identifier) return { code: '0000', name: 'DESCONOCIDA' };
        
        let nameToFind = identifier;
        let idToFind = null;
        
        if (identifier.includes('|')) {
            const parts = identifier.split('|');
            idToFind = parts[0];
            nameToFind = parts[1];
        }

        // Try to find in standard accounts first
        const account = accounts?.find(a => a.name === nameToFind || a.name === identifier || a.id === idToFind);
        if (account) return { code: account.number, name: account.name };

        // Try Bank Accounts
        const bank = bankAccounts?.find(b => b.id === idToFind);
        if (bank) return { code: bank.accountingCode || '1110', name: bank.bankName };

        // Try Cash accounts (dynamic search)
        const cash = cashAccounts?.find(c => c.id === idToFind);
        if (cash) return { code: '11050501', name: cash.name };

        // Fallback for default cash account logic
        if (idToFind === 'caja_principal' || nameToFind?.toLowerCase().includes('caja')) {
            return { code: '11050501', name: 'CAJA PRINCIPAL' };
        }

        return { code: '0000', name: nameToFind || 'CUENTA' };
    };

    const resolvePurchaseCode = (rawCode, notify = false) => {
        const code = sanitizeProductCode(rawCode);
        if (!code) return false;
        const match = (products || []).map(ensureProductCodes).find(p => productMatchesCode(p, code));
        if (!match) {
            if (notify) toast({ title:'Código disponible', description:'No existe aún; se usará para crear un producto nuevo si completas la compra.' });
            return false;
        }
        setProdSku(match.barcode || match.sku);
        setProdName(match.name || '');
        setProdDesc(match.description || '');
        setProdCategory(match.category || PREDEFINED_CATEGORIES[0]);
        setProdUnit(match.unit || PREDEFINED_UNITS[0]);
        return true;
    };

    const handlePurchase = () => {
        if (!prodName || !prodCost || !prodQty || !cashAccount || !purchaseAccount || !selectedPurchaseContactId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor completa los campos obligatorios (*).' });
            return;
        }

        const costVal = parseFloat(prodCost);
        const qtyVal = parseFloat(prodQty);
        if (costVal <= 0 || qtyVal <= 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Costo y cantidad deben ser mayores a 0.' });
            return;
        }

        const totalCost = costVal * qtyVal;
        const now = Date.now();
        const normalizedCode = sanitizeProductCode(prodSku);
        let updatedProductsList = [...(products || [])];
        const coded = updatedProductsList.map(ensureProductCodes);
        const sameNameIndexes = coded
            .map((p, index) => ({ p, index }))
            .filter(x => String(x.p.name || '').trim().toLowerCase() === prodName.trim().toLowerCase());

        let existingProductIndex = -1;
        if (normalizedCode) {
            existingProductIndex = coded.findIndex(p => productMatchesCode(p, normalizedCode));
        } else if (sameNameIndexes.length === 1) {
            existingProductIndex = sameNameIndexes[0].index;
        } else if (sameNameIndexes.length > 1) {
            toast({ variant:'destructive', title:'Producto ambiguo', description:'Hay varios productos con el mismo nombre. Ingresa o escanea el SKU/código para identificar cuál recibe la compra.' });
            return;
        }

        const debitAcc = getAccountObject(purchaseAccount);
        const creditAcc = getAccountObject(cashAccount);
        let finalProduct;
        let targetProductId;
        let previousQuantity = 0;
        let previousUnitCost = 0;

        if (existingProductIndex >= 0) {
            const existing = ensureProductCodes(updatedProductsList[existingProductIndex]);
            const oldQty = parseFloat(existing.quantity) || 0;
            const oldCost = parseFloat(existing.unit_cost) || 0;
            previousQuantity = oldQty;
            previousUnitCost = oldCost;
            const newQty = oldQty + qtyVal;
            const weightedCost = newQty > 0 ? ((oldQty * oldCost) + totalCost) / newQty : costVal;
            targetProductId = existing.id;
            finalProduct = {
                ...existing,
                quantity: newQty,
                unit_cost: weightedCost,
                description: prodDesc || existing.description,
                category: prodCategory || existing.category,
                unit: prodUnit || existing.unit,
                inventoryAccountCode: debitAcc.code,
                inventoryAccountName: debitAcc.name,
            };
            updatedProductsList[existingProductIndex] = finalProduct;
        } else {
            targetProductId = `prod-${now}`;
            finalProduct = ensureProductCodes({
                id: targetProductId,
                name: prodName,
                description: prodDesc,
                category: prodCategory,
                unit: prodUnit,
                unit_cost: costVal,
                suggested_price: costVal * 1.3,
                quantity: qtyVal,
                sku: normalizedCode,
                barcode: normalizedCode,
                inventoryAccountCode: debitAcc.code,
                inventoryAccountName: debitAcc.name,
            });
            updatedProductsList.push(finalProduct);
        }

        const voucher = getNextVoucherNumber('expense');
        const selectedPurchaseContact = contacts?.find(c => c.id === selectedPurchaseContactId);
        const purchaseTx = {
            id: `${now}-pur`,
            type: 'expense',
            date,
            description: `Compra: ${finalProduct.name} x ${qtyVal} ${finalProduct.unit}`,
            amount: totalCost,
            category: 'Compra Inventario',
            debitAccount: debitAcc,
            creditAccount: creditAcc,
            voucherNumber: voucher,
            isPurchase: true,
            isStorePurchase: true,
            productId: targetProductId,
            productQuantity: qtyVal,
            productName: finalProduct.name,
            productSku: finalProduct.sku,
            productBarcode: finalProduct.barcode,
            unitCost: costVal,
            previousQuantity,
            previousUnitCost,
            resultingQuantity: parseFloat(finalProduct.quantity) || 0,
            resultingUnitCost: parseFloat(finalProduct.unit_cost) || 0,
            contactId: selectedPurchaseContactId,
            contactName: selectedPurchaseContact?.name || 'Proveedor desconocido'
        };

        saveTransactions([...(transactions || []), purchaseTx]);
        saveProducts(updatedProductsList);
        toast({ title: "Compra registrada", description: `Se añadieron ${qtyVal} ${finalProduct.unit} de "${finalProduct.name}". Costo promedio actualizado a $${finalProduct.unit_cost.toLocaleString('es-CO',{maximumFractionDigits:2})}.` });
        setProdName(''); setProdDesc(''); setProdQty(''); setProdCost(''); setProdSku(''); setSelectedPurchaseContactId('');
    };

    const handleSale = () => {
        if (!selectedProductForSale || !saleQty || !salePrice || !cashAccount || !incomeAccount || !selectedContactId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Completa los campos obligatorios (*).' });
            return;
        }

        const qtyVal = parseFloat(saleQty);
        const priceVal = parseFloat(salePrice);
        if (qtyVal <= 0 || priceVal < 0) {
            toast({ variant:'destructive', title:'Valores inválidos', description:'La cantidad debe ser mayor a cero y el precio no puede ser negativo.' });
            return;
        }
        if (qtyVal > parseFloat(selectedProductForSale.quantity)) {
            toast({ variant: 'destructive', title: 'Stock Insuficiente', description: `Solo hay ${selectedProductForSale.quantity} disponibles.` });
            return;
        }

        const totalSale = priceVal * qtyVal;
        const unitCost = parseFloat(selectedProductForSale.unit_cost) || 0;
        const totalCost = unitCost * qtyVal;
        const now = Date.now();
        const incomeVoucher = getNextVoucherNumber('income');
        const adjustmentVoucher = getNextVoucherNumber('adjustment');
        const incomeTxId = `${now}-sale`;
        const costTxId = `${now}-cogs`;

        const debitAcc = getAccountObject(cashAccount);
        const creditAcc = getAccountObject(incomeAccount);
        const inventoryAccount = (accounts || []).find(a =>
            String(a.number) === String(selectedProductForSale.inventoryAccountCode || '') ||
            String(a.number).startsWith('1435')
        ) || (accounts || []).find(a => String(a.number).startsWith('14')) || { number:'1435', name:'INVENTARIOS' };
        const costAccount = (accounts || []).find(a => String(a.number).startsWith('6135')) ||
            (accounts || []).find(a => String(a.number).startsWith('61')) ||
            (accounts || []).find(a => String(a.number).startsWith('6')) ||
            { number:'6135', name:'COSTO DE VENTAS' };

        const incomeTx = {
            id: incomeTxId,
            type: 'income',
            date,
            description: `Venta: ${selectedProductForSale.name} x ${qtyVal}`,
            amount: totalSale,
            category: incomeAccount,
            debitAccount: debitAcc,
            creditAccount: creditAcc,
            voucherNumber: incomeVoucher,
            productId: selectedProductForSale.id,
            productQuantity: qtyVal,
            productName: selectedProductForSale.name,
            productSku: selectedProductForSale.sku,
            productBarcode: selectedProductForSale.barcode,
            unitPrice: priceVal,
            unitCost,
            isStoreSale: true,
            relatedTransactionId: totalCost > 0 ? costTxId : null,
            contactId: selectedContactId,
            contactName: selectedContact?.name || 'Cliente desconocido'
        };

        const costTx = totalCost > 0 ? {
            id: costTxId,
            type: 'adjustment',
            date,
            description: `Costo de venta: ${selectedProductForSale.name} x ${qtyVal}`,
            amount: totalCost,
            category: costAccount.name,
            debitAccount: { code: costAccount.number, name: costAccount.name },
            creditAccount: { code: inventoryAccount.number, name: inventoryAccount.name },
            voucherNumber: adjustmentVoucher,
            voucherPrefix: 'A',
            isInventoryCostEntry: true,
            linkedSaleTransactionId: incomeTxId,
            relatedTransactionId: incomeTxId,
            productId: selectedProductForSale.id,
            productName: selectedProductForSale.name,
            productSku: selectedProductForSale.sku,
            productBarcode: selectedProductForSale.barcode,
        } : null;

        const updatedProducts = (products || []).map(p => {
            if (String(p.id) === String(selectedProductId)) {
                return { ...ensureProductCodes(p), quantity: (parseFloat(p.quantity) || 0) - qtyVal };
            }
            return p;
        });

        saveTransactions([...(transactions || []), incomeTx, ...(costTx ? [costTx] : [])]);
        saveProducts(updatedProducts);
        toast({ title: "Venta registrada", description: `Venta e inventario contabilizados. Costo de venta: $${totalCost.toLocaleString('es-CO',{maximumFractionDigits:2})}.` });
        setSaleQty(''); setSelectedProductId(''); setSalePrice(''); setSaleCode(''); setSelectedContactId('');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Gestión de Tienda</DialogTitle>
                </DialogHeader>
                
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="sale" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800">
                            <ShoppingCart className="w-4 h-4 mr-2"/> Venta (Salida)
                        </TabsTrigger>
                        <TabsTrigger value="purchase" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800">
                            <PackagePlus className="w-4 h-4 mr-2"/> Compra (Entrada)
                        </TabsTrigger>
                    </TabsList>

                    {/* VENTA TAB */}
                    <TabsContent value="sale" className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                            <div>
                                <Label className="mb-1 block font-medium">Escanear / escribir SKU o código de barras</Label>
                                <input
                                    value={saleCode}
                                    onChange={e => { setSaleCode(e.target.value); resolveSaleCode(e.target.value, false); }}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); resolveSaleCode(saleCode, true); } }}
                                    className="w-full p-2 border rounded-md bg-white font-mono"
                                    placeholder="Use un lector USB/Bluetooth o escriba el código y presione Enter"
                                />
                            </div>
                            <div>
                                <Label className="mb-2 block font-medium">Buscar Producto *</Label>
                                {availableProducts.length > 0 ? (
                                    <ProductSelector products={availableProducts} value={selectedProductId} onChange={id => { setSelectedProductId(id); const p=availableProducts.find(x=>x.id===id); if(p)setSaleCode(p.barcode||p.sku); }} />
                                ) : (
                                    <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded border border-amber-200">
                                        No hay productos con stock. Registra una compra primero.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Customer Info Section */}
                        <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                            <h4 className="text-sm font-semibold text-orange-800 mb-3 flex items-center">
                                <User className="w-4 h-4 mr-2" />
                                Cliente *
                            </h4>
                            <ContactSelector contacts={contacts} value={selectedContactId} onChange={setSelectedContactId} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Cantidad *</Label>
                                <input type="number" min="1" step="1" value={saleQty} onChange={e => setSaleQty(e.target.value)} className="w-full p-2 border rounded-md" disabled={!selectedProductId}/>
                                {selectedProductForSale && (
                                    <p className={`text-xs text-right ${parseFloat(saleQty) > parseFloat(selectedProductForSale.quantity) ? 'text-red-500 font-bold' : 'text-slate-500'}`}>Máx: {selectedProductForSale.quantity} {selectedProductForSale.unit}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Precio Unitario ($) *</Label>
                                <input type="number" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} className="w-full p-2 border rounded-md"/>
                            </div>
                        </div>

                        {/* Totals Breakdown */}
                        <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
                            <div className="flex justify-between font-bold text-slate-900 pt-1 mt-1">
                                <span>Total:</span>
                                <span>${subtotal.toLocaleString('es-CO', {minimumFractionDigits: 0})}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Cuenta Ingreso (Ventas) *</Label>
                            <AccountSelector accounts={accounts} value={incomeAccount} onChange={setIncomeAccount} prefixFilter="4" placeholder="Ej: 4135 Comercio..." />
                        </div>

                        <div className="space-y-2">
                            <Label>Destino del Dinero (Caja) *</Label>
                            <select value={cashAccount} onChange={e => setCashAccount(e.target.value)} className="w-full p-2 border rounded-md bg-white">
                                <optgroup label="Cajas Principales">
                                    <option value="caja_principal|CAJA PRINCIPAL">Caja Principal (Efectivo)</option>
                                </optgroup>
                                
                                {(cashAccounts && cashAccounts.length > 0) && (
                                    <optgroup label="Cajas Menores y Mayores">
                                        {cashAccounts.map(c => (
                                            <option key={c.id} value={`${c.id}|${c.name}`}>{c.name} ({c.type})</option>
                                        ))}
                                    </optgroup>
                                )}
                                
                                <optgroup label="Bancos">
                                    {(bankAccounts || []).map(b => (
                                        <option key={b.id} value={`${b.id}|${b.bankName}`}>{b.bankName}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                        
                        <div className="space-y-2">
                            <Label>Fecha</Label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-md" />
                        </div>

                        <Button onClick={handleSale} className="w-full bg-green-600 hover:bg-green-700 mt-2" disabled={!selectedProductId || parseFloat(saleQty) <= 0}>
                            Registrar Venta
                        </Button>
                    </TabsContent>

                    {/* COMPRA TAB */}
                    <TabsContent value="purchase" className="space-y-4">
                        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
                            {/* Contact Selector for Purchase */}
                            <div className="space-y-2">
                                <Label>Proveedor / Contacto *</Label>
                                <ContactSelector contacts={contacts} value={selectedPurchaseContactId} onChange={setSelectedPurchaseContactId} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>SKU / Código de barras</Label>
                                    <input
                                        type="text"
                                        value={prodSku}
                                        onChange={e => { const code = sanitizeProductCode(e.target.value); setProdSku(code); resolvePurchaseCode(code, false); }}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); resolvePurchaseCode(prodSku, true); } }}
                                        className="w-full p-2 border rounded-md font-mono"
                                        placeholder="Escanee un producto existente o deje vacío para generar"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Nombre del Producto *</Label>
                                    <input type="text" value={prodName} onChange={e => setProdName(e.target.value)} className="w-full p-2 border rounded-md" placeholder="Ej: Resma Papel"/>
                                </div>
                                <div className="space-y-2">
                                    <Label>Categoría</Label>
                                    <select value={prodCategory} onChange={e => setProdCategory(e.target.value)} className="w-full p-2 border rounded-md bg-white">
                                        {PREDEFINED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <textarea value={prodDesc} onChange={e => setProdDesc(e.target.value)} className="w-full p-2 border rounded-md h-12 resize-none" />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Unidad</Label>
                                    <select value={prodUnit} onChange={e => setProdUnit(e.target.value)} className="w-full p-2 border rounded-md bg-white">
                                        {PREDEFINED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Costo *</Label>
                                    <input type="number" step="0.01" value={prodCost} onChange={e => setProdCost(e.target.value)} className="w-full p-2 border rounded-md" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Cant. *</Label>
                                    <input type="number" step="1" value={prodQty} onChange={e => setProdQty(e.target.value)} className="w-full p-2 border rounded-md" />
                                </div>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <Label>Cuenta Inventario (Activo) *</Label>
                            <AccountSelector accounts={accounts} value={purchaseAccount} onChange={setPurchaseAccount} prefixFilter="14" placeholder="Ej: 1435 Mercancía..." />
                        </div>

                        <div className="space-y-2">
                            <Label>Pago desde (Origen) *</Label>
                            <select value={cashAccount} onChange={e => setCashAccount(e.target.value)} className="w-full p-2 border rounded-md bg-white">
                                <optgroup label="Cajas Principales">
                                    <option value="caja_principal|CAJA PRINCIPAL">Caja Principal (Efectivo)</option>
                                </optgroup>
                                
                                {(cashAccounts && cashAccounts.length > 0) && (
                                    <optgroup label="Cajas Menores y Mayores">
                                        {cashAccounts.map(c => (
                                            <option key={c.id} value={`${c.id}|${c.name}`}>{c.name} ({c.type})</option>
                                        ))}
                                    </optgroup>
                                )}
                                
                                <optgroup label="Bancos">
                                    {(bankAccounts || []).map(b => (
                                        <option key={b.id} value={`${b.id}|${b.bankName}`}>{b.bankName}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label>Fecha</Label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-md" />
                        </div>

                        <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 flex justify-between items-center font-medium border border-blue-200">
                             <span>Total a Pagar:</span>
                             <span className="text-lg font-bold">${(parseFloat(prodQty || 0) * parseFloat(prodCost || 0)).toLocaleString()}</span>
                        </div>

                        <Button onClick={handlePurchase} className="w-full bg-blue-600 hover:bg-blue-700 mt-2">
                            Registrar Compra e Inventario
                        </Button>
                    </TabsContent>
                </Tabs>
                
                <DialogFooter className="sm:justify-center border-t pt-4 mt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-500 hover:text-slate-700">
                        Cerrar Ventana
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default StoreTransaction;