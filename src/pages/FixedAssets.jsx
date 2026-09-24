import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Download, Edit2, Trash2, Archive, Search, CalendarPlus, Upload, Lock, FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { exportFixedAssetsExcel, exportFixedAssetsPdf, exportFixedAssetsWord } from '@/lib/fixedAssetExports';
import * as XLSX from 'xlsx';
import { usePermission } from '@/hooks/usePermission';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { toAccountingDateInput } from '@/lib/accountingDate';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';

const FixedAssets = () => {
    const { canEdit, canDelete, canAdd, canImport, isReadOnly, isConsolidatedReadOnly } = usePermission();
    const { activeCompany } = useCompany();
    const [assets, saveAssets] = useCompanyData('fixedAssets');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newYearDialogOpen, setNewYearDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState(null);
    const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();
    const [depreciationDialogOpen, setDepreciationDialogOpen] = useState(false);
    const [retireDialogOpen, setRetireDialogOpen] = useState(false);
    const [selectedAssetForRetire, setSelectedAssetForRetire] = useState(null);
    const [retireReason, setRetireReason] = useState('Obsolescencia / Daño');

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const getNextAdjustmentVoucherNumber = (date) => {
        const year = String(date || '').slice(0, 4);
        return (transactions || [])
            .filter(t =>
                String(t?.date || '').slice(0, 4) === year &&
                (t?.type === 'adjustment' || t?.voucherPrefix === 'A')
            )
            .reduce((max, t) => Math.max(max, Number.parseInt(t?.voucherNumber, 10) || 0), 0) + 1;
    };

    // --- AUTO-REINTEGRAR ACTIVO SI SE ELIMINA EL COMPROBANTE ---
    useEffect(() => {
        if (!transactions || !assets) return;
        
        // Buscamos activos dados de baja cuyo comprobante ya no exista en contabilidad
        const assetsToRestore = assets.filter(a => {
            if (a.status !== 'Dado de Baja') return false;
            const retirementIds = Array.isArray(a.retireTransactionIds) && a.retireTransactionIds.length > 0
                ? a.retireTransactionIds
                : (a.retireTransactionId ? [a.retireTransactionId] : []);
            return retirementIds.length > 0 &&
                retirementIds.every(id => !transactions.some(t => String(t.id) === String(id)));
        });

        if (assetsToRestore.length > 0) {
            const updatedAssets = assets.map(a => {
                if (assetsToRestore.some(res => res.id === a.id)) {
                    return {
                        ...a,
                        status: 'Bueno',
                        usage: 'Uso',
                        retireTransactionId: null, // Limpiamos el rastro
                        notes: (a.notes || '').replace(/ \[Dado de baja: .*?\]/g, '').trim()
                    };
                }
                return a;
            });
            saveAssets(updatedAssets);
            toast({ title: "Activo Reintegrado", description: "Se detectó la eliminación del comprobante contable y el activo regresó al inventario." });
        }
    }, [transactions, assets]);

    const handleSaveAsset = (assetData) => {
        if (editingAsset ? !canEdit : !canAdd) return;
        if (!canEdit && editingAsset) return;

        let updatedAssets;
        if (editingAsset) {
            const protectedHistory =
                Number(editingAsset.accumulatedDepreciation || 0) > 0 ||
                Boolean(editingAsset.transactionId) ||
                Boolean(editingAsset.retireTransactionId) ||
                (Array.isArray(editingAsset.retireTransactionIds) && editingAsset.retireTransactionIds.length > 0);

            if (
                protectedHistory &&
                (
                    Number(assetData.value || 0) !== Number(editingAsset.value || 0) ||
                    Number(assetData.accumulatedDepreciation || 0) !== Number(editingAsset.accumulatedDepreciation || 0)
                )
            ) {
                toast({
                    variant: 'destructive',
                    title: 'Historia contable protegida',
                    description: 'El costo y la depreciación acumulada no se editan directamente cuando el activo ya tiene historia. Registra el ajuste mediante un comprobante trazable.'
                });
                return;
            }
            updatedAssets = assets.map(asset => asset.id === editingAsset.id ? { ...asset, ...assetData } : asset);
            toast({ title: "Activo actualizado" });
        } else {
            updatedAssets = [...(assets || []), { ...assetData, id: Date.now().toString(), year: yearFilter }];
            toast({ title: "Activo creado manualmente" });
        }
        saveAssets(updatedAssets);
        setDialogOpen(false);
    };

    const handleDeleteAsset = (id) => {
        if (!canDelete) return;

        const assetToDelete = (assets || []).find(asset => asset.id === id);
        if (!assetToDelete) return;

        const linkedIds = [
            assetToDelete.transactionId,
            assetToDelete.retireTransactionId,
            ...(Array.isArray(assetToDelete.retireTransactionIds) ? assetToDelete.retireTransactionIds : [])
        ].filter(Boolean);
        const hasLinkedTransactions = (transactions || []).some(t =>
            linkedIds.some(linkedId => String(linkedId) === String(t.id))
        );

        if (hasLinkedTransactions || Number(assetToDelete.accumulatedDepreciation || 0) > 0) {
            toast({
                variant: 'destructive',
                title: 'Activo con historia contable',
                description: 'No puede eliminarse un activo con compra, depreciación o baja contabilizada. Debe conservarse para auditoría y corregirse mediante un ajuste.'
            });
            return;
        }

        saveAssets((assets || []).filter(asset => asset.id !== id));
        toast({ title: 'Activo eliminado', description: 'Se eliminó únicamente el registro sin historia contable.' });
    };

    const handleCloneYear = () => {
        if (!canAdd) return;
        const currentYear = new Date().getFullYear();
        if (parseInt(yearFilter) >= currentYear) {
            toast({ variant: 'destructive', title: "Acción no permitida", description: "Solo puedes clonar inventarios de años anteriores al actual." });
            return;
        }

        const assetsToClone = assets.filter(asset => asset.year === yearFilter && asset.status !== 'Dado de Baja');
        const clonedAssets = assetsToClone.map(asset => ({
            ...asset,
            id: `cloned-${Date.now()}-${Math.random()}`,
            year: currentYear.toString(),
            transactionId: null,
            retireTransactionId: null,
            retireTransactionIds: [],
            depreciatedYear: null,
            depreciatedYears: []
        }));
        
        saveAssets([...assets, ...clonedAssets]);
        setYearFilter(currentYear.toString());
        toast({ title: "Inventario Clonado", description: `Se creó el inventario para ${currentYear} basado en ${yearFilter}.` });
    };

    const handleOpenRetireDialog = (asset) => {
        setSelectedAssetForRetire(asset);
        setRetireReason('Obsolescencia / Daño');
        setRetireDialogOpen(true);
    };

    
    // --- DEPRECIACIÓN AUTOMÁTICA CON CONSECUTIVO DE TRANSFERENCIA ---
    const handleRunDepreciation = async () => {
        if (!canEdit) return;

        const currentYear = new Date().getFullYear();
        if (Number(yearFilter) >= currentYear) {
            toast({ variant: 'destructive', title: 'Vigencia no terminada', description: 'La depreciación anual sólo puede registrarse cuando la vigencia ya terminó.' });
            return;
        }

        const dateStr = `${yearFilter}-12-31`;
        const lockReason = periodLockReason(dateStr);
        if (lockReason) {
            toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
            return;
        }
        
        const taxRates = {
            'edificaciones': 0.0222, // 2.22% (~45 años)
            'maquinaria': 0.10,      // 10%
            'computo': 0.20,         // 20%
            'vehiculos': 0.20,       // 20%
            'muebles': 0.10,         // 10%
            'general': 0.10          
        };

        // 1. Nunca reescribimos un comprobante anual existente.
        const existingDeprTransaction = (transactions || []).find(t => 
            (String(t.depreciationYear || '') === String(yearFilter) || t.description === `Depreciación anual acumulada - Vigencia ${yearFilter}`) &&
            (t.isFixedAssetDepreciation || t.category === 'Depreciación Acumulada Activos Fijos')
        );
        if (existingDeprTransaction) {
            toast({ variant: 'destructive', title: 'Depreciación ya contabilizada', description: `Ya existe un comprobante para ${yearFilter}. Cualquier diferencia debe registrarse mediante un ajuste separado.` });
            setDepreciationDialogOpen(false);
            return;
        }

        let totalDepreciationGenerated = 0;
        
        // 2. Recalculamos los activos
        const updatedAssets = assets.map(asset => {
            // Ignoramos los dados de baja y los que no son del año
            if (asset.year !== yearFilter || asset.status === 'Dado de Baja') return asset;

            // 🚀 PREVENCIÓN DE DUPLICIDAD: Ignorar si este activo ya se depreció en esta vigencia
            if (asset.depreciatedYear === yearFilter) return asset; 
            
            const cat = (asset.category || '').toLowerCase();
            let rate = taxRates.general;
            if (cat.includes('edificio') || cat.includes('construccion') || cat.includes('mejora')) rate = taxRates.edificaciones;
            else if (cat.includes('maquinaria') || cat.includes('equipo')) rate = taxRates.maquinaria;
            else if (cat.includes('comput') || cat.includes('tecno') || cat.includes('celular')) rate = taxRates.computo;
            else if (cat.includes('vehiculo') || cat.includes('transporte') || cat.includes('moto')) rate = taxRates.vehiculos;
            else if (cat.includes('mueble') || cat.includes('enrser') || cat.includes('oficina')) rate = taxRates.muebles;

            const originalValue = parseFloat(asset.value) || 0;
            const historicalDepr = parseFloat(asset.accumulatedDepreciation) || 0;
            
            const yearlyReference = Math.max(0, originalValue * rate);
            const remainingDepreciable = Math.max(0, originalValue - historicalDepr);
            const actualDepreciation = Math.min(remainingDepreciable, yearlyReference);
            if (actualDepreciation <= 0) return asset;

            const newAccumulated = historicalDepr + actualDepreciation;
            totalDepreciationGenerated += actualDepreciation;
            const priorYears = Array.isArray(asset.depreciatedYears) ? asset.depreciatedYears.map(String) : [];

            return {
                ...asset,
                accumulatedDepreciation: newAccumulated,
                netBookValue: Math.max(0, originalValue - newAccumulated),
                depreciatedYear: yearFilter,
                depreciatedYears: [...new Set([...priorYears, String(yearFilter)])]
            };
        });

        if (totalDepreciationGenerated === 0) {
            toast({ variant: 'destructive', title: "Ya Depreciados", description: "Todos los activos de este año ya fueron depreciados. No se duplicaron saldos." });
            setDepreciationDialogOpen(false);
            return;
        }

        const now = Date.now();
        const voucherNumber = getNextAdjustmentVoucherNumber(dateStr);
        const deprTransaction = {
            id: `${now}-depr`,
            type: 'adjustment',
            voucherPrefix: 'A',
            description: `Depreciación anual acumulada - Vigencia ${yearFilter}`,
            amount: totalDepreciationGenerated,
            category: 'Depreciación Acumulada Activos Fijos',
            date: dateStr,
            voucherNumber,
            isFixedAssetDepreciation: true,
            depreciationYear: yearFilter,
            debitAccount: { code: '516005', name: 'GASTOS DEPRECIACION' },
            creditAccount: { code: '159205', name: 'DEPRECIACION ACUMULADA' },
            company_id: activeCompany?.id,
            companyId: activeCompany?.id
        };

        await saveTransactions([...(transactions || []), deprTransaction]);
        await saveAssets(updatedAssets);
        toast({ title: 'Depreciación Aplicada', description: `Se calculó la depreciación pendiente y se asignó el comprobante A-${String(voucherNumber).padStart(4,'0')}` });

        setDepreciationDialogOpen(false);
    };

    // --- DAR DE BAJA ACTIVO CON COMPROBANTE DE AJUSTE ---
    const handleConfirmRetire = async () => {
        if (!selectedAssetForRetire || !canEdit) return;
        if (selectedAssetForRetire.status === 'Dado de Baja') {
            toast({ variant: 'destructive', title: 'Activo ya retirado', description: 'Este activo ya tiene registrada su baja.' });
            return;
        }

        const currentDate = toAccountingDateInput(new Date());
        const lockReason = periodLockReason(currentDate);
        if (lockReason) {
            toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
            return;
        }

        const grossValue = Math.max(0, Number(selectedAssetForRetire.value || 0));
        const accumulatedDepreciation = Math.min(grossValue, Math.max(0, Number(selectedAssetForRetire.accumulatedDepreciation || 0)));
        const netBookValue = Math.max(0, grossValue - accumulatedDepreciation);
        const purchaseTransaction = (transactions || []).find(t => String(t.id) === String(selectedAssetForRetire.transactionId || ''));
        const assetAccount = String(purchaseTransaction?.debitAccount?.code || '').startsWith('15')
            ? purchaseTransaction.debitAccount
            : { code: '154005', name: 'PROPIEDAD PLANTA Y EQUIPO' };
        const voucherNumber = getNextAdjustmentVoucherNumber(currentDate);
        const batchId = `${Date.now()}-fixed-asset-retire`;
        const retirementTransactions = [];

        if (accumulatedDepreciation > 0.0001) {
            retirementTransactions.push({
                id: `${batchId}-accumulated`,
                type: 'adjustment',
                voucherPrefix: 'A',
                voucherNumber,
                description: `Baja de activo fijo: ${selectedAssetForRetire.name} - retiro de depreciación acumulada`,
                amount: accumulatedDepreciation,
                category: 'Baja de Activos Fijos',
                date: currentDate,
                debitAccount: { code: '159205', name: 'DEPRECIACION ACUMULADA' },
                creditAccount: assetAccount,
                isFixedAssetRetirement: true,
                fixedAssetId: selectedAssetForRetire.id,
                retirementBatchId: batchId,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            });
        }

        if (netBookValue > 0.0001) {
            retirementTransactions.push({
                id: `${batchId}-net`,
                type: 'adjustment',
                voucherPrefix: 'A',
                voucherNumber,
                description: `Baja de activo fijo: ${selectedAssetForRetire.name} (${retireReason}) - valor neto en libros`,
                amount: netBookValue,
                category: 'Retiro o Baja de Activos Fijos',
                date: currentDate,
                debitAccount: { code: '540505', name: 'BAJA DE ACTIVOS' },
                creditAccount: assetAccount,
                isFixedAssetRetirement: true,
                fixedAssetId: selectedAssetForRetire.id,
                retirementBatchId: batchId,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id
            });
        }

        if (retirementTransactions.length > 0) {
            await saveTransactions([...(transactions || []), ...retirementTransactions]);
        }

        const retirementIds = retirementTransactions.map(t => t.id);
        const updatedAssets = (assets || []).map(a => a.id === selectedAssetForRetire.id ? {
            ...a,
            status: 'Dado de Baja',
            usage: 'Desuso',
            retireTransactionId: retirementIds[0] || null,
            retireTransactionIds: retirementIds,
            retiredAt: currentDate,
            retirementReason: retireReason,
            netBookValue: 0,
            notes: `${a.notes || ''} [Dado de baja: ${retireReason}]`.trim()
        } : a);
        await saveAssets(updatedAssets);

        toast({
            title: 'Activo dado de baja',
            description: retirementTransactions.length > 0
                ? `Baja contabilizada en el comprobante A-${String(voucherNumber).padStart(4, '0')}, retirando costo y depreciación acumulada sin afectar caja ni bancos.`
                : 'Activo de control sin valor contable marcado como dado de baja.'
        });
        setRetireDialogOpen(false);
        setSelectedAssetForRetire(null);
    };
    
    // --- EXPORTACIONES PROFESIONALES: MISMA BASE PARA EXCEL / PDF / WORD ---
    const ensureAssetsForExport = () => {
        if (filteredAssets.length > 0) return true;
        toast({ variant: 'destructive', title: 'No hay datos para exportar', description: `No existen activos para la vigencia ${yearFilter} y el filtro actual.` });
        return false;
    };

    const handleExportExcel = () => {
        if (!ensureAssetsForExport()) return;
        try {
            exportFixedAssetsExcel({ assets: filteredAssets, company: activeCompany, year: yearFilter });
            toast({ title: 'Excel profesional generado', description: 'Inventario exportado con resumen, categorías, bajas y hoja de control.' });
        } catch (error) {
            console.error('Error exportando Activos Fijos a Excel:', error);
            toast({ variant: 'destructive', title: 'Error al exportar Excel', description: 'No se pudo generar el inventario de Activos Fijos.' });
        }
    };

    const handleExportPdf = () => {
        if (!ensureAssetsForExport()) return;
        try {
            exportFixedAssetsPdf({ assets: filteredAssets, company: activeCompany, year: yearFilter });
            toast({ title: 'PDF profesional generado', description: 'Inventario PDF generado con totales, depreciación, valor en libros y firmas.' });
        } catch (error) {
            console.error('Error exportando Activos Fijos a PDF:', error);
            toast({ variant: 'destructive', title: 'Error al exportar PDF', description: 'No se pudo generar el inventario de Activos Fijos.' });
        }
    };

    const handleExportWord = async () => {
        if (!ensureAssetsForExport()) return;
        try {
            await exportFixedAssetsWord({ assets: filteredAssets, company: activeCompany, year: yearFilter });
            toast({ title: 'Word profesional generado', description: 'Inventario editable generado con resumen financiero, tabla y firmas.' });
        } catch (error) {
            console.error('Error exportando Activos Fijos a Word:', error);
            toast({ variant: 'destructive', title: 'Error al exportar Word', description: 'No se pudo generar el inventario de Activos Fijos.' });
        }
    };

    const handleImport = (importedAssets) => {
        if (!canImport) return;
        const newAssets = importedAssets.map(asset => ({
            ...asset,
            id: Date.now().toString() + Math.random(),
            year: yearFilter,
        }));
        saveAssets([...(assets || []), ...newAssets]);
        toast({ title: "¡Importación exitosa!", description: `${newAssets.length} activos han sido añadidos al inventario de ${yearFilter}.` });
        setImportDialogOpen(false);
    };

    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        const yearsFromAssets = (assets || []).map(a => a.year);
        const uniqueYears = [...new Set(yearsFromAssets)].sort((a,b) => b-a);
        if (!uniqueYears.includes(new Date().getFullYear().toString())) {
            uniqueYears.unshift(new Date().getFullYear().toString());
        }
        setAvailableYears(uniqueYears);
    }, [assets]);

    const handleAddYear = (newYear) => {
        if (!canAdd) return;
        if (newYear && !availableYears.includes(newYear)) {
            const updatedYears = [...availableYears, newYear].sort((a, b) => b-a);
            setAvailableYears(updatedYears);
            setYearFilter(newYear);
            toast({ title: `Año ${newYear} añadido`, description: 'Ahora puedes empezar a añadir activos para este año.' });
        }
        setNewYearDialogOpen(false);
    };

    const filteredAssets = (assets || []).filter(asset => asset.year === yearFilter && asset.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <>
        <Helmet><title>Activos Fijos - Sistema de Contabilidad</title></Helmet>
        <div className="space-y-6">
            <ProfessionalModuleHero
                eyebrow="Control patrimonial"
                title="Inventario de Activos Fijos"
                subtitle="Gestiona bienes, estado, ubicación, depreciación y valor neto por vigencia con trazabilidad contable."
                activeCompany={activeCompany}
                icon={Archive}
                accent="violet"
                badges={isReadOnly ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">{isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}</span> : null}
                metrics={[
                    { label: 'Año', value: yearFilter || '—' },
                    { label: 'Activos visibles', value: filteredAssets.length },
                    { label: 'En servicio', value: filteredAssets.filter(asset => asset.status !== 'Dado de Baja').length },
                ]}
                actions={canAdd ? (
                    <Button onClick={() => { setEditingAsset(null); setDialogOpen(true); }} className="col-span-2 h-10 rounded-xl bg-violet-600 font-bold text-white hover:bg-violet-500 sm:col-span-1">
                        <Plus className="mr-2 h-4 w-4" />Nuevo activo
                    </Button>
                ) : null}
            />
            
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end gap-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] sm:p-5">
                <div className="flex-1 min-w-[150px]"><Label>Filtrar por Año:</Label><select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="w-full mt-1 p-2 border rounded-lg"><option value="" disabled>Selecciona año</option>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                <div className="flex-1 min-w-[200px] relative"><Label>Buscar Activo:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60" /></div>
                <div className="flex gap-2 flex-wrap">
                    {canAdd && <Button onClick={() => setNewYearDialogOpen(true)} variant="outline"><CalendarPlus className="w-4 h-4 mr-2"/>Añadir Año</Button>}
                    {canImport && <Button onClick={() => setImportDialogOpen(true)} variant="outline"><Upload className="w-4 h-4 mr-2" /> Importar</Button>}
                    
                    {/* BOTONES DE EXPORTACIÓN */}
                    <Button onClick={handleExportExcel} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
                    <Button onClick={handleExportPdf} variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"><Printer className="w-4 h-4 mr-2" /> PDF</Button>
                    <Button onClick={handleExportWord} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50"><FileText className="w-4 h-4 mr-2" /> Word</Button>
                    
                    {canAdd && <Button onClick={handleCloneYear} variant="outline">Clonar a Año Actual</Button>}
             {canEdit && <Button onClick={() => setDepreciationDialogOpen(true)} variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50">Depreciación Anual</Button>}
                </div>


            </motion.div>

            {filteredAssets.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                    <Archive className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay activos registrados para el año {yearFilter}.</p>
                </motion.div>
            ) : (
                <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]" style={{ WebkitOverflowScrolling: 'touch' }}><table className="w-full min-w-[1120px] text-sm">
                    {/* NUEVO: REORDEN DEL HEADER DE LA TABLA PARA COINCIDIR CON EL DOCUMENTO EXPORTADO */}
                    <thead className="bg-slate-950 text-slate-200">
                        <tr>
                            {['Cant.', 'Activo', 'Categoría', 'Uso', 'Estado', 'Lugar', 'V. Original', 'Deprec.', 'V. Neto', 'Acciones'].map(h => 
                                <th key={h} className="p-3 text-left font-semibold whitespace-nowrap">{h}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y">{filteredAssets.map(asset => {
                        const isRetired = asset.status === 'Dado de Baja';
                        const origVal = isRetired ? 0 : (parseFloat(asset.value) || 0);
                        const acumDepr = isRetired ? 0 : (parseFloat(asset.accumulatedDepreciation || 0));
                        const netVal = origVal - acumDepr;
                        return (
                            <tr key={asset.id} className={`hover:bg-slate-50 ${asset.status === 'Dado de Baja' ? 'opacity-50 bg-slate-100' : ''}`}>
                                <td className="p-3">{asset.quantity || 1}</td>
                                <td className={`p-3 font-medium ${asset.status === 'Dado de Baja' ? 'line-through text-slate-400' : ''}`}>{asset.name}</td>
                                <td className="p-3">{asset.category}</td>
                                <td className="p-3">{asset.usage}</td>
                                <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${asset.status === 'Bueno' ? 'bg-green-100 text-green-800' : asset.status === 'Dado de Baja' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{asset.status}</span></td>
                                <td className="p-3">{asset.location || ''}</td>
                                <td className="p-3 font-mono">${origVal.toLocaleString('es-ES')}</td>
                                <td className="p-3 font-mono text-red-600">${acumDepr.toLocaleString('es-ES')}</td>
                                <td className="p-3 font-mono font-bold text-blue-600">${netVal.toLocaleString('es-ES')}</td>
                                <td className="p-3"><div className="flex gap-1">
                                    {canEdit && asset.status !== 'Dado de Baja' && <Button size="icon" variant="ghost" onClick={() => handleOpenRetireDialog(asset)} title="Dar de baja"><Archive className="w-4 h-4 text-orange-600" /></Button>}
                                    {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingAsset(asset); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                                    {canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDeleteAsset(asset.id)}><Trash2 className="w-4 h-4" /></Button>}
                                </div></td>
                            </tr>
                        );
                    })}</tbody>
                </table></div>
            )}
        </div>
        <AssetDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveAsset} asset={editingAsset} />
        <NewYearDialog open={newYearDialogOpen} onOpenChange={setNewYearDialogOpen} onAdd={handleAddYear} />
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} />
    <DepreciationDialog open={depreciationDialogOpen} onOpenChange={setDepreciationDialogOpen} onRun={handleRunDepreciation} />
        <RetireDialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen} asset={selectedAssetForRetire} reason={retireReason} setReason={setRetireReason} onConfirm={handleConfirmRetire} />        
</>
    );
}

const AssetDialog = ({ open, onOpenChange, onSave, asset }) => {
    // Se agrega accumulatedDepreciation al estado inicial
    const [data, setData] = useState({ quantity: 1, name: '', model: '', category: '', usage: 'Uso', status: 'Bueno', location: '', value: '', accumulatedDepreciation: 0, notes: '' });
    useEffect(() => { if(open) { if(asset) setData(asset); else setData({ quantity: 1, name: '', model: '', category: '', usage: 'Uso', status: 'Bueno', location: '', value: '', accumulatedDepreciation: 0, notes: '' }); } }, [asset, open]);

    const handleSubmit = e => { e.preventDefault(); onSave(data); };

    return(<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{asset ? 'Editar' : 'Nuevo'} Activo Fijo</DialogTitle></DialogHeader><form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="space-y-1"><Label>Nombre del Activo</Label><input required value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Cantidad</Label><input type="number" required value={data.quantity} onChange={e => setData({...data, quantity: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Marca/Modelo/Serie</Label><input value={data.model || ''} onChange={e => setData({...data, model: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Categoría</Label><input value={data.category || ''} onChange={e => setData({...data, category: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="space-y-1"><Label>Uso</Label><select value={data.usage || 'Uso'} onChange={e => setData({...data, usage: e.target.value})} className="w-full p-2 border rounded-lg"><option>Uso</option><option>Desuso</option><option>Préstamo</option></select></div>
        <div className="space-y-1"><Label>Estado</Label><select value={data.status || 'Bueno'} onChange={e => setData({...data, status: e.target.value})} className="w-full p-2 border rounded-lg"><option>Bueno</option><option>Regular</option><option>Malo</option></select></div>
        <div className="space-y-1"><Label>Lugar a inventariar</Label><input value={data.location || ''} onChange={e => setData({...data, location: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Ej: Templo, Sacristía, etc."/></div>
        <div className="space-y-1"><Label>Valor Total</Label><input type="number" step="0.01" required value={data.value} onChange={e => setData({...data, value: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
<div className="space-y-1"><Label>Deprec. Acumulada Histórica</Label><input type="number" step="0.01" disabled={Boolean(asset)} value={data.accumulatedDepreciation || 0} onChange={e => setData({...data, accumulatedDepreciation: e.target.value})} className="w-full p-2 border rounded-lg text-red-600 disabled:bg-slate-100" /></div>
        <div className="md:col-span-2 space-y-1"><Label>Observaciones</Label><textarea value={data.notes || ''} onChange={e => setData({...data, notes: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button></div>
    </form></DialogContent></Dialog>);
};

const NewYearDialog = ({ open, onOpenChange, onAdd }) => {
    const [year, setYear] = useState(new Date().getFullYear() + 1);
    const handleSubmit = (e) => { e.preventDefault(); onAdd(year.toString()); };
    return(
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Añadir Nuevo Año de Inventario</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-1"><Label htmlFor="new-year">Año</Label><input id="new-year" type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Ej: 2025" /></div>
                    <div className="flex justify-end gap-2 pt-4"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Añadir Año</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const ImportDialog = ({ open, onOpenChange, onImport }) => {
    const [file, setFile] = useState(null);
    const { toast } = useToast();
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        const fileName = String(selectedFile?.name || '').toLowerCase();
        const validExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (selectedFile && validExtension) {
            setFile(selectedFile);
        } else {
            setFile(null);
            toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Por favor, selecciona un archivo Excel .xlsx o .xls.' });
        }
    };

    const handleImportClick = () => {
        if (!file) {
            toast({ variant: 'destructive', title: 'No hay archivo', description: 'Por favor, selecciona un archivo para importar.' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });

                const normalize = (value) => String(value ?? '')
                    .trim()
                    .toUpperCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ');

                const nameHeaders = ['NOMBRE DEL ACTIVO', 'ACTIVO', 'NOMBRE'];
                const valueHeaders = ['VALOR ORIGINAL', 'VALOR TOTAL', 'VALOR', 'VALOR NETO', 'VALOR EN LIBROS'];

                let detected = null;
                for (const sheetName of workbook.SheetNames) {
                    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });
                    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 40); rowIndex += 1) {
                        const row = matrix[rowIndex] || [];
                        const headers = row.map(normalize);
                        const hasName = headers.some(h => nameHeaders.includes(h));
                        const hasValue = headers.some(h => valueHeaders.includes(h));
                        if (hasName && hasValue) {
                            detected = { sheetName, matrix, headerRow: rowIndex, headers };
                            break;
                        }
                    }
                    if (detected) break;
                }

                if (!detected) {
                    toast({
                        variant: 'destructive',
                        title: 'Formato incorrecto',
                        description: 'No se encontró la tabla de inventario. El archivo debe contener Nombre del Activo y Valor Original/Valor.'
                    });
                    return;
                }

                const indexOf = (aliases) => detected.headers.findIndex(h => aliases.map(normalize).includes(h));
                const indexes = {
                    name: indexOf(nameHeaders),
                    qty: indexOf(['CANT.', 'CANT', 'CANTIDAD']),
                    model: indexOf(['MARCA / MODELO / SERIE', 'MARCA/MODELO/SERIE', 'MARCA', 'MODELO']),
                    category: indexOf(['CATEGORIA', 'CATEGORIA DEL ACTIVO']),
                    usage: indexOf(['USO', 'USO/DESUSO/PRESTAMO', 'USO/DESUSO/ PRESTAMO']),
                    status: indexOf(['ESTADO', 'ESTADO BUENO/MALO/REGULAR']),
                    location: indexOf(['LUGAR', 'LUGAR A INVENTARIAR']),
                    original: indexOf(['VALOR ORIGINAL', 'VALOR TOTAL', 'VALOR']),
                    legacyNet: indexOf(['VALOR NETO']),
                    depreciation: indexOf(['DEPRECIACION ACUMULADA', 'DEPRECIACION ACUM.', 'DEPREC. ACUM.', 'DEPREC.']),
                    net: indexOf(['VALOR EN LIBROS', 'VALOR NETO']),
                    notes: indexOf(['OBSERVACIONES']),
                };

                const read = (row, index) => index >= 0 ? row[index] : '';

                const parseNumber = (value) => {
                    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
                    let raw = String(value ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
                    if (!raw) return 0;
                    if (raw.includes('.') && raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
                        raw = raw.replace(/\./g, '').replace(',', '.');
                    } else if (raw.includes(',') && !raw.includes('.')) {
                        raw = raw.replace(',', '.');
                    } else {
                        raw = raw.replace(/,/g, '');
                    }
                    const parsed = Number(raw);
                    return Number.isFinite(parsed) ? parsed : 0;
                };

                const importedAssets = [];
                let skipped = 0;

                for (let rowIndex = detected.headerRow + 1; rowIndex < detected.matrix.length; rowIndex += 1) {
                    const row = detected.matrix[rowIndex] || [];
                    const name = String(read(row, indexes.name) || '').trim();
                    if (!name || normalize(name) === 'TOTALES' || normalize(name) === 'TOTAL') continue;

                    const originalRaw = indexes.original >= 0 ? read(row, indexes.original) : read(row, indexes.legacyNet);
                    const originalValue = Math.max(0, parseNumber(originalRaw));
                    const accumulated = Math.max(0, parseNumber(read(row, indexes.depreciation)));
                    const netValue = indexes.net >= 0
                        ? Math.max(0, parseNumber(read(row, indexes.net)))
                        : Math.max(0, originalValue - accumulated);

                    if (!name) {
                        skipped += 1;
                        continue;
                    }

                    importedAssets.push({
                        name,
                        value: originalValue,
                        accumulatedDepreciation: accumulated,
                        netBookValue: netValue,
                        quantity: Math.max(1, parseInt(read(row, indexes.qty), 10) || 1),
                        model: String(read(row, indexes.model) || '').trim(),
                        category: String(read(row, indexes.category) || '').trim(),
                        usage: String(read(row, indexes.usage) || 'Uso').trim(),
                        status: String(read(row, indexes.status) || 'Bueno').trim(),
                        location: String(read(row, indexes.location) || '').trim(),
                        notes: String(read(row, indexes.notes) || '').trim(),
                    });
                }

                if (importedAssets.length === 0) {
                    toast({ variant: 'destructive', title: 'Sin activos válidos', description: 'No se encontraron filas de activos para importar.' });
                    return;
                }

                onImport(importedAssets);
                toast({
                    title: 'Inventario importado',
                    description: `${importedAssets.length} activos importados desde "${detected.sheetName}". ${skipped ? `${skipped} filas omitidas.` : ''}`
                });
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Error al procesar', description: 'No se pudo leer el archivo Excel. Verifique la estructura y los valores del inventario.' });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Importar Activos Fijos desde Excel</DialogTitle>
                    <DialogDescription>
                        Selecciona un archivo .xlsx. Es recomendable descargar primero el archivo Excel vacío o con datos, llenarlo y subirlo nuevamente.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="file-upload">Archivo Excel</Label>
                    <input id="file-upload" ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                </div>
                <div className="flex justify-end gap-2">
                    <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                    <Button onClick={handleImportClick}><Upload className="w-4 h-4 mr-2" /> Importar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const DepreciationDialog = ({ open, onOpenChange, onRun }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Depreciación Automática (Normas COLGAAP / DIAN)</DialogTitle></DialogHeader>
            <DialogDescription>
                Este proceso calcula la depreciación anual con tasas operativas de referencia por categoría y limita cada activo al valor pendiente por depreciar. Generará un comprobante de ajuste A, sin afectar caja ni bancos. La tasa aplicable debe corresponder a la política contable y fiscal de la entidad.
            </DialogDescription>
            <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={onRun} className="bg-purple-600 hover:bg-purple-700">Calcular y Registrar</Button>
            </div>
        </DialogContent>
    </Dialog>
);

const RetireDialog = ({ open, onOpenChange, asset, reason, setReason, onConfirm }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Dar de Baja Activo Fijo</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
                <p className="text-sm text-slate-600">Estás a punto de retirar del inventario activo: <b>{asset?.name}</b>. Esto generará un comprobante de baja contable automático sin alterar el efectivo.</p>
                <div>
                    <Label>Motivo de la Baja</Label>
                    <select value={reason} onChange={e => setReason(e.target.value)} className="w-full mt-1 p-2 border rounded-lg">
                        <option>Obsolescencia / Daño</option>
                        <option>Robo / Pérdida</option>
                        <option>Venta / Retiro</option>
                        <option>Donación</option>
                    </select>
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={onConfirm} className="bg-red-600 hover:bg-red-700">Confirmar Baja</Button>
            </div>
        </DialogContent>
    </Dialog>
);

export default FixedAssets;