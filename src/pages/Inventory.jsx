import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Search, Package, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const Inventory = () => {
    const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();
    const [products, saveProducts] = useCompanyData('inventory');
    const [accounts] = useCompanyData('accounts');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    // Calculate totals
    const totalInventoryValue = (products || []).reduce((sum, p) => sum + ((parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0)), 0);

    // CONSOLIDATION LOGIC FOR DISPLAY
    const consolidatedProducts = useMemo(() => {
        if (!products) return [];

        const grouped = products.reduce((acc, product) => {
            const nameKey = (product.name || '').toLowerCase().trim();
            if (!acc[nameKey]) {
                acc[nameKey] = {
                    ...product, 
                    quantity: 0,
                    totalValue: 0,
                    count: 0,
                    ids: []
                };
            }
            const qty = parseFloat(product.quantity) || 0;
            const cost = parseFloat(product.unit_cost) || 0;
            
            acc[nameKey].quantity += qty;
            acc[nameKey].totalValue += (qty * cost);
            acc[nameKey].count += 1;
            acc[nameKey].ids.push(product.id);
            
            return acc;
        }, {});

        return Object.values(grouped).map(group => ({
            ...group,
            unit_cost: group.quantity > 0 ? (group.totalValue / group.quantity) : group.unit_cost,
            isConsolidated: group.count > 1
        })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    }, [products]);

    // Función para calcular el número de comprobante
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

    const handleSave = (productData) => {
        if (!canAdd && !editingProduct) return;
        if (!canEdit && editingProduct) return;

        let updatedProducts;
        if (editingProduct) {
            updatedProducts = products.map(p => p.id === editingProduct.id ? { ...p, ...productData } : p);
            toast({ title: "Producto actualizado" });
        } else {
            const newId = Date.now().toString();
            const initialQty = parseFloat(productData.quantity) || 0;
            const unitCost = parseFloat(productData.unit_cost) || 0;
            
            const newProduct = { 
                ...productData, 
                id: newId, 
                quantity: initialQty 
            };
            updatedProducts = [...(products || []), newProduct];
            
            // LÓGICA PARA DONACIONES / STOCK INICIAL MANUAL:
            if (initialQty > 0 && unitCost > 0) {
                const inventoryAccount = accounts?.find(a => a.number.startsWith('1435')) || accounts?.find(a => a.number.startsWith('14')) || { id: 'default-inv', name: 'Inventario General', number: '143501' };
                const originAccount = accounts?.find(a => a.number.startsWith('4245')) || accounts?.find(a => a.number.startsWith('42')) || accounts?.find(a => a.number.startsWith('3')) || { id: 'default-equity', name: 'PATRIMONIO', number: '3' };
                
                const totalValue = initialQty * unitCost;
                const currentDate = format(new Date(), 'yyyy-MM-dd');
                
                // CORRECCIÓN: Ahora pide el consecutivo de TRANSFERENCIA ('transfer') para que tenga la Letra T
                const nextVoucher = getNextVoucherNumber('transfer', currentDate);

                const transaction = {
                    id: `${newId}-init`,
                    date: currentDate,
                    type: 'transfer', // CORRECCIÓN: Tipo Cruce/Transferencia
                    description: `Ingreso a Inventario / Donación: ${productData.name} (${initialQty} ${productData.unit})`,
                    amount: totalValue,
                    category: originAccount.name,
                    destination: 'inventario|INVENTARIO GENERAL',
                    voucherNumber: nextVoucher, 
                    
                    debitAccount: { code: inventoryAccount.number, name: inventoryAccount.name },
                    creditAccount: { code: originAccount.number, name: originAccount.name },
                    
                    isPurchase: false, 
                    isInternalTransfer: true, // ESTO HACE QUE SE VEA COMO "T" Y CRUCE CONTABLE
                    isInitialStock: true,
                    productId: newId,
                    productQuantity: initialQty,
                    productName: productData.name
                };

                const newTransactions = [...(transactions || []), transaction];
                saveTransactions(newTransactions);
                
                toast({ title: "Producto donado creado", description: "Se generó el Comprobante de Ingreso en Especie." });
            } else {
                toast({ title: "Producto creado", description: "Registrado con stock cero." });
            }
        }
        saveProducts(updatedProducts);
        setDialogOpen(false);
    };

    const handleDelete = (id) => {
        if (!canDelete) return;
        if (window.confirm('¿Estás seguro de eliminar este producto? Esto no borrará transacciones históricas pero puede afectar reportes futuros.')) {
            saveProducts(products.filter(p => p.id !== id));
            toast({ title: "Producto eliminado" });
        }
    };

    const filteredProducts = consolidatedProducts.filter(p => 
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <Helmet><title>Inventario - JaiderHerTur26</title></Helmet>
            <div className="space-y-6">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
                    <div><h1 className="text-4xl font-bold text-slate-900">Inventario</h1><p className="text-slate-600">Gestión de productos y existencias.</p></div>
                    <div className="flex items-center gap-2">
                        {isReadOnly && <span className="flex items-center text-slate-400 text-sm"><Lock className="w-4 h-4 mr-1"/>Acceso Parcial</span>}
                        {canAdd && <Button onClick={() => { setEditingProduct(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" /> Nuevo Producto / Donación</Button>}
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow p-6 border-l-4 border-blue-600">
                        <div className="flex items-center justify-between">
                            <div><p className="text-sm font-medium text-slate-500">Valor Total Inventario</p><h3 className="text-2xl font-bold text-slate-900">${totalInventoryValue.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</h3></div>
                            <div className="p-3 bg-blue-50 rounded-full"><Package className="w-6 h-6 text-blue-600" /></div>
                        </div>
                    </motion.div>
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6 border flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px] relative"><Label>Buscar:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Nombre o categoría..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full mt-1 pl-10 pr-4 py-2 border rounded-lg" /></div>
                </motion.div>

                <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-700">
                                <tr>
                                    <th className="p-4 font-semibold">Producto</th>
                                    <th className="p-4 font-semibold">Categoría</th>
                                    <th className="p-4 font-semibold text-right">Costo Prom.</th>
                                    <th className="p-4 font-semibold text-right">Precio Venta</th>
                                    <th className="p-4 font-semibold text-center">Existencia</th>
                                    <th className="p-4 font-semibold text-right">Valor Total</th>
                                    <th className="p-4 font-semibold text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredProducts.length === 0 ? (
                                    <tr><td colSpan="7" className="p-8 text-center text-slate-500">No se encontraron productos.</td></tr>
                                ) : filteredProducts.map(product => (
                                    <tr key={product.id} className="hover:bg-slate-50">
                                        <td className="p-4"><div className="font-medium text-slate-900">{product.name}</div><div className="text-xs text-slate-500">{product.description}</div></td>
                                        <td className="p-4 text-slate-600">{product.category}</td>
                                        <td className="p-4 text-right font-mono">${parseFloat(product.unit_cost || 0).toLocaleString('es-CO')}</td>
                                        <td className="p-4 text-right font-mono text-green-600">${parseFloat(product.suggested_price || 0).toLocaleString('es-CO')}</td>
                                        <td className="p-4 text-center"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${product.quantity > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{product.quantity} {product.unit}</span></td>
                                        <td className="p-4 text-right font-bold font-mono">${(product.quantity * product.unit_cost).toLocaleString('es-CO')}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingProduct(product); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                                                {canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDelete(product.id)}><Trash2 className="w-4 h-4" /></Button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <ProductDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} product={editingProduct} />
        </>
    );
};

const ProductDialog = ({ open, onOpenChange, onSave, product }) => {
    const defaultData = { 
        name: '', description: '', category: 'General', unit: 'Unidad', unit_cost: '', suggested_price: '', quantity: '0' 
    };
    const [data, setData] = useState(defaultData);

    useEffect(() => { if (open) setData(product || defaultData); }, [open, product]);
    const handleSubmit = (e) => { e.preventDefault(); onSave(data); };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl overflow-y-auto max-h-[90vh]">
                <DialogHeader><DialogTitle>{product ? 'Editar' : 'Nuevo'} Producto</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    <div className="space-y-1"><Label>Nombre</Label><input required value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-md" placeholder="Ej: Camándula de Madera" /></div>
                    <div className="space-y-1"><Label>Categoría</Label><input required value={data.category} onChange={e => setData({...data, category: e.target.value})} className="w-full p-2 border rounded-md" /></div>
                    <div className="md:col-span-2 space-y-1"><Label>Descripción</Label><textarea value={data.description} onChange={e => setData({...data, description: e.target.value})} className="w-full p-2 border rounded-md h-20" placeholder="Ej: Donación recibida por..." /></div>
                    <div className="space-y-1"><Label>Unidad de Medida</Label><input required value={data.unit} onChange={e => setData({...data, unit: e.target.value})} className="w-full p-2 border rounded-md" placeholder="Unidad, Kg, Litro..." /></div>
                    
                    <div className="space-y-1">
                        <Label>Cantidad (Si es donación)</Label>
                        <input type="number" step="1" value={data.quantity} onChange={e => setData({...data, quantity: e.target.value})} className="w-full p-2 border rounded-md" disabled={!!product} title={product ? "Use 'Tienda' para modificar stock" : "Stock inicial"} />
                        {product && <span className="text-xs text-slate-500">Modificar vía Transacciones (Tienda)</span>}
                    </div>

                    <div className="space-y-1"><Label>Costo Unitario (Ref.)</Label><input type="number" step="0.01" required value={data.unit_cost} onChange={e => setData({...data, unit_cost: e.target.value})} className="w-full p-2 border rounded-md" placeholder="Valor comercial" /></div>
                    <div className="space-y-1"><Label>Precio Venta Sugerido</Label><input type="number" step="0.01" required value={data.suggested_price} onChange={e => setData({...data, suggested_price: e.target.value})} className="w-full p-2 border rounded-md" /></div>
                    
                    <DialogFooter className="md:col-span-2 mt-4">
                        <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar Producto</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default Inventory;