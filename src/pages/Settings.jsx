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
import { validateCompanyJSON, mergeCompanies, saveCompanies } from '@/contexts/LocalAuthContext';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase'; // IMPORTANTE PARA LA RESTAURACIÓN

const Settings = () => {
    const { activeCompany, companies, setCompanies, isGeneralAdmin, updateCompanyCredentials } = useCompany();
    const { canModify, isReadOnly } = usePermission();
    const { toast } = useToast();
    const fileInputRef = useRef(null);
    
    const [backupPreview, setBackupPreview] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreReport, setRestoreReport] = useState(null);
    
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

          await updateCompanyCredentials(activeCompany.id, {
              name: profileData.name, 
              address: profileData.address, 
              phone: profileData.phone, 
              username: profileData.username
          });
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
                        toast({ variant: 'destructive', title: 'Error', description: validation.error });
                        return;
                    }
                    
                    if (!content.companies || content.companies.length === 0) {
                        toast({ variant: 'destructive', title: 'Error', description: "No hay empresas válidas en el archivo" });
                        return;
                    }

                    const merged = mergeCompanies(companies, content.companies);
                    
                    await saveCompanies(merged);
                    setCompanies(); 
                    toast({ title: "Empresas restauradas en la nube", description: `Se actualizaron ${content.companies.length} empresas.` });

                } else {
                     if (content.type === 'ADMIN_STRUCTURE_ONLY') {
                        toast({ variant: 'destructive', title: 'Error', description: "Solo el administrador puede restaurar la estructura." });
                        return;
                    }
                    analyzeAndPreviewBackup(content);
                }

            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error', description: error.message || 'Error procesando el archivo.' });
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
        if (activeCompany) allowedScope.add(activeCompany.id);

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
                        report.dataStats[matchedId] = { name: company?.name || matchedId, total: 0, details: {} };
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
                        };
                    }
                    return existingComp;
                });
                
                await saveCompanies(newCompaniesList);
                setCompanies(); 
            }

            const restoreLog = [];
            for (const targetId of validIds) {
                const company = companies.find(c => c.id === targetId);
                const companyName = company?.name || targetId;

                for (const type of supportedTypes) {
                    const key = `${targetId}-${type}`;
                    await storage.removeItem(key);

                    if (content.data && content.data[key]) {
                        const records = content.data[key];
                        
                        // Guardar en la PC local
                        await storage.setItem(key, JSON.stringify(records));
                        
                        // NUEVO: Enviar directo a Supabase (La Nube)
                        const { error: syncError } = await supabase
                            .from('app_data_sync')
                            .upsert({
                                company_id: String(targetId),
                                storage_key: type,
                                data: records,
                                updated_at: new Date().toISOString()
                            });

                        if (syncError) console.error("Error subiendo datos a Supabase:", syncError);

                        restoredDataCount += Array.isArray(records) ? records.length : 0;
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
            toast({ title: 'Restauración en la Nube', description: `Datos subidos a Supabase correctamente.` });
            setIsPreviewOpen(false);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error Crítico', description: 'Falló la subida a la nube.' });
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
                                    <div className="flex justify-between border-b pb-2"><span className="text-slate-600">Registros Restaurados (Nube):</span><span className="font-bold">{restoreReport.count}</span></div>
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
                    <div className="flex items-center justify-between"><div className="flex items-center"><Server className="w-6 h-6 text-green-600 mr-3" /><h2 className="text-xl font-bold text-slate-900">Datos</h2></div><span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-800 rounded-full">V2.4 Cloud Sync</span></div>
                    
                    {!isGeneralAdmin && <div className="flex gap-2 items-start text-xs bg-slate-50 p-2 rounded"><Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" /><span>La restauración actualizará y subirá a la Nube los datos de la empresa/parroquia actual.</span></div>}
                    
                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col items-center text-center gap-3"><div className="bg-white p-2 rounded-full shadow-sm"><Download className="w-6 h-6 text-slate-600" /></div><div className="text-sm"><p className="font-semibold text-slate-700">Exportar</p><p className="text-slate-500 text-xs">Descargar copia</p></div><Button onClick={handleFullBackup} variant="outline" className="w-full mt-auto"><Download className="w-4 h-4 mr-2" /> Generar</Button></div>
                        {canModify && <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 flex flex-col items-center text-center gap-3"><div className="bg-white p-2 rounded-full shadow-sm"><Upload className="w-6 h-6 text-orange-500" /></div><div className="text-sm"><p className="font-semibold text-orange-800">Importar a Nube</p><p className="text-orange-600/80 text-xs">Sincronizar base de datos</p></div><input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".json" className="hidden" /><Button onClick={() => fileInputRef.current.click()} variant="default" className="w-full mt-auto bg-orange-600 hover:bg-orange-700 text-white border-none"><Upload className="w-4 h-4 mr-2" /> Subir Archivo</Button></div>}
                    </div>
                </motion.div>
            </motion.div>
            
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl"><FileJson className="w-6 h-6 text-blue-600" />Restaurar Datos a la Nube</DialogTitle>
                        <DialogDescription>Revisa el plan de restauración antes de confirmar.</DialogDescription>
                    </DialogHeader>
                    
                    {backupPreview && (
                        <div className="overflow-y-auto flex-1 pr-2 space-y-4 py-4">
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b pb-1">Datos a Subir a Supabase</h4>
                                {backupPreview.validIds.size === 0 ? (
                                    <p className="text-sm text-slate-500 italic">No se encontraron datos válidos.</p>
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
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                                    {Object.entries(stat.details).map(([type, count]) => (
                                                        <div key={type} className="flex justify-between">
                                                            <span className="capitalize">{type.replace(/_/g, ' ')}:</span>
                                                            <span className="font-mono font-bold text-slate-900">{count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
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
                            Confirmar Subida a la Nube
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default Settings;