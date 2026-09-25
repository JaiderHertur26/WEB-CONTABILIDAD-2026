import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Building, Building2, Key, Calculator, Check, Copy, ShieldCheck, Eye, EyeOff, Lock, User, RefreshCcw, Clock3, CheckCircle2, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/LocalAuthContext';
import { useDestructiveAction } from '@/contexts/DestructiveActionContext';
import { createCompanySecure, deleteCompanySecure, issueRegistrationToken, updateCompanySecure } from '@/lib/secureApi';

const Companies = () => {
    const { companies, setCompanies, updateCompanyCredentials } = useCompany();
    const { sessionToken } = useAuth();
    const { requestDestructiveAuthorization, releaseDestructiveAuthorization } = useDestructiveAction();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [serialDialogOpen, setSerialDialogOpen] = useState(false);
    const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState(null);
    const [selectedCompanyForSerial, setSelectedCompanyForSerial] = useState(null);
    const [selectedCompanyForCredentials, setSelectedCompanyForCredentials] = useState(null);
    const { toast } = useToast();

    const activeCompanies = companies.filter(company => Boolean(company.username)).length;
    const pendingCompanies = Math.max(companies.length - activeCompanies, 0);
    const getParentName = (company) => {
        if (!company?.parentId) return 'Entidad principal';
        return companies.find(item => String(item.id) === String(company.parentId))?.name || 'Entidad dependiente';
    };

    const handleSaveCompany = async (companyData) => {
        try {
            if (!sessionToken) throw new Error('Sesión administrativa no disponible');
            const isNew = !editingCompany;
            const companyId = isNew ? Date.now().toString() : editingCompany.id;

            if (isNew) {
                await createCompanySecure(sessionToken, {
                    id: companyId,
                    name: companyData.name,
                    doc: companyData.doc,
                    parentId: null,
                });
                toast({ title: "Empresa pre-registrada", description: "Creada mediante sesión segura. Emite ahora su código de activación." });
            } else {
                await updateCompanySecure(sessionToken, companyId, {
                    name: companyData.name,
                    doc_nit: companyData.doc,
                });
                toast({ title: "Datos actualizados", description: "Modificados mediante sesión segura." });
            }

            if (typeof setCompanies === 'function') await setCompanies();
            setDialogOpen(false);
        } catch (err) {
            console.error("Error guardando empresa:", err);
            toast({ variant: "destructive", title: "Error", description: err?.message || "No se pudo completar la operación segura." });
        }
    };

    const handleDeleteCompany = async (id) => {
        const target = companies.find(company => String(company.id) === String(id));
        const destructiveAuthorization = await requestDestructiveAuthorization({
            title: 'Eliminar empresa',
            subject: target?.name || 'Empresa seleccionada',
            description: 'Esta operación es estructural y permanente. Solo continuará después de revalidar las credenciales del Administrador General.',
        });
        if (!destructiveAuthorization?.sessionToken) return;

        try {
            await deleteCompanySecure(destructiveAuthorization.sessionToken, id);
            if (typeof setCompanies === 'function') await setCompanies();
            toast({ title: "Empresa eliminada permanentemente" });
        } catch (err) {
            console.error("Error eliminando empresa:", err);
            toast({ variant: "destructive", title: "Eliminación bloqueada", description: err?.message || "No se pudo eliminar la empresa." });
        } finally {
            await releaseDestructiveAuthorization(destructiveAuthorization);
        }
    };
    
    const handleOpenSerial = (company) => {
        setSelectedCompanyForSerial(company);
        setSerialDialogOpen(true);
    };

    const handleOpenCredentials = (company) => {
        setSelectedCompanyForCredentials(company);
        setCredentialsDialogOpen(true);
    }
    
    const handleUpdateCredentials = async (companyId, newData) => {
        const ok = await updateCompanyCredentials(companyId, newData);
        if (ok) setCredentialsDialogOpen(false);
    };

    return (
        <>
        <Helmet><title>Gestión de Empresas - JaiderHerTur26</title></Helmet>
        <div className="min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50/60">
            <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6 px-4 py-5 sm:px-6 sm:py-8">
                <motion.section
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 sm:p-8 text-white shadow-xl shadow-slate-900/10"
                >
                    <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
                    <div className="absolute -bottom-20 left-12 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
                    <div className="relative">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                            <div className="max-w-2xl">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur">
                                    <Building2 className="h-6 w-6 text-indigo-200" />
                                </div>
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">Administración General</p>
                                <h1 className="company-hero-title mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Gestión de Empresas</h1>
                                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                                    Administra el directorio empresarial, las activaciones y las credenciales desde un solo lugar.
                                </p>
                            </div>
                            <Button
                                onClick={() => { setEditingCompany(null); setDialogOpen(true); }}
                                className="h-12 w-full rounded-xl bg-white px-5 font-semibold text-slate-950 shadow-lg hover:bg-slate-100 lg:w-auto"
                            >
                                <Plus className="mr-2 h-4 w-4" /> Pre-registrar Empresa
                            </Button>
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 sm:p-4">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total</p>
                                <p className="mt-1 text-2xl font-bold">{companies.length}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-300/10 bg-emerald-400/[0.08] p-3 sm:p-4">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-200">Activas</p>
                                <p className="mt-1 text-2xl font-bold">{activeCompanies}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-300/10 bg-amber-400/[0.08] p-3 sm:p-4">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-200">Pendientes</p>
                                <p className="mt-1 text-2xl font-bold">{pendingCompanies}</p>
                            </div>
                        </div>
                    </div>
                </motion.section>

                <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                        <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-blue-950">Administración protegida</p>
                        <p className="mt-1 text-sm leading-5 text-blue-800">
                            Las contraseñas actuales no se muestran. Puedes restablecer credenciales y emitir códigos de activación temporales cuando sea necesario.
                        </p>
                    </div>
                </div>

                {companies.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-14 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                            <Calculator className="h-8 w-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">No hay empresas registradas</h3>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                            Pre-registra la primera entidad para emitir su código de activación y completar el acceso.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {companies.map((company, index) => (
                            <motion.article
                                key={company.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.04 }}
                                className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                            >
                                <div className="p-4 sm:p-5">
                                    <div className="flex items-start gap-3">
                                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${company.username ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            <Building className="h-6 w-6" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <h3 className="break-words text-base font-bold leading-snug text-slate-950 sm:text-lg">{company.name}</h3>
                                                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                                        <Network className="h-3.5 w-3.5" />
                                                        <span className="truncate">{getParentName(company)}</span>
                                                    </div>
                                                </div>
                                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${company.username ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}>
                                                    {company.username ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                                                    {company.username ? 'Activa' : 'Pendiente'}
                                                </span>
                                            </div>

                                            <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3">
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">NIT / Documento</p>
                                                <p className="mt-1 break-all text-sm font-semibold text-slate-700">{company.doc || 'Sin documento'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        {company.username && (
                                            <Button
                                                variant="outline"
                                                onClick={() => handleOpenCredentials(company)}
                                                className="h-11 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
                                            >
                                                <Lock className="mr-2 h-4 w-4" /> Credenciales
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            onClick={() => handleOpenSerial(company)}
                                            className={`h-11 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 ${company.username ? '' : 'col-span-2'}`}
                                        >
                                            <Key className="mr-2 h-4 w-4" /> Activación
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70">
                                    <button
                                        type="button"
                                        onClick={() => { setEditingCompany(company); setDialogOpen(true); }}
                                        className="flex h-12 items-center justify-center gap-2 border-r border-slate-100 text-sm font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                                    >
                                        <Edit2 className="h-4 w-4" /> Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteCompany(company.id)}
                                        className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" /> Eliminar
                                    </button>
                                </div>
                            </motion.article>
                        ))}
                    </div>
                )}
            </div>
        </div>
        
        <CompanyDialog 
            open={dialogOpen} 
            onOpenChange={setDialogOpen} 
            onSave={handleSaveCompany} 
            company={editingCompany} 
        />
        
        {selectedCompanyForSerial && (
            <SerialDialog 
                open={serialDialogOpen} 
                onOpenChange={setSerialDialogOpen} 
                company={selectedCompanyForSerial}
                sessionToken={sessionToken}
            />
        )}

        {selectedCompanyForCredentials && (
            <CredentialsDialog
                open={credentialsDialogOpen}
                onOpenChange={setCredentialsDialogOpen}
                company={selectedCompanyForCredentials}
                onSave={handleUpdateCredentials}
            />
        )}
        </>
    );
};

const CompanyDialog = ({ open, onOpenChange, onSave, company }) => {
    const [formData, setFormData] = useState({ name: '', doc: '' });
    
    useEffect(() => {
        if (company) {
            setFormData({ 
                name: company.name || '', 
                doc: company.doc || '',
            });
        } else {
            setFormData({ name: '', doc: '' });
        }
    }, [company, open]);

    const handleSubmit = (e) => { 
        e.preventDefault(); 
        onSave(formData); 
    };

    return(
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[24px] border-0 p-0 shadow-2xl sm:max-w-md">
                <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 text-white">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                        <Building2 className="h-5 w-5 text-indigo-200" />
                    </div>
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-xl text-white">{company ? 'Editar empresa' : 'Pre-registrar empresa'}</DialogTitle>
                        <DialogDescription className="leading-5 text-slate-300">
                            {company
                                ? 'Actualiza los datos básicos de la entidad sin alterar sus credenciales ni información contable.'
                                : 'Crea la entidad básica. Después podrás emitir un código de activación seguro y temporal.'}
                        </DialogDescription>
                    </DialogHeader>
                </div>
                <form onSubmit={handleSubmit} className="space-y-5 p-5">
                    <div className="space-y-2">
                        <Label htmlFor="doc" className="text-xs font-semibold uppercase tracking-wide text-slate-500">NIT / Documento</Label>
                        <input
                            id="doc"
                            required
                            value={formData.doc}
                            onChange={e => setFormData({...formData, doc: e.target.value})}
                            className="flex h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                            placeholder="Ej: 900123456"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre de la Empresa</Label>
                        <input
                            id="name"
                            required
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="flex h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                            placeholder="Ej: Empresa S.A.S"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <DialogClose asChild>
                            <Button type="button" variant="outline" className="h-11 rounded-xl">Cancelar</Button>
                        </DialogClose>
                        <Button type="submit" className="h-11 rounded-xl bg-slate-950 font-semibold hover:bg-slate-800">
                            {company ? 'Guardar cambios' : 'Pre-registrar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const SerialDialog = ({ open, onOpenChange, company, sessionToken }) => {
    const [activationCode, setActivationCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [issuing, setIssuing] = useState(false);

    useEffect(() => {
        if (open) {
            setActivationCode('');
            setCopied(false);
        }
    }, [open, company?.id]);

    const issueCode = async () => {
        if (!company || !sessionToken) return;
        try {
            setIssuing(true);
            const code = await issueRegistrationToken(sessionToken, company.id);
            setActivationCode(code || '');
        } catch (error) {
            console.error(error);
            setActivationCode('');
        } finally {
            setIssuing(false);
        }
    };

    const copyToClipboard = () => {
        if (activationCode) {
            navigator.clipboard.writeText(activationCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[24px] border-0 p-0 shadow-2xl sm:max-w-lg">
                <div className="bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-900 px-5 py-6 text-white">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-400/15 ring-1 ring-white/10">
                        <Key className="h-5 w-5 text-indigo-200" />
                    </div>
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-xl text-white">Código de activación</DialogTitle>
                        <DialogDescription className="leading-5 text-slate-300">
                            Código aleatorio, temporal y de un solo uso. Emitir uno nuevo invalida inmediatamente el anterior.
                        </DialogDescription>
                    </DialogHeader>
                </div>
                <div className="space-y-5 p-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Entidad</p>
                        <h4 className="mt-1 font-bold leading-snug text-slate-950">{company?.name}</h4>
                        <p className="mt-1 text-sm text-slate-500">NIT: {company?.doc}</p>
                    </div>
                    {activationCode ? (
                        <div className="relative rounded-2xl border border-indigo-200 bg-indigo-50 p-4 pr-12">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-500">Código generado</p>
                            <p className="break-all font-mono text-base font-bold tracking-wide text-indigo-950">{activationCode}</p>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 top-2 h-9 w-9 rounded-xl text-indigo-700 hover:bg-indigo-100"
                                onClick={copyToClipboard}
                            >
                                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-900">
                            El código nunca se almacena en texto legible. Por seguridad, se mostrará una sola vez después de emitirlo.
                        </div>
                    )}
                    <Button onClick={issueCode} disabled={issuing} className="h-12 w-full rounded-xl bg-indigo-700 font-semibold hover:bg-indigo-800">
                        <RefreshCcw className={"mr-2 h-4 w-4 "+(issuing?'animate-spin':'')} />
                        {activationCode ? 'Emitir un código nuevo' : 'Emitir código de activación'}
                    </Button>
                    <DialogClose asChild>
                        <Button variant="outline" className="h-11 w-full rounded-xl">Cerrar</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const CredentialsDialog = ({ open, onOpenChange, company, onSave }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showPartial, setShowPartial] = useState(false);
    const [passwords, setPasswords] = useState({ password: '', partialPassword: '' });

    useEffect(() => {
        if (open) {
            setPasswords({ password: '', partialPassword: '' });
            setShowPassword(false);
            setShowPartial(false);
        }
    }, [company, open]);

    const handleSave = () => {
        if (onSave) onSave(company.id, passwords);
    };

    const handleGenerate = (field) => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 12; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        setPasswords(prev => ({ ...prev, [field]: result }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[24px] border-0 p-0 shadow-2xl sm:max-w-md">
                <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-6 text-white">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 ring-1 ring-white/10">
                        <Lock className="h-5 w-5 text-emerald-200" />
                    </div>
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-xl text-white">Gestión de credenciales</DialogTitle>
                        <DialogDescription className="leading-5 text-slate-300">
                            Las contraseñas actuales nunca se muestran. Aquí puedes establecer nuevas credenciales, almacenadas únicamente como hash.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="space-y-5 p-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Usuario asignado</p>
                        <div className="mt-2 flex items-center gap-2 font-semibold text-slate-900">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                                <User className="h-4 w-4 text-slate-500" />
                            </div>
                            <span className="break-all">{company?.username || 'No registrado'}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Contraseña global · acceso total</Label>
                            <p className="mt-1 text-xs leading-5 text-slate-500">Permite administrar, modificar, eliminar e importar información de la entidad.</p>
                        </div>
                        <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={passwords.password}
                                onChange={(e) => setPasswords({...passwords, password: e.target.value})}
                                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                                placeholder="Nueva contraseña"
                            />
                            <button type="button" onClick={() => handleGenerate('password')} title="Generar nueva" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-700">
                                <RefreshCcw className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide text-amber-700">Contraseña parcial · acceso limitado</Label>
                            <p className="mt-1 text-xs leading-5 text-slate-500">Permite registrar información nueva, pero no modificar, eliminar ni importar registros existentes.</p>
                        </div>
                        <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-amber-300 focus-within:ring-4 focus-within:ring-amber-100">
                            <input
                                type={showPartial ? "text" : "password"}
                                value={passwords.partialPassword}
                                onChange={(e) => setPasswords({...passwords, partialPassword: e.target.value})}
                                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                                placeholder="Nueva contraseña parcial"
                            />
                            <button type="button" onClick={() => handleGenerate('partialPassword')} title="Generar nueva" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-700">
                                <RefreshCcw className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setShowPartial(!showPartial)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                {showPartial ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <DialogClose asChild>
                            <Button variant="outline" className="h-11 rounded-xl">Cancelar</Button>
                        </DialogClose>
                        <Button onClick={handleSave} className="h-11 rounded-xl bg-slate-950 font-semibold hover:bg-slate-800">Guardar</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default Companies;