import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Building, Plus, Network, Trash2, MapPin, Phone, User, Edit2, Shield, AlertTriangle, ArrowRight, CornerUpLeft, Layers3, BadgeCheck } from 'lucide-react';
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
            <div className="max-w-6xl mx-auto space-y-5 sm:space-y-7">
                <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.9)] sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-blue-500/15 p-2.5 text-blue-100 ring-1 ring-blue-400/20"><Network className="h-5 w-5" /></div>
                                <div>
                                    <h1 className="company-hero-title text-3xl font-black tracking-[-0.035em] text-white">Mi Organización</h1>
                                    <p className="mt-1 text-sm text-slate-300">Estructura, accesos y entidades vinculadas.</p>
                                </div>
                            </div>
                        </div>
                        <div className="hidden gap-2 sm:flex">
                             <Dialog open={isSecurityDialogOpen} onOpenChange={setIsSecurityDialogOpen}>
                                <DialogTrigger asChild>{canModify ? <Button variant="outline" className="border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 hover:text-white"><Shield className="w-4 h-4 mr-2" /> Seguridad</Button> : <span className="hidden" />}</DialogTrigger>
                                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg max-h-[92dvh] overflow-y-auto">
                                    <DialogHeader><DialogTitle>Cambiar Contraseña Global</DialogTitle><DialogDescription>La sesión actual ya acredita tu identidad. La nueva clave se almacenará únicamente como hash.</DialogDescription></DialogHeader>
                                    {isReadOnly ? (
                                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center gap-2 text-amber-800"><AlertTriangle className="w-5 h-5"/> No tienes permisos para modificar la seguridad.</div>
                                    ) : (
                                        <form onSubmit={handleSecuritySave} className="space-y-4 py-2">
                                            <div className="space-y-2"><Label>Nueva Contraseña</Label><input type="password" required className="w-full p-2.5 border rounded-xl" value={securityData.newPassword} onChange={e => setSecurityData({...securityData, newPassword: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Confirmar Nueva Contraseña</Label><input type="password" required className="w-full p-2.5 border rounded-xl" value={securityData.confirmPassword} onChange={e => setSecurityData({...securityData, confirmPassword: e.target.value})} /></div>
                                            <Button type="submit" className="h-11 w-full rounded-xl bg-slate-950 font-bold text-white hover:bg-slate-800">Actualizar Contraseña</Button>
                                        </form>
                                    )}
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>{canModify ? <Button onClick={handleOpenCreate} className="bg-blue-600 font-bold text-white shadow-sm hover:bg-blue-500"><Plus className="w-4 h-4 mr-2" /> Nueva entidad</Button> : <span className="hidden" />}</DialogTrigger>
                                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
                                    <DialogHeader><DialogTitle>{editingId ? 'Editar entidad vinculada' : 'Crear entidad vinculada'}</DialogTitle><DialogDescription>Configure identidad y credenciales de acceso para esta entidad.</DialogDescription></DialogHeader>
                                    <form onSubmit={handleSave} className="space-y-5 py-3">
                                        <div className="space-y-4">
                                            <div className="space-y-2"><Label>Nombre</Label><input required disabled={isReadOnly} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/60 disabled:bg-slate-100" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                                            <div className="space-y-2"><Label>Usuario</Label><input required disabled={isReadOnly} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/60 disabled:bg-slate-100" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} /></div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2"><Label>Clave Global {editingId ? '(dejar vacía para conservar)' : ''}</Label><input required={!editingId} type="password" disabled={isReadOnly} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/60 disabled:bg-slate-100" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
                                                <div className="space-y-2"><Label>Clave Parcial</Label><input type="password" disabled={isReadOnly} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/60 disabled:bg-slate-100" value={formData.partialPassword} onChange={e => setFormData({...formData, partialPassword: e.target.value})} /></div>
                                            </div>
                                        </div>
                                        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>{canModify && <Button type="submit" className="bg-green-600 hover:bg-green-700">Guardar</Button>}</div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-200">
                            <Layers3 className="h-3.5 w-3.5" /> {organizationScope.length} {organizationScope.length === 1 ? 'entidad' : 'entidades'}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${accessLevel === 'full' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'}`}>
                            <BadgeCheck className="h-3.5 w-3.5" /> {accessLevel === 'full' ? 'Acceso Total' : 'Acceso Parcial'}
                        </span>
                        {isConsolidatedReadOnly && <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-[11px] font-bold text-violet-100">Consolidada · Solo lectura</span>}
                    </div>

                    {canModify && (
                        <div className="grid grid-cols-2 gap-2 sm:hidden">
                            <Button variant="outline" onClick={() => setIsSecurityDialogOpen(true)} className="h-11 whitespace-nowrap rounded-xl border-white/15 bg-white/10 px-3 text-sm text-white shadow-none hover:bg-white/15 hover:text-white"><Shield className="w-4 h-4 mr-2" /> Seguridad</Button>
                            <Button onClick={handleOpenCreate} className="h-11 whitespace-nowrap rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm hover:bg-blue-500"><Plus className="w-4 h-4 mr-2" /> Nueva entidad</Button>
                        </div>
                    )}
                </motion.div>
                <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5 lg:gap-7">
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-700 via-blue-700 to-indigo-800 text-white shadow-[0_18px_50px_-28px_rgba(30,64,175,0.75)]"
                    >
                        <div className="p-5 sm:p-6">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                                        <Building className="h-5 w-5" />
                                    </div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-100">Entidad activa</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-bold text-blue-50 ring-1 ring-white/15">
                                    {activeCompany?.parentId ? 'Vinculada' : 'Principal'}
                                </span>
                            </div>
                            <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-white sm:text-[28px]">{activeCompany?.name}</h2>
                            <div className="mt-4 grid grid-cols-2 gap-2.5">
                                {activeCompany?.doc && (
                                    <div className="min-w-0 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-100">NIT / Documento</span>
                                        <span className="mt-0.5 block truncate text-sm font-bold text-white">{activeCompany.doc}</span>
                                    </div>
                                )}
                                <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm ring-1 ring-white/10">
                                    <Phone className="h-4 w-4 shrink-0 text-blue-100" />
                                    <span className="truncate font-semibold">{activeCompany?.phone || 'Sin teléfono'}</span>
                                </div>
                                <div className="col-span-2 flex min-w-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm ring-1 ring-white/10">
                                    <MapPin className="h-4 w-4 shrink-0 text-blue-100" />
                                    <span className="truncate">{activeCompany?.address || 'Sin dirección'}</span>
                                </div>
                            </div>
                            {activeParent && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-4 h-10 max-w-full rounded-xl border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white"
                                    onClick={() => handleSwitchCompany(activeParent.id)}
                                >
                                    <CornerUpLeft className="mr-2 h-4 w-4 shrink-0" />
                                    <span className="truncate">Volver a {activeParent.name}</span>
                                </Button>
                            )}
                        </div>
                        <div className="border-t border-white/10 bg-black/5 px-5 py-3 text-xs text-blue-100 sm:px-6">
                            {linkedCompanies.length > 0
                                ? linkedCompanies.length + ' ' + (linkedCompanies.length === 1 ? 'entidad vinculada' : 'entidades vinculadas') + ' dentro de este alcance'
                                : 'Esta entidad no tiene dependencias vinculadas'}
                        </div>
                    </motion.section>
                    <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3 px-0.5">
                            <div>
                                <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-600">Estructura vinculada</h3>
                                <p className="mt-0.5 text-xs text-slate-400">Abre una entidad para trabajar en ella de forma individual.</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{linkedCompanies.length}</span>
                        </div>
                        {linkedCompanies.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Network className="h-6 w-6" /></div>
                                <p className="mt-3 font-semibold text-slate-700">Sin entidades vinculadas</p>
                                <p className="mt-1 text-sm text-slate-500">Cuando agregues una dependencia, aparecerá aquí.</p>
                            </div>
                        ) : (
                            linkedCompanies
                                .slice()
                                .sort((a, b) => getDepth(a) - getDepth(b) || String(a.name || '').localeCompare(String(b.name || ''), 'es'))
                                .map((sub, index) => {
                                    const depth = getDepth(sub);
                                    const parent = companyById.get(String(sub.parentId || sub.parent_id || ''));
                                    return (
                                        <motion.article
                                            key={sub.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(index * 0.05, 0.2) }}
                                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
                                        >
                                            <div className="p-4 sm:p-5">
                                                <div className="flex min-w-0 items-start gap-3.5">
                                                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                                                        <Building className="h-5 w-5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h4 className="min-w-0 text-[17px] font-bold leading-snug text-slate-900 sm:text-lg">{sub.name}</h4>
                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-500">Nivel {depth}</span>
                                                        </div>
                                                        <p className="mt-1.5 truncate text-xs text-slate-500" title={parent?.name || activeCompany?.name || 'Entidad principal'}>
                                                            Depende de · <span className="font-semibold text-slate-600">{parent?.name || activeCompany?.name || 'Entidad principal'}</span>
                                                        </p>
                                                        <div className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                                                            <User className="h-3.5 w-3.5 shrink-0" />
                                                            <span className="truncate">{sub.username || 'Sin usuario asignado'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:px-4">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleSwitchCompany(sub.id)}
                                                    className="h-9 flex-1 justify-between rounded-xl border-slate-200 bg-white px-3 font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                                    title="Trabajar en esta entidad"
                                                >
                                                    <span>Abrir entidad</span><ArrowRight className="h-4 w-4" />
                                                </Button>
                                                {canModify && (
                                                    <>
                                                        <Button variant="outline" size="icon" onClick={() => handleOpenEdit(sub)} className="h-9 w-9 shrink-0 rounded-xl border-slate-200 bg-white text-slate-600" title="Editar entidad"><Edit2 className="h-4 w-4" /></Button>
                                                        <Button variant="outline" size="icon" onClick={() => handleDelete(sub.id)} className="h-9 w-9 shrink-0 rounded-xl border-red-100 bg-white text-red-600 hover:bg-red-50 hover:text-red-700" title="Eliminar entidad"><Trash2 className="h-4 w-4" /></Button>
                                                    </>
                                                )}
                                            </div>
                                        </motion.article>
                                    );
                                })
                        )}
                    </section>
                </div>
            </div>
        </>
    );
};

export default Organization;