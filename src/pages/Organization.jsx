import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Building, Plus, Network, Trash2, ShieldCheck, MapPin, Phone, User, Lock, Info, Edit2, Key, CreditCard, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/LocalAuthContext';
import { createCompanySecure, deleteCompanySecure } from '@/lib/secureApi';
import { getCompanyScope } from '@/lib/companyHierarchy';

const Organization = () => {
    const { activeCompany, companies, setCompanies, updateCompanyCredentials, switchCompany } = useCompany();
    const { sessionToken } = useAuth();
    const { canModify, isReadOnly, accessLevel, isConsolidatedReadOnly } = usePermission();
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSecurityDialogOpen, setIsSecurityDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    const [formData, setFormData] = useState({ name: '', address: '', phone: '', username: '', password: '', partialPassword: '' });
    const [securityData, setSecurityData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    const organizationScope = useMemo(
        () => getCompanyScope(companies, activeCompany?.id),
        [companies, activeCompany?.id]
    );
    const linkedCompanies = useMemo(
        () => organizationScope.filter(c => String(c.id) !== String(activeCompany?.id)),
        [organizationScope, activeCompany?.id]
    );
    const companyById = useMemo(
        () => new Map((companies || []).map(c => [String(c.id), c])),
        [companies]
    );
    const activeParent = activeCompany?.parentId
        ? companyById.get(String(activeCompany.parentId))
        : null;
    const getDepth = (company) => {
        let depth = 1;
        let parentId = company?.parentId || company?.parent_id;
        const visited = new Set();
        while (parentId && String(parentId) !== String(activeCompany?.id) && !visited.has(String(parentId))) {
            visited.add(String(parentId));
            const parent = companyById.get(String(parentId));
            if (!parent) break;
            depth += 1;
            parentId = parent.parentId || parent.parent_id;
        }
        return depth;
    };

    const handleSwitchCompany = async (companyId) => {
        if (!companyId || String(companyId) === String(activeCompany?.id)) return;
        await switchCompany(companyId);
    };

    const handleDelete = async (id) => {
        if (!canModify || !sessionToken) return;
        if (window.confirm('¿Estás seguro de eliminar esta sub-empresa? Se eliminarán también sus datos sincronizados dependientes.')) {
            try {
                await deleteCompanySecure(sessionToken, id);
                if (typeof setCompanies === 'function') await setCompanies();
                toast({ title: "Sub-empresa eliminada exitosamente" });
            } catch (err) {
                console.error("Error eliminando sub-empresa:", err);
                toast({ variant: "destructive", title: "Error", description: err?.message || "No se pudo eliminar la sub-empresa." });
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
        setFormData({ name: subCompany.name || '', address: subCompany.address || '', phone: subCompany.phone || '', username: subCompany.username || '', password: '', partialPassword: '' });
        setIsDialogOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!canModify || !sessionToken || !activeCompany) return;
        if (!formData.name.trim() || !formData.username.trim() || (!editingId && !formData.password.trim())) {
            toast({ variant: "destructive", title: "Datos incompletos", description: editingId ? "Nombre y Usuario son obligatorios." : "Nombre, Usuario y Contraseña Global son obligatorios." });
            return;
        }

        const isDuplicateUser = companies.some(c => c.username === formData.username && c.id !== editingId);
        if (isDuplicateUser) {
            toast({ variant: "destructive", title: "Usuario no disponible", description: "Este nombre de usuario ya está en uso." });
            return;
        }

        try {
            if (editingId) {
                await updateCompanyCredentials(editingId, {
                    name: formData.name,
                    address: formData.address,
                    phone: formData.phone,
                    username: formData.username,
                    ...(formData.password ? { password: formData.password } : {}),
                    ...(formData.partialPassword ? { partialPassword: formData.partialPassword } : {}),
                });
                toast({ title: "Sub-empresa actualizada" });
            } else {
                const newId = Date.now().toString();
                await createCompanySecure(sessionToken, {
                    id: newId,
                    parentId: activeCompany.id,
                    name: formData.name,
                    doc: activeCompany.doc,
                });
                await updateCompanyCredentials(newId, {
                    address: formData.address,
                    phone: formData.phone,
                    username: formData.username,
                    password: formData.password,
                    ...(formData.partialPassword ? { partialPassword: formData.partialPassword } : {}),
                });
                toast({ title: "Sub-empresa creada exitosamente" });
            }

            if (typeof setCompanies === 'function') await setCompanies();
            setIsDialogOpen(false);
        } catch (err) {
            console.error("Error guardando sub-empresa:", err);
            toast({ variant: "destructive", title: "Error", description: err?.message || "No se pudo completar la operación segura." });
        }
    };

    const handleSecuritySave = async (e) => {
        e.preventDefault();
        if (!canModify || !activeCompany) return;
        if (securityData.newPassword.length < 12) { toast({ variant: "destructive", title: "Contraseña insegura", description: "La nueva contraseña debe tener al menos 12 caracteres." }); return; }
        if (securityData.newPassword !== securityData.confirmPassword) { toast({ variant: "destructive", title: "Error", description: "Las contraseñas nuevas no coinciden." }); return; }
        const ok = await updateCompanyCredentials(activeCompany.id, { password: securityData.newPassword });
        if (!ok) return;
        setIsSecurityDialogOpen(false);
        setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    };

    return (
        <>
            <Helmet><title>Mi Organización - JaiderHerTur26</title></Helmet>
            <div className="max-w-6xl mx-auto space-y-8">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2"><Network className="w-8 h-8 text-blue-600" /> Mi Organización</h1>
                            <p className="text-slate-600 mt-1">Estructura organizacional, niveles de acceso y seguridad.</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600">
                                    {organizationScope.length} {organizationScope.length === 1 ? 'entidad' : 'entidades'} en el alcance
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 font-semibold ${accessLevel === 'full' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                    {accessLevel === 'full' ? 'Acceso Total' : 'Acceso Parcial'}
                                </span>
                                {isConsolidatedReadOnly && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">Vista Consolidada · Solo lectura</span>}
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <Dialog open={isSecurityDialogOpen} onOpenChange={setIsSecurityDialogOpen}>
                                <DialogTrigger asChild>{canModify ? <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100"><Shield className="w-4 h-4 mr-2" /> Seguridad</Button> : <span className="hidden" />}</DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Cambiar Contraseña Global</DialogTitle><DialogDescription>La sesión actual ya acredita tu identidad. La nueva clave se almacenará únicamente como hash.</DialogDescription></DialogHeader>
                                    {isReadOnly ? (
                                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center gap-2 text-amber-800"><AlertTriangle className="w-5 h-5"/> No tienes permisos para modificar la seguridad.</div>
                                    ) : (
                                        <form onSubmit={handleSecuritySave} className="space-y-4 py-2">
                                            <div className="space-y-2"><Label>Nueva Contraseña</Label><input type="password" required className="w-full p-2 border rounded-md" value={securityData.newPassword} onChange={e => setSecurityData({...securityData, newPassword: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Confirmar Nueva Contraseña</Label><input type="password" required className="w-full p-2 border rounded-md" value={securityData.confirmPassword} onChange={e => setSecurityData({...securityData, confirmPassword: e.target.value})} /></div>
                                            <Button type="submit" className="w-full bg-slate-900">Actualizar Contraseña</Button>
                                        </form>
                                    )}
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>{canModify ? <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 shadow-lg"><Plus className="w-4 h-4 mr-2" /> Nueva entidad vinculada</Button> : <span className="hidden" />}</DialogTrigger>
                                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader><DialogTitle>{editingId ? 'Editar entidad vinculada' : 'Crear entidad vinculada'}</DialogTitle><DialogDescription>Configure identidad y credenciales de acceso para esta entidad.</DialogDescription></DialogHeader>
                                    <form onSubmit={handleSave} className="space-y-6 py-4">
                                        <div className="space-y-4">
                                            <div className="space-y-2"><Label>Nombre</Label><input required disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Usuario</Label><input required disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} /></div>
                                             <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2"><Label>Clave Global {editingId ? '(dejar vacía para conservar)' : ''}</Label><input required={!editingId} type="password" disabled={isReadOnly} className="w-full p-2 border rounded-md disabled:bg-slate-100" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
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
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm relative">
                        <div className="absolute -top-3 -left-3 bg-blue-600 text-white p-2 rounded-lg shadow-md"><Building className="w-6 h-6" /></div>
                        <div className="ml-8">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">Entidad activa</p>
                            <h3 className="mt-1 text-lg font-bold text-blue-900">{activeCompany?.name}</h3>
                            <p className="text-sm text-blue-700">{activeCompany?.parentId ? 'Entidad vinculada' : 'Entidad principal / matriz'}</p>
                            <div className="mt-4 space-y-2 text-sm text-blue-800">
                                {activeCompany?.doc && <div className="font-mono">NIT / Documento: {activeCompany.doc}</div>}
                                <div className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {activeCompany?.address || 'Sin dirección'}</div>
                                <div className="flex items-center gap-2"><Phone className="w-4 h-4"/> {activeCompany?.phone || 'Sin teléfono'}</div>
                            </div>
                            {activeParent && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-4 border-blue-200 bg-white/70 text-blue-700 hover:bg-white"
                                    onClick={() => handleSwitchCompany(activeParent.id)}
                                >
                                    Volver a {activeParent.name}
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="font-semibold text-slate-500 text-sm uppercase tracking-wider">Estructura vinculada</h4>
                            <span className="text-xs font-semibold text-slate-400">{linkedCompanies.length} vinculadas</span>
                        </div>
                        {linkedCompanies.length === 0 ? (
                            <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                <Network className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-slate-500">No hay entidades vinculadas.</p>
                            </div>
                        ) : (
                            linkedCompanies
                                .slice()
                                .sort((a, b) => getDepth(a) - getDepth(b) || String(a.name || '').localeCompare(String(b.name || ''), 'es'))
                                .map(sub => {
                                    const depth = getDepth(sub);
                                    const parent = companyById.get(String(sub.parentId || sub.parent_id || ''));
                                    return (
                                        <motion.div
                                            key={sub.id}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all"
                                            style={{ marginLeft: Math.min((depth - 1) * 18, 54) }}
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex gap-3 min-w-0">
                                                    <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg h-fit"><Building className="w-5 h-5" /></div>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="font-bold text-slate-900">{sub.name}</h3>
                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Nivel {depth}</span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-slate-500">Depende de: {parent?.name || activeCompany?.name || 'Entidad principal'}</p>
                                                        <div className="mt-2 text-sm text-slate-600 flex flex-wrap gap-4">
                                                            <span className="flex items-center gap-1"><User className="w-3 h-3"/> {sub.username || 'Sin usuario'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <Button variant="outline" size="sm" onClick={() => handleSwitchCompany(sub.id)} title="Trabajar en esta entidad">
                                                        Abrir
                                                    </Button>
                                                    {canModify && <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(sub)} title="Editar entidad"><Edit2 className="w-4 h-4" /></Button>}
                                                    {canModify && <Button variant="ghost" size="icon" onClick={() => handleDelete(sub.id)} className="text-red-600" title="Eliminar entidad"><Trash2 className="w-4 h-4" /></Button>}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default Organization;