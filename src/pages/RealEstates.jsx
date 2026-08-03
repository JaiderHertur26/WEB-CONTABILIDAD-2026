import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Building, Search, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { usePermission } from '@/hooks/usePermission';

const RealEstates = () => {
    const { canEdit, canDelete, canAdd, isReadOnly } = usePermission();
    const [realEstates, saveRealEstates] = useCompanyData('realEstates');
    
    // NUEVO: Importamos transacciones y cuentas para asegurar la Partida Doble
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEstate, setEditingEstate] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    // Calculador automático de consecutivo
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

    const handleSaveEstate = (estateData) => {
        if (!canAdd && !editingEstate) return;
        if (!canEdit && editingEstate) return;

        let updatedEstates;
        if (editingEstate) {
            updatedEstates = realEstates.map(estate => estate.id === editingEstate.id ? { ...estate, ...estateData } : estate);
            
            // Si editan el valor o fecha, actualizamos también el comprobante interno
            if (transactions) {
                const txnIndex = transactions.findIndex(t => t.estateId === editingEstate.id);
                if (txnIndex !== -1) {
                    const updatedTxns = [...transactions];
                    updatedTxns[txnIndex] = {
                        ...updatedTxns[txnIndex],
                        amount: parseFloat(estateData.value) || 0,
                        date: estateData.date,
                        description: `Registro Inicial de Propiedad: ${estateData.name}`
                    };
                    saveTransactions(updatedTxns);
                }
            }
            toast({ title: "Propiedad actualizada" });
        } else {
            const newId = Date.now().toString();
            const newValue = parseFloat(estateData.value) || 0;
            
            updatedEstates = [...(realEstates || []), { ...estateData, id: newId }];
            
            // LÓGICA DE PARTIDA DOBLE: Para que el Balance no se descuadre
            if (newValue > 0) {
                const propertyAccount = accounts?.find(a => a.number.startsWith('1516')) || accounts?.find(a => a.number.startsWith('15')) || { id: 'default-prop', name: 'Construcciones y Edificaciones', number: '151601' };
                const equityAccount = accounts?.find(a => a.number.startsWith('3')) || { id: 'default-equity', name: 'PATRIMONIO', number: '3' };

                const nextVoucher = getNextVoucherNumber('transfer', estateData.date);

                const transaction = {
                    id: `txn-estate-${newId}`,
                    date: estateData.date,
                    type: 'transfer', // Nota de Contabilidad (T)
                    description: `Registro Inicial de Propiedad: ${estateData.name}`,
                    amount: newValue,
                    category: equityAccount.name,
                    destination: 'propiedad|PROPIEDAD PLANTA Y EQUIPO',
                    voucherNumber: nextVoucher, 
                    
                    debitAccount: { code: propertyAccount.number, name: propertyAccount.name }, // Activo Fijo (Aumenta)
                    creditAccount: { code: equityAccount.number, name: equityAccount.name },    // Patrimonio (Aumenta)
                    
                    isPurchase: false, 
                    isInternalTransfer: true, 
                    isInitialStock: true,
                    estateId: newId // Para poder borrarlo si borran la propiedad
                };

                saveTransactions([...(transactions || []), transaction]);
            }

            toast({ title: "Propiedad creada", description: "El activo se integró al Patrimonio correctamente." });
        }
        saveRealEstates(updatedEstates);
        setDialogOpen(false);
    };

    const handleDeleteEstate = (id) => {
        if (!canDelete) return;
        saveRealEstates(realEstates.filter(estate => estate.id !== id));
        
        // Si borran la propiedad, borramos el comprobante de Patrimonio para evitar saldos falsos
        if (transactions) {
            const updatedTransactions = transactions.filter(t => t.estateId !== id);
            if (updatedTransactions.length !== transactions.length) {
                saveTransactions(updatedTransactions);
            }
        }
        
        toast({ title: "Propiedad eliminada" });
    };

    const filteredEstates = (realEstates || []).filter(estate => 
        (estate.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (estate.address?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <Helmet><title>Propiedades y Oficinas - JaiderHerTur26</title></Helmet>
            <div className="space-y-6">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
                    <div><h1 className="text-4xl font-bold text-slate-900">Propiedades y Oficinas</h1></div>
                    <div className="flex items-center gap-2">
                        {isReadOnly && <span className="flex items-center text-slate-400 text-sm"><Lock className="w-4 h-4 mr-1"/>Acceso Parcial</span>}
                        {canAdd && <Button onClick={() => { setEditingEstate(null); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" /> Nueva Propiedad</Button>}
                    </div>
                </motion.div>
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6 border">
                    <div className="relative"><Label>Buscar Propiedad:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Buscar por nombre o dirección..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full mt-1 pl-10 pr-4 py-2 border rounded-lg" /></div>
                </motion.div>

                {filteredEstates.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-white rounded-xl shadow-lg border">
                        <Building className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500">No hay propiedades registradas.</p>
                    </motion.div>
                ) : (
                    <div className="bg-white rounded-xl shadow-lg border overflow-x-auto"><table className="w-full text-sm">
                        <thead className="bg-slate-50"><tr>{['Nombre', 'Dirección', 'Fecha de Adquisición', 'Valor', 'Acciones'].map(h => <th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr></thead>
                        <tbody className="divide-y">{filteredEstates.map(estate => (<tr key={estate.id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium">{estate.name}</td>
                            <td className="p-3">{estate.address}</td>
                            <td className="p-3">{estate.date}</td>
                            <td className="p-3 font-mono">${parseFloat(estate.value).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3"><div className="flex gap-1">
                                {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingEstate(estate); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                                {canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDeleteEstate(estate.id)}><Trash2 className="w-4 h-4" /></Button>}
                            </div></td>
                        </tr>))}</tbody>
                    </table></div>
                )}
            </div>
            <EstateDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveEstate} estate={editingEstate} />
        </>
    );
}

const EstateDialog = ({ open, onOpenChange, onSave, estate }) => {
    const [data, setData] = useState({ name: '', address: '', value: '', date: '' });
    
    useEffect(() => { 
        if(open) { 
            if(estate) {
                setData(estate);
            } else {
                setData({ name: '', address: '', value: '', date: new Date().toISOString().split('T')[0] });
            }
        } 
    }, [estate, open]);

    const handleSubmit = e => { 
        e.preventDefault(); 
        onSave(data); 
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{estate ? 'Editar' : 'Nueva'} Propiedad</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 pt-4">
                    <div className="space-y-1"><Label>Nombre</Label><input required value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Ej: Oficina Principal, Bodega Norte"/></div>
                    <div className="space-y-1"><Label>Dirección</Label><input required value={data.address} onChange={e => setData({...data, address: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Fecha de Adquisición</Label><input type="date" required value={data.date} onChange={e => setData({...data, date: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Valor</Label><input type="number" step="0.01" required value={data.value} onChange={e => setData({...data, value: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="flex justify-end gap-2 pt-4">
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default RealEstates;