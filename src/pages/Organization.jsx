import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Building, Plus, Network, Trash2, ShieldCheck, MapPin, Phone, User, Lock, Info, Edit2, Key, CreditCard, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { supabase } from '@/lib/supabase'; // <-- AÑADIDO: CONEXIÓN A LA NUBE

const Organization = () => {
    const { activeCompany, companies, setCompanies, updateCompanyCredentials } = useCompany();
    const { canModify, canEdit, isReadOnly } = usePermission();
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSecurityDialogOpen, setIsSecurityDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    const [formData, setFormData] = useState({ name: '', address: '', phone: '', username: '', password: '', partialPassword: '' });
    const [securityData, setSecurityData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    const subCompanies = companies.filter(c => c.parentId && String(c.parentId) === String(activeCompany?.id));

    // 🚀 LÁSER DESTRUCTOR EN LA NUBE PARA SUB-EMPRESAS
    const handleDelete = async (id) => {
        if (!canModify) return;
        if (window.confirm('¿Estás seguro de eliminar esta sub-empresa de la base de datos? Se perderán sus datos permanentemente.')) {
            try {
                const { error } = await supabase
                    .from('companies')
                    .delete()
                    .eq('id', String(id));

                if (error) throw error;

                if (typeof setCompanies === 'function') {
                    await setCompanies();
                }
                toast({ title: "Sub-empresa eliminada exitosamente" });
            } catch (err) {
                console.error("Error eliminando sub-empresa:", err);
                toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar de la nube." });
            }
        }
    };

    const handleOpenCreate = () => {
        setEditingId(null);
        setFormData({ name: '', address: '', phone: '', username: '', password: '', partialPassword: '' });
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (subCompany) => {
        setEditingId(subCompany.id);
        setFormData({ name: subCompany.name || '', address: subCompany.address || '', phone: subCompany.phone || '', username: subCompany.username || '', password: subCompany.password || '', partialPassword: subCompany.partialPassword || '' });
        setIsDialogOpen(true);
    };

    // 🚀 GUARDADO DIRECTO A LA NUBE PARA SUB-EMPRESAS
    const handleSave = async (e) => {
        e.preventDefault();
        if (!canModify) return;
        if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) { 
            toast({ variant: "destructive", title: "Datos incompletos", description: "Nombre, Usuario y Contraseña Global son obligatorios." }); 
            return; 
        }
        
        const isDuplicateUser = companies.some(c => c.username === formData.username && c.id !== editingId);
        if (isDuplicateUser) { 
            toast({ variant: "destructive", title: "Usuario no disponible", description: "Este nombre de usuario ya está en uso." }); 
            return; 
        }

        try {
            if (editingId) {
                // EDITAR SUB-EMPRESA
                const { error } = await supabase
                    .from('companies')
                    .update({
                        name: formData.name,
                        address: formData.address,
                        phone: formData.phone,
                        username: formData.username,
                        password: formData.password,
                        partial_password: formData.partialPassword
                    })
                    .eq('id', String(editingId));
                    
                if (error) throw error;
                toast({ title: "Sub-empresa actualizada" });
            } else {
                // CREAR NUEVA SUB-EMPRESA
                const newId = Date.now().toString();
                const { error } = await supabase
                    .from('companies')
                    .insert([{
                        id: newId,
                        parent_id: String(activeCompany.id),
                        doc_nit: activeCompany.doc, // Hereda el NIT de la parroquia
                        name: formData.name,
                        address: formData.address,
                        phone: formData.phone,
                        username: formData.username,
                        password: formData.password,
                        partial_password: formData.partialPassword
                    }]);
                    
                if (error) throw error;
                toast({ title: "Sub-empresa creada exitosamente" });
            }

            // Recargar la lista fresca desde la nube
            if (typeof setCompanies === 'function') {
                await setCompanies();
            }
            setIsDialogOpen(false);
            
        } catch (err) {
            console.error("Error guardando sub-empresa:", err);
            toast({ variant: "destructive", title: "Error", description: "No se pudo conectar con la base de datos." });
        }
    };

    const handleSecuritySave = (e) => {
        e.preventDefault();
        if (!canModify) return;
        if (securityData.newPassword.length < 6) { toast({ variant: "destructive", title: "Contraseña insegura", description: "La nueva contraseña debe tener al menos 6 caracteres." }); return; }
        if (securityData.newPassword !== securityData.confirmPassword) { toast({ variant: "destructive", title: "Error", description: "Las contraseñas nuevas no coinciden." }); return; }
        if (securityData.currentPassword && securityData.currentPassword !== activeCompany.password) { toast({ variant: "destructive", title: "Error", description: "La contraseña actual es incorrecta." }); return; }
        updateCompanyCredentials(activeCompany.id, { password: securityData.newPassword });
        setIsSecurityDialogOpen(false);
        setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    };

    return (
        <>
            <Helmet><title>Mi Organización - JaiderHerTur26</title></Helmet>
            <div className="max-w-6xl mx-auto space-y-8">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div><h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2"><Network className="w-8 h-8 text-blue-600" /> Mi Organización</h1><p className="text-slate-600 mt-1">Gestión de sucursales y seguridad.</p></div>
                        <div className="flex gap-2">
                             <Dialog open={isSecurityDialogOpen} onOpenChange={setIsSecurityDialogOpen}>
                                <DialogTrigger asChild><Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100"><Shield className="w-4 h-4 mr-2" /> Seguridad</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Cambiar Contraseña Global</DialogTitle><DialogDescription>Actualiza tu clave de acceso principal.</DialogDescription></DialogHeader>
                                    {isReadOnly ? (
                                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center gap-2 text-amber-800"><AlertTriangle className="w-5 h-5"/> No tienes permisos para modificar la seguridad.</div>
                                    ) : (
                                        <form onSubmit={handleSecuritySave} className="space-y-4 py-2">
                                            <div className="space-y-2"><Label>Contraseña Actual</Label><input type="password" required className="w-full p-2 border rounded-md" value={securityData.currentPassword} onChange={e => setSecurityData({...securityData, currentPassword: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Nueva Contraseña</Label><input type="password" required className="w-full p-2 border rounded-md" value={securityData.newPassword} onChange={e => setSecurityData({...securityData, newPassword: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Confirmar Nueva Contraseña</Label><input type="password" required className="w-full p-2 border rounded-md" value={securityData.confirmPassword} onChange={e => setSecurityData({...securityData, confirmPassword: e.target.value})} /></div>
                                            <Button type="submit" className="w-full bg-slate-900">Actualizar Contraseña</Button>
                                        </form>
                                    )}
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>{canModify && <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 shadow-lg"><Plus className="w-4 h-4 mr-2" /> Nueva Sub-empresa</Button>}</DialogTrigger>
                                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader><DialogTitle>{editingId ? 'Editar Sub-empresa' : 'Crear Nueva Sub-empresa'}</DialogTitle><DialogDescription>Configure los detalles y credenciales.</DialogDescription></DialogHeader>
                                    <form onSubmit={handleSave} className="space-y-6 py-4">
                                        <div className="space-y-4">
                                            <div className="space-y-2"><Label>Nombre</Label><input required disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Usuario</Label><input required disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} /></div>
                                             <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2"><Label>Clave Global</Label><input required type="password" disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
                                                <div className="space-y-2"><Label>Clave Parcial</Label><input type="password" disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.partialPassword} onChange={e => setFormData({...formData, partialPassword: e.target.value})} /></div>
                                            </div>
                                        </div>
                                        <div className="pt-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>{canModify && <Button type="submit" className="bg-green-600 hover:bg-green-700">Guardar</Button>}</div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </motion.div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm relative"><div className="absolute -top-3 -left-3 bg-blue-600 text-white p-2 rounded-lg shadow-md"><Building className="w-6 h-6" /></div><div className="ml-8"><h3 className="text-lg font-bold text-blue-900">{activeCompany?.name}</h3><p className="text-sm text-blue-700">Empresa Principal (Matriz)</p><div className="mt-4 space-y-2 text-sm text-blue-800"><div className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {activeCompany?.address || 'Sin dirección'}</div><div className="flex items-center gap-2"><Phone className="w-4 h-4"/> {activeCompany?.phone || 'Sin teléfono'}</div></div></div></div>
                    <div className="space-y-4">
                        <h4 className="font-semibold text-slate-500 text-sm uppercase tracking-wider">Sub-empresas Vinculadas</h4>
                        {subCompanies.length === 0 ? (<div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300"><Network className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-slate-500">No hay sub-empresas registradas.</p></div>) : (subCompanies.map(sub => (<motion.div key={sub.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all"><div className="flex justify-between items-start"><div className="flex gap-3"><div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg h-fit"><Building className="w-5 h-5" /></div><div><h3 className="font-bold text-slate-900">{sub.name}</h3><div className="mt-2 text-sm text-slate-600 flex gap-4"><span className="flex items-center gap-1"><User className="w-3 h-3"/> {sub.username}</span></div></div></div><div className="flex gap-1">{canModify && <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(sub)}><Edit2 className="w-4 h-4" /></Button>}{canModify && <Button variant="ghost" size="icon" onClick={() => handleDelete(sub.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>}</div></div></motion.div>)))}
                    </div>
                </div>
            </div>
        </>
    );
};

export default Organization;