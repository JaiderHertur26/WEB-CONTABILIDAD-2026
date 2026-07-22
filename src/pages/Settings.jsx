import React, { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Save, Download, Server, Hash, Lock, Building, User, MapPin, Phone, Shield, Upload, FileJson, CheckCircle, RefreshCw, AlertTriangle, Info, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermission } from '@/hooks/usePermission';
import { validateCompanyJSON, mergeCompanies } from '@/contexts/LocalAuthContext';
import { storage } from '@/lib/storage';

const Settings = () => {
    const { activeCompany, companies, setCompanies, isGeneralAdmin } = useCompany();
    const { canModify, isReadOnly } = usePermission();
    const { toast } = useToast();
    const fileInputRef = useRef(null);
    
    // State for Backup/Restore
    const [backupPreview, setBackupPreview] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreReport, setRestoreReport] = useState(null);
    
    // State for Profile/Settings
    const [profileData, setProfileData] = useState({ name: '', doc: '', authSerial: '', address: '', phone: '', username: '' });
    const [voucherSequences, setVoucherSequences] = useState({ income: '1', expense: '1', transfer: '1' });

    useEffect(() => {
      const loadSequences = async () => {
        if (activeCompany) {
          const sequenceKey = `${activeCompany.id}-voucher-sequence`;
          const seqData = await storage.getItem(sequenceKey);
          const sequences = JSON.parse(seqData || '{ "income": 0, "expense": 0, "transfer": 0 }');
          setVoucherSequences({
            income: String(sequences.income || 0),
            expense: String(sequences.expense || 0),
            transfer: String(sequences.transfer || 0)
          });
          setProfileData({
              name: activeCompany.name || '',
              doc: activeCompany.doc || '',
              authSerial: activeCompany.authSerial || '',
              address: activeCompany.address || '',
              phone: activeCompany.phone || '',
              username: activeCompany.username || ''
          });
        }
      };
      loadSequences();
    }, [activeCompany]);

    const handleSaveSettings = async () => {
        if (!canModify) return;
        if (activeCompany) {
          const sequenceKey = `${activeCompany.id}-voucher-sequence`;
          const sequences = { income: parseInt(voucherSequences.income) || 0, expense: parseInt(voucherSequences.expense) || 0, transfer: parseInt(voucherSequences.transfer) || 0 };
          await storage.setItem(sequenceKey, JSON.stringify(sequences));

          const updatedCompany = { ...activeCompany, name: profileData.name, address: profileData.address, phone: profileData.phone, username: profileData.username, password: activeCompany.password, partialPassword: activeCompany.partialPassword, doc: activeCompany.doc, authSerial: activeCompany.authSerial };
          const updatedCompanies = companies.map(c => c.id === activeCompany.id ? updatedCompany : c);
          
          await storage.setItem('companies', JSON.stringify(updatedCompanies));
          setCompanies(); // Will reload from storage
          
          toast({ title: '¡Guardado!', description: 'Perfil y ajustes actualizados.' });
        }
    };

    const handleFullBackup = async () => {
        try {
            const backupData = {
                version: '2.2', 
                timestamp: new Date().toISOString(),
                type: isGeneralAdmin ? 'ADMIN_STRUCTURE_ONLY' : 'COMPANY_DATA_ONLY',
                sourceId: activeCompany?.id || 'admin',
                sourceName: activeCompany?.name || 'Admin System',
                companies: [],
                data: {}
            };

            const sanitizeCompany = (company) => {
                if (!company) return company;
                if (isGeneralAdmin) return company; 
                const { password, partialPassword, authSerial, ...rest } = company;
                return rest;
            };

            if (isGeneralAdmin) {
                backupData.companies = companies.map(sanitizeCompany);
            } else {
                if (!activeCompany) return;
                
                // CORRECCIÓN: Exportar estrictamente SOLO la empresa activa, NO las sucursales vinculadas.
                const relevantCompanies = [activeCompany];
                backupData.companies = relevantCompanies.map(sanitizeCompany);
                
                const dataSuffixes = ['transactions', 'contacts', 'accounts', 'bankAccounts', 'fixedAssets', 'realEstates', 'accountsReceivable', 'accountsPayable', 'initialBalance', 'voucher-sequence', 'cash_accounts', 'inventory', 'offices', 'mass_intentions', 'billing_documents', 'auto_billing_categories'];
                
                for (const comp of relevantCompanies) {
                    for (const suffix of dataSuffixes) {
                        const key = `${comp.id}-${suffix}`;
                        const item = await storage.getItem(key);
                        if (item) {
                            try { backupData.data[key] = JSON.parse(item); } catch (e) { console.error(e); }
                        }
                    }
                }
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const name = isGeneralAdmin ? 'RESPALDO_ADMIN' : `RESPALDO_${activeCompany.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
            link.href = url;
            link.download = `${name}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: 'Copia de Seguridad Generada', description: 'Se ha descargado el archivo.' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar la copia.' });
        }
    };

    const handleFileSelect = (event) => {
        if (!canModify) return;
        const file = event.target.files[0];
        
        event.target.value = null;
        
        if (!file) return;

        if (file.type && file.type !== 'application/json' && !file.name.endsWith('.json')) {
             toast({ variant: 'destructive', title: 'Error', description: 'Archivo JSON inválido' });
             return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let content;
                try {
                    content = JSON.parse(e.target.result);
                } catch (jsonError) {
                    toast({ variant: 'destructive', title: 'Error', description: 'Archivo JSON inválido' });
                    return;
                }

                if (isGeneralAdmin) {
                    if (content.type !== 'ADMIN_STRUCTURE_ONLY') {
                        toast({ variant: 'destructive', title: 'Error', description: "Tipo de archivo incorrecto. Debe ser 'ADMIN_STRUCTURE_ONLY'" });
                        return;
                    }

                    const validation = validateCompanyJSON(content);
                    if (!validation.isValid) {
                        toast({ variant: 'destructive', title: 'Error', description: validation.error || "Estructura de JSON incorrecta. Debe contener: version, type='ADMIN_STRUCTURE_ONLY', companies[]" });
                        return;
                    }
                    
                    if (!content.companies || content.companies.length === 0) {
                        toast({ variant: 'destructive', title: 'Error', description: "No hay empresas válidas en el archivo" });
                        return;
                    }

                    const merged = mergeCompanies(companies, content.companies);
                    
                    await storage.setItem('companies', JSON.stringify(merged));
                    setCompanies(); // Reload context
                    
                    toast({ title: "Empresas restauradas exitosamente", description: `Se actualizaron ${content.companies.length} empresas.` });

                } else {
                     if (content.type === 'ADMIN_STRUCTURE_ONLY') {
                        toast({ variant: 'destructive', title: 'Error', description: "Solo el administrador puede restaurar la estructura." });
                        return;
                    }
                    analyzeAndPreviewBackup(content);
                }

            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error', description: 'Error procesando el archivo.' });
            }
        };
        reader.readAsText(file);
    };

    const analyzeAndPreviewBackup = (content) => {
        if (!content || typeof content !== 'object') {
            toast({ variant: 'destructive', title: 'Error', description: 'Formato inválido.' });
            return;
        }

        const report = {
            validIds: new Set(),
            invalidIds: new Set(),
            ignoredIds: new Set(),
            companiesToUpdate: [],
            dataStats: {}, 
            totalRecords: 0,
            content
        };

        const allowedScope = new Set();
        if (activeCompany) {
            // CORRECCIÓN: El alcance (scope) ahora se limita estrictamente a la empresa activa.
            allowedScope.add(activeCompany.id);
        }

        const backupCompanies = content.companies || [];
        backupCompanies.forEach(bkpComp => {
            if (allowedScope.has(bkpComp.id)) {
                const exists = companies.find(c => c.id === bkpComp.id);
                if (exists) {
                    report.validIds.add(bkpComp.id);
                    report.companiesToUpdate.push({ ...bkpComp, currentName: exists.name });
                } else {
                    report.invalidIds.add(bkpComp.id);
                }
            } else {
                report.ignoredIds.add(bkpComp.id);
            }
        });
        
        if (backupCompanies.length === 0 && content.sourceId) {
             if (allowedScope.has(content.sourceId) && companies.some(c => c.id === content.sourceId)) {
                 report.validIds.add(content.sourceId);
             }
        }

        if (content.data) {
            Object.keys(content.data).forEach(key => {
                let matchedId = null;
                for (const id of report.validIds) {
                    if (key.startsWith(`${id}-`)) {
                        matchedId = id;
                        break;
                    }
                }

                if (matchedId) {
                    const company = companies.find(c => c.id === matchedId);
                    const type = key.substring(matchedId.length + 1);
                    const records = content.data[key];
                    const count = Array.isArray(records) ? records.length : 0;

                    if (!report.dataStats[matchedId]) {
                        report.dataStats[matchedId] = { 
                            name: company?.name || matchedId,
                            total: 0, 
                            details: {} 
                        };
                    }
                    report.dataStats[matchedId].total += count;
                    report.dataStats[matchedId].details[type] = count;
                    report.totalRecords += count;
                }
            });
        }

        setBackupPreview(report);
        setIsPreviewOpen(true);
    };

    const proceedWithRestore = async () => {
        if (!backupPreview || !activeCompany) return;
        setIsRestoring(true);

        try {
            const { content, validIds, companiesToUpdate } = backupPreview;
            const supportedTypes = ['transactions', 'contacts', 'accounts', 'bankAccounts', 'accountsReceivable', 'accountsPayable', 'inventory', 'offices', 'voucher-sequence', 'cash_accounts', 'fixedAssets', 'realEstates', 'initialBalance', 'mass_intentions', 'billing_documents', 'auto_billing_categories'];
            let restoredDataCount = 0;

            if (companiesToUpdate.length > 0) {
                const newCompaniesList = companies.map(existingComp => {
                    const updateData = companiesToUpdate.find(u => u.id === existingComp.id);
                    if (updateData) {
                        return { 
                            ...existingComp,
                            name: updateData.name || existingComp.name,
                            address: updateData.address || existingComp.address,
                            phone: updateData.phone || existingComp.phone,
                            doc: updateData.doc || existingComp.doc,
                            password: existingComp.password,
                            partialPassword: existingComp.partialPassword,
                        };
                    }
                    return existingComp;
                });
                
                await storage.setItem('companies', JSON.stringify(newCompaniesList));
                setCompanies(); // Reload context
            }

            const restoreLog = [];
            for (const targetId of validIds) {
                const company = companies.find(c => c.id === targetId);
                const companyName = company?.name || targetId;

                for (const type of supportedTypes) {
                    const key = `${targetId}-${type}`;
                    await storage.removeItem(key);

                    if (content.data && content.data[key]) {
                        await storage.setItem(key, JSON.stringify(content.data[key]));
                        restoredDataCount += Array.isArray(content.data[key]) ? content.data[key].length : 0;
                    }
                }
                restoreLog.push(companyName);
            }
            
            setRestoreReport({
                companies: restoreLog,
                count: restoredDataCount,
                timestamp: new Date()
            });
            
            window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: 'all-data-update' } }));
            
            toast({ title: 'Restauración Completada', description: `Datos actualizados correctamente.` });
            setIsPreviewOpen(false);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error Crítico', description: 'Falló la restauración. Por favor recargue la página.' });
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <>
            <Helmet><title>Ajustes</title></Helmet>
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                    <div><h1 className="text-4xl font-bold text-slate-900">Ajustes</h1><p className="text-slate-600">Configuración general y datos.</p></div>
                     {isReadOnly && <div className="flex items-center text-slate-400 text-sm font-semibold bg-slate-100 px-3 py-1 rounded-full border"><Lock className="w-4 h-4 mr-1"/> Modo Lectura</div>}
                </div>

                {!isGeneralAdmin && (
                    <>
                        {restoreReport ? (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-green-50 border border-green-200 rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="bg-green-100 p-2 rounded-full"><CheckCircle className="w-6 h-6 text-green-600" /></div>
                                    <div>
                                        <h2 className="text-lg font-bold text-green-900">¡Restauración Exitosa!</h2>
                                        <p className="text-green-700 text-sm">Resumen de operaciones ({format(restoreReport.timestamp, 'HH:mm:ss')})</p>
                                    </div>
                                </div>
                                <div className="bg-white rounded-lg p-4 border border-green-100 text-sm space-y-2 mb-4">
                                    <div className="flex justify-between border-b pb-2"><span className="text-slate-600">Empresas Actualizadas:</span><span className="font-bold">{restoreReport.companies.length}</span></div>
                                    <div className="flex justify-between border-b pb-2"><span className="text-slate-600">Registros Restaurados:</span><span className="font-bold">{restoreReport.count}</span></div>
                                    <div className="pt-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Detalle por Empresa:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {restoreReport.companies.map((c, i) => (
                                                <span key={i} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs border border-green-200">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <Button variant="outline" onClick={() => window.location.reload()} className="bg-white hover:bg-green-50">Recargar Aplicación</Button>
                                    <Button onClick={() => setRestoreReport(null)} className="bg-green-600 hover:bg-green-700">Cerrar Informe</Button>
                                </div>
                            </motion.div>
                        ) : (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <div className="flex items-center gap-2"><Building className="w-5 h-5 text-blue-600" /><div><h2 className="font-bold text-slate-800 leading-tight">Perfil</h2>{activeCompany?.doc && <p className="text-xs text-slate-500 font-mono">NIT: {activeCompany.doc}</p>}</div></div>
                                <span className="text-xs text-slate-400 bg-white px-2 py-1 rounded border">ID: {activeCompany?.id}</span>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="space-y-2"><Label>Nombre</Label><div className="relative"><Building className="absolute left-3 top-3 text-slate-400 w-4 h-4" /><input disabled={isReadOnly} value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} className="w-full pl-9 p-2 border rounded-md text-sm outline-none focus:border-blue-500" /></div></div>
                                    <div className="space-y-2"><Label>Dirección</Label><div className="relative"><MapPin className="absolute left-3 top-3 text-slate-400 w-4 h-4" /><input disabled={isReadOnly} value={profileData.address} onChange={e => setProfileData({...profileData, address: e.target.value})} className="w-full pl-9 p-2 border rounded-md text-sm outline-none focus:border-blue-500" /></div></div>
                                    <div className="space-y-2"><Label>Teléfono</Label><div className="relative"><Phone className="absolute left-3 top-3 text-slate-400 w-4 h-4" /><input disabled={isReadOnly} value={profileData.phone} onChange={e => setProfileData({...profileData, phone: e.target.value})} className="w-full pl-9 p-2 border rounded-md text-sm outline-none focus:border-blue-500" /></div></div>
                                </div>
                                <div className="bg-yellow-50/50 border border-yellow-100 rounded-lg p-4 space-y-4"><div className="flex items-center gap-2 text-yellow-800 font-semibold text-sm"><Shield className="w-4 h-4" /> Credenciales</div><div className="space-y-2"><Label className="text-xs">Usuario</Label><div className="relative"><User className="absolute left-3 top-2.5 text-slate-400 w-3.5 h-3.5" /><input disabled={isReadOnly} value={profileData.username} onChange={e => setProfileData({...profileData, username: e.target.value})} className="w-full pl-8 p-2 border rounded-md text-sm bg-white" /></div></div><p className="text-xs text-yellow-900 mt-2">Para cambiar la contraseña, ve a "Mi Organización".</p></div>
                            </div>
                        </motion.div>
                        )}

                        {!restoreReport && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-xl shadow-sm border p-6">
                                <div className="flex items-center mb-4"><Hash className="w-6 h-6 text-purple-600 mr-3" /><h2 className="text-lg font-bold text-slate-900">Secuencias</h2></div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1"><Label className="text-xs">Ingresos</Label><input type="number" min="0" value={voucherSequences.income} onChange={(e) => setVoucherSequences({...voucherSequences, income: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" disabled={isReadOnly} /></div>
                                    <div className="space-y-1"><Label className="text-xs">Gastos</Label><input type="number" min="0" value={voucherSequences.expense} onChange={(e) => setVoucherSequences({...voucherSequences, expense: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" disabled={isReadOnly} /></div>
                                    <div className="space-y-1"><Label className="text-xs">Transf.</Label><input type="number" min="0" value={voucherSequences.transfer} onChange={(e) => setVoucherSequences({...voucherSequences, transfer: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" disabled={isReadOnly} /></div>
                                </div>
                            </motion.div>
                        </div>
                        )}
                        {canModify && !restoreReport && <div className="flex justify-end"><Button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-700 shadow-md"><Save className="w-4 h-4 mr-2" />Guardar Todo</Button></div>}
                    </>
                )}
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                    <div className="flex items-center justify-between"><div className="flex items-center"><Server className="w-6 h-6 text-green-600 mr-3" /><h2 className="text-xl font-bold text-slate-900">Datos</h2></div><span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-800 rounded-full">V2.2</span></div>
                    
                    {/* Mensaje de advertencia actualizado */}
                    {!isGeneralAdmin && <div className="flex gap-2 items-start text-xs bg-slate-50 p-2 rounded"><Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" /><span>La restauración actualizará <strong>únicamente</strong> los datos de la empresa/parroquia en la que estás actualmente logueado. No afectará a sucursales o capillas vinculadas.</span></div>}
                    
                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col items-center text-center gap-3"><div className="bg-white p-2 rounded-full shadow-sm"><Download className="w-6 h-6 text-slate-600" /></div><div className="text-sm"><p className="font-semibold text-slate-700">Exportar</p><p className="text-slate-500 text-xs">Descargar copia local</p></div><Button onClick={handleFullBackup} variant="outline" className="w-full mt-auto"><Download className="w-4 h-4 mr-2" /> Generar</Button></div>
                        {canModify && <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 flex flex-col items-center text-center gap-3"><div className="bg-white p-2 rounded-full shadow-sm"><Upload className="w-6 h-6 text-orange-500" /></div><div className="text-sm"><p className="font-semibold text-orange-800">Importar</p><p className="text-orange-600/80 text-xs">Restaurar respaldo</p></div><input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".json" className="hidden" /><Button onClick={() => fileInputRef.current.click()} variant="default" className="w-full mt-auto bg-orange-600 hover:bg-orange-700 text-white border-none"><Upload className="w-4 h-4 mr-2" /> Cargar</Button></div>}
                    </div>
                </motion.div>
            </motion.div>
            
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl"><FileJson className="w-6 h-6 text-blue-600" />Restaurar Datos</DialogTitle>
                        <DialogDescription>Revisa el plan de restauración antes de confirmar.</DialogDescription>
                    </DialogHeader>
                    
                    {backupPreview && (
                        <div className="overflow-y-auto flex-1 pr-2 space-y-4 py-4">
                            {/* Validation Warnings */}
                            {backupPreview.invalidIds.size > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-red-800">
                                        <p className="font-bold">IDs No Encontrados ({backupPreview.invalidIds.size})</p>
                                        <p>Algunas empresas en el respaldo no existen en su base de datos y serán ignoradas. (Solo se permiten actualizaciones).</p>
                                    </div>
                                </div>
                            )}

                            {/* Context Warnings */}
                            {backupPreview.ignoredIds.size > 0 && (
                                <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                                    <Info className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-slate-700">
                                        <p className="font-bold">Fuera de Contexto ({backupPreview.ignoredIds.size})</p>
                                        <p>Se omitirán datos del archivo que no corresponden exclusivamente a esta Parroquia.</p>
                                    </div>
                                </div>
                            )}

                            {/* Main Action Plan */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b pb-1">Datos a Restaurar</h4>
                                {backupPreview.validIds.size === 0 ? (
                                    <p className="text-sm text-slate-500 italic">No se encontraron datos que pertenezcan a esta entidad en el archivo.</p>
                                ) : (
                                    Object.keys(backupPreview.dataStats).map(id => {
                                        const stat = backupPreview.dataStats[id];
                                        return (
                                            <div key={id} className="bg-white border rounded-lg p-3 shadow-sm">
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Building className="w-4 h-4 text-blue-500" />
                                                        <span className="font-bold text-sm text-slate-800">{stat.name}</span>
                                                    </div>
                                                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">ID: {id}</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                                    {Object.entries(stat.details).map(([type, count]) => (
                                                        <div key={type} className="flex justify-between">
                                                            <span className="capitalize">{type.replace(/_/g, ' ')}:</span>
                                                            <span className="font-mono font-bold text-slate-900">{count}</span>
                                                        </div>
                                                    ))}
                                                    <div className="col-span-2 border-t pt-1 mt-1 flex justify-between font-bold text-slate-800">
                                                        <span>Total Registros a Importar:</span>
                                                        <span>{stat.total}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                                    <div className="text-xs text-amber-900">
                                        <p className="font-bold mb-1">Advertencia de Reemplazo</p>
                                        <p>Esta acción <span className="font-bold underline">eliminará y reemplazará por completo</span> los datos de esta Parroquia con los que vienen en el archivo. No se puede deshacer.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <DialogFooter className="mt-2 pt-2 border-t">
                        <Button variant="outline" onClick={() => setIsPreviewOpen(false)} disabled={isRestoring}>Cancelar</Button>
                        <Button 
                            onClick={proceedWithRestore} 
                            disabled={isRestoring || !backupPreview || backupPreview.validIds.size === 0} 
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {isRestoring ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                            Confirmar Restauración
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default Settings;