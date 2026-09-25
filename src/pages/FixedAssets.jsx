import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Download, Edit2, Trash2, Archive, Search, Upload, Lock, FileText, FileSpreadsheet, Printer, History } from 'lucide-react';
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
import {
    buildAssetHistory,
    calculateAnnualDepreciation,
    canonicalizeFixedAssets,
    defaultUsefulLifeYears,
    getAssetSnapshot,
    getFixedAssetAccounts,
    suggestDepreciationAccounts,
} from '@/lib/fixedAssetLifecycle';

const FixedAssets = () => {
    const { canEdit, canDelete, canAdd, canImport, isReadOnly, isConsolidatedReadOnly } = usePermission();
    const { activeCompany } = useCompany();
    const [assets, saveAssets, isAssetsLoaded] = useCompanyData('fixedAssets');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [historyAsset, setHistoryAsset] = useState(null);
    const currentYear = new Date().getFullYear();
    const currentDateKey = toAccountingDateInput(new Date());
    const { toast } = useToast();
    const [depreciationDialogOpen, setDepreciationDialogOpen] = useState(false);
    const [retireDialogOpen, setRetireDialogOpen] = useState(false);
    const [selectedAssetForRetire, setSelectedAssetForRetire] = useState(null);
    const [retireReason, setRetireReason] = useState('Obsolescencia / Daño');

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const canonicalAssets = React.useMemo(
        () => canonicalizeFixedAssets(assets || []),
        [assets]
    );

    useEffect(() => {
        if (!isAssetsLoaded || isReadOnly) return;
        const normalized = canonicalizeFixedAssets(assets || []);
        if (JSON.stringify(normalized) !== JSON.stringify(assets || [])) {
            saveAssets(normalized);
        }
    }, [assets, isAssetsLoaded, isReadOnly, saveAssets]);

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
        if (isReadOnly || !transactions || !assets) return;
        
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
    }, [transactions, assets, isReadOnly, saveAssets, toast]);

    const handleSaveAsset = (assetData) => {
        if (editingAsset ? !canEdit : !canAdd) return;
        if (!canEdit && editingAsset) return;

        if (!assetData.accountCode) {
            toast({ variant: 'destructive', title: 'Cuenta contable requerida', description: 'Cada activo debe quedar vinculado a una cuenta del Plan de Cuentas.' });
            return;
        }

        let updatedAssets;
        if (editingAsset) {
            const protectedHistory =
                Number(editingAsset.accumulatedDepreciation || 0) > 0 ||
                Boolean(editingAsset.transactionId) ||
                Boolean(editingAsset.retireTransactionId) ||
                (Array.isArray(editingAsset.retireTransactionIds) && editingAsset.retireTransactionIds.length > 0) ||
                (Array.isArray(editingAsset.depreciatedYears) && editingAsset.depreciatedYears.length > 0) ||
                (Array.isArray(editingAsset.depreciationHistory) && editingAsset.depreciationHistory.length > 0) ||
                (Array.isArray(editingAsset.legacySourceIds) && editingAsset.legacySourceIds.length > 0);

            const originalAcquisitionDate = toAccountingDateInput(editingAsset.acquisitionDate || editingAsset.date);
            const nextAcquisitionDate = toAccountingDateInput(assetData.acquisitionDate || assetData.date);
            const changesProtectedBase =
                Number(assetData.value || 0) !== Number(editingAsset.value || 0) ||
                Number(assetData.accumulatedDepreciation || 0) !== Number(editingAsset.accumulatedDepreciation || 0) ||
                originalAcquisitionDate !== nextAcquisitionDate ||
                (
                    Boolean(editingAsset.accountCode) &&
                    String(assetData.accountCode || '') !== String(editingAsset.accountCode || '')
                );

            if (protectedHistory && changesProtectedBase) {
                toast({
                    variant: 'destructive',
                    title: 'Historia contable protegida',
                    description: 'Costo, fecha de alta, depreciación acumulada y una cuenta PUC ya vinculada no se modifican directamente cuando el activo tiene historia. Usa la transacción de origen o un ajuste trazable.'
                });
                return;
            }
            updatedAssets = canonicalAssets.map(asset => asset.id === editingAsset.id ? { ...asset, ...assetData, lifecycleVersion: 2 } : asset);
            toast({ title: "Activo actualizado" });
        } else {
            const acquisitionDate = toAccountingDateInput(assetData.acquisitionDate || assetData.date) || currentDateKey;
            updatedAssets = [...canonicalAssets, {
                ...assetData,
                id: `asset-${Date.now()}`,
                acquisitionDate,
                date: acquisitionDate,
                sourceType: 'manual',
                lifecycleVersion: 2,
                status: assetData.status || 'Bueno',
                accumulatedDepreciation: Number(assetData.accumulatedDepreciation || 0),
                netBookValue: Math.max(0, Number(assetData.value || 0) - Number(assetData.accumulatedDepreciation || 0)),
                company_id: activeCompany?.id,
                companyId: activeCompany?.id,
            }];
            toast({ title: "Activo creado", description: 'El bien quedó registrado una sola vez y conservará su historia entre vigencias.' });
        }
        saveAssets(updatedAssets);
        setDialogOpen(false);
    };

    const handleDeleteAsset = (id) => {
        if (!canDelete) return;

        const assetToDelete = (assets || []).find(asset => asset.id === id);
        if (!assetToDelete) return;

        const hasLegacyHistory =
            (Array.isArray(assetToDelete.legacySourceIds) && assetToDelete.legacySourceIds.length > 0) ||
            (Array.isArray(assetToDelete.depreciatedYears) && assetToDelete.depreciatedYears.length > 0) ||
            (Array.isArray(assetToDelete.depreciationHistory) && assetToDelete.depreciationHistory.length > 0);

        const linkedIds = [
            assetToDelete.transactionId,
            assetToDelete.retireTransactionId,
            ...(Array.isArray(assetToDelete.retireTransactionIds) ? assetToDelete.retireTransactionIds : [])
        ].filter(Boolean);
        const hasLinkedTransactions = (transactions || []).some(t =>
            linkedIds.some(linkedId => String(linkedId) === String(t.id))
        );

        if (hasLinkedTransactions || hasLegacyHistory || Number(assetToDelete.accumulatedDepreciation || 0) > 0) {
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

    const handleOpenRetireDialog = (asset) => {
        setSelectedAssetForRetire(asset);
        setRetireReason('Obsolescencia / Daño');
        setRetireDialogOpen(true);
    };

    
    // --- DEPRECIACIÓN ANUAL SOBRE EL MISMO ACTIVO, SIN CLONAR VIGENCIAS ---
    const handleRunDepreciation = async () => {
        if (!canEdit) return;

        const targetYear = currentYear - 1;
        const dateStr = `${targetYear}-12-31`;

        const eligibleAssets = canonicalAssets.filter(asset => {
            const acquisitionDate = toAccountingDateInput(asset.acquisitionDate || asset.date);
            const retiredAt = toAccountingDateInput(asset.retiredAt);
            return acquisitionDate && acquisitionDate <= dateStr && (!retiredAt || retiredAt > dateStr);
        });

        const withoutPuc = eligibleAssets.filter(asset => !asset.accountCode);
        if (withoutPuc.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Activos sin cuenta PUC',
                description: `Hay ${withoutPuc.length} activo(s) vigentes sin cuenta PUC. Vincúlalos antes de ejecutar la depreciación.`
            });
            setDepreciationDialogOpen(false);
            return;
        }

        const withoutDepreciationAccounts = eligibleAssets.filter(asset => {
            if (calculateAnnualDepreciation(asset) <= 0) return false;
            const suggested = suggestDepreciationAccounts(
                { number: asset.accountCode, name: asset.accountName },
                accounts || []
            );
            const expenseCode = asset.depreciationExpenseAccountCode || suggested.expense?.number;
            const accumulatedCode = asset.accumulatedDepreciationAccountCode || suggested.accumulated?.number;
            return !expenseCode || !accumulatedCode;
        });
        if (withoutDepreciationAccounts.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Falta parametrizar depreciación',
                description: `Hay ${withoutDepreciationAccounts.length} activo(s) depreciables sin sus dos cuentas contables. Abre cada activo y asigna Gasto de depreciación y Depreciación acumulada.`
            });
            setDepreciationDialogOpen(false);
            return;
        }

        const lockReason = periodLockReason(dateStr);
        if (lockReason) {
            toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
            return;
        }

        const groups = new Map();
        canonicalAssets.forEach(asset => {
            const acquisitionDate = toAccountingDateInput(asset.acquisitionDate || asset.date);
            const retiredAt = toAccountingDateInput(asset.retiredAt);
            const priorYears = Array.isArray(asset.depreciatedYears) ? asset.depreciatedYears.map(String) : [];
            if (!acquisitionDate || acquisitionDate > dateStr) return;
            if (retiredAt && retiredAt <= dateStr) return;
            if (priorYears.includes(String(targetYear)) || String(asset.depreciatedYear || '') === String(targetYear)) return;

            const annual = calculateAnnualDepreciation(asset);
            const originalValue = Math.max(0, Number(asset.value || 0));
            const residual = Math.max(0, Number(asset.residualValue || 0));
            const historical = Math.max(0, Number(asset.accumulatedDepreciation || 0));
            const remaining = Math.max(0, originalValue - residual - historical);
            if (annual <= 0 || remaining <= 0) return;

            const acquiredYear = Number(acquisitionDate.slice(0, 4));
            const acquiredMonth = Number(acquisitionDate.slice(5, 7));
            const firstYearFactor = acquiredYear === targetYear ? Math.max(1, 13 - acquiredMonth) / 12 : 1;
            const amount = Math.min(remaining, annual * firstYearFactor);
            if (amount <= 0.0001) return;

            const assetAccount = { number: asset.accountCode, name: asset.accountName };
            const suggested = suggestDepreciationAccounts(assetAccount, accounts || []);
            const expense = {
                code: asset.depreciationExpenseAccountCode || suggested.expense?.number,
                name: asset.depreciationExpenseAccountName || suggested.expense?.name,
            };
            const accumulated = {
                code: asset.accumulatedDepreciationAccountCode || suggested.accumulated?.number,
                name: asset.accumulatedDepreciationAccountName || suggested.accumulated?.name,
            };
            const key = `${expense.code}|${accumulated.code}`;
            if (!groups.has(key)) groups.set(key, { expense, accumulated, entries: [] });
            groups.get(key).entries.push({ assetId: asset.id, name: asset.name, amount, year: targetYear, date: dateStr });
        });

        if (groups.size === 0) {
            toast({ variant: 'destructive', title: 'Sin depreciación pendiente', description: `No hay activos pendientes de depreciar para ${targetYear}.` });
            setDepreciationDialogOpen(false);
            return;
        }

        const firstVoucher = getNextAdjustmentVoucherNumber(dateStr);
        const createdTransactions = [];
        const depreciationByAsset = new Map();
        [...groups.values()].forEach((group, index) => {
            const voucherNumber = firstVoucher + index;
            const transactionId = `${Date.now()}-depr-${index}`;
            const amount = group.entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
            createdTransactions.push({
                id: transactionId,
                type: 'adjustment',
                voucherPrefix: 'A',
                voucherNumber,
                date: dateStr,
                description: `Depreciación activos fijos - Vigencia ${targetYear}`,
                amount,
                category: 'Depreciación Acumulada Activos Fijos',
                debitAccount: group.expense,
                creditAccount: group.accumulated,
                isFixedAssetDepreciation: true,
                depreciationYear: String(targetYear),
                fixedAssetEntries: group.entries,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id,
            });
            group.entries.forEach(entry => depreciationByAsset.set(String(entry.assetId), { ...entry, transactionId, voucherNumber }));
        });

        const updatedAssets = canonicalAssets.map(asset => {
            const entry = depreciationByAsset.get(String(asset.id));
            if (!entry) return asset;
            const accumulated = Number(asset.accumulatedDepreciation || 0) + Number(entry.amount || 0);
            const priorHistory = buildAssetHistory(asset, transactions).filter(item => item.type === 'depreciation');
            const priorYears = Array.isArray(asset.depreciatedYears) ? asset.depreciatedYears.map(String) : [];
            return {
                ...asset,
                accumulatedDepreciation: accumulated,
                netBookValue: Math.max(0, Number(asset.value || 0) - accumulated),
                depreciatedYear: String(targetYear),
                depreciatedYears: [...new Set([...priorYears, String(targetYear)])],
                depreciationHistory: [...priorHistory, entry],
                lifecycleVersion: 2,
            };
        });

        await saveTransactions([...(transactions || []), ...createdTransactions]);
        await saveAssets(updatedAssets);
        toast({ title: 'Depreciación registrada', description: `Se contabilizó ${targetYear} preservando la historia individual de cada activo.` });
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
        const assetAccount = selectedAssetForRetire.accountCode
            ? { code: selectedAssetForRetire.accountCode, name: selectedAssetForRetire.accountName || selectedAssetForRetire.category || 'ACTIVO FIJO' }
            : (String(purchaseTransaction?.debitAccount?.code || '').startsWith('15')
                ? purchaseTransaction.debitAccount
                : { code: '15', name: 'PROPIEDADES PLANTA Y EQUIPO' });
        const accumulatedAccount = selectedAssetForRetire.accumulatedDepreciationAccountCode
            ? { code: selectedAssetForRetire.accumulatedDepreciationAccountCode, name: selectedAssetForRetire.accumulatedDepreciationAccountName || 'DEPRECIACION ACUMULADA' }
            : (suggestDepreciationAccounts({ number: assetAccount.code }, accounts || []).accumulated
                ? { code: suggestDepreciationAccounts({ number: assetAccount.code }, accounts || []).accumulated.number, name: suggestDepreciationAccounts({ number: assetAccount.code }, accounts || []).accumulated.name }
                : { code: '1592', name: 'DEPRECIACION ACUMULADA' });
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
                debitAccount: accumulatedAccount,
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
    
    const fixedAssetAccounts = React.useMemo(
        () => getFixedAssetAccounts(accounts || []),
        [accounts]
    );

    const filteredAssets = canonicalAssets.filter(asset => {
        const search = searchTerm.trim().toLowerCase();
        if (!search) return true;
        return [
            asset.name,
            asset.model,
            asset.category,
            asset.location,
            asset.accountCode,
            asset.accountName,
        ].some(value => String(value || '').toLowerCase().includes(search));
    });

    // --- EXPORTACIONES PROFESIONALES: REGISTRO PERMANENTE AL CORTE ACTUAL ---
    const ensureAssetsForExport = () => {
        if (filteredAssets.length > 0) return true;
        toast({ variant: 'destructive', title: 'No hay datos para exportar', description: 'No existen activos para el filtro actual.' });
        return false;
    };

    const handleExportExcel = () => {
        if (!ensureAssetsForExport()) return;
        exportFixedAssetsExcel({ assets: filteredAssets, company: activeCompany, year: String(currentYear) });
        toast({ title: 'Excel profesional generado', description: 'Registro patrimonial exportado con la historia conservada entre vigencias.' });
    };

    const handleExportPdf = () => {
        if (!ensureAssetsForExport()) return;
        exportFixedAssetsPdf({ assets: filteredAssets, company: activeCompany, year: String(currentYear) });
        toast({ title: 'PDF profesional generado', description: 'Registro patrimonial generado al corte actual.' });
    };

    const handleExportWord = async () => {
        if (!ensureAssetsForExport()) return;
        await exportFixedAssetsWord({ assets: filteredAssets, company: activeCompany, year: String(currentYear) });
        toast({ title: 'Word profesional generado', description: 'Registro patrimonial editable generado al corte actual.' });
    };

    const handleImport = (importedAssets) => {
        if (!canImport) return;
        const prepared = importedAssets.map(asset => {
            const linkedAccount = fixedAssetAccounts.find(account =>
                String(account.number) === String(asset.accountCode || '') ||
                String(account.name || '').trim().toUpperCase() === String(asset.accountName || asset.category || '').trim().toUpperCase()
            );
            return { asset, linkedAccount };
        });

        const unmapped = prepared.filter(item => !item.linkedAccount);
        if (unmapped.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Falta vincular cuentas PUC',
                description: `${unmapped.length} activo(s) no pudieron asociarse a una cuenta de Activos Fijos del Plan de Cuentas. Agrega la columna Cuenta PUC o usa una categoría que coincida con el PUC.`
            });
            return;
        }

        const newAssets = prepared.map(({ asset, linkedAccount }, index) => {
            const suggested = suggestDepreciationAccounts(linkedAccount, accounts || []);
            const acquisitionDate = toAccountingDateInput(asset.acquisitionDate || asset.date) || currentDateKey;
            return {
                ...asset,
                id: `asset-import-${Date.now()}-${index}`,
                acquisitionDate,
                date: acquisitionDate,
                accountCode: linkedAccount.number,
                accountName: linkedAccount.name,
                accumulatedDepreciationAccountCode: suggested.accumulated?.number || '',
                accumulatedDepreciationAccountName: suggested.accumulated?.name || '',
                depreciationExpenseAccountCode: suggested.expense?.number || '',
                depreciationExpenseAccountName: suggested.expense?.name || '',
                usefulLifeYears: Number(asset.usefulLifeYears || defaultUsefulLifeYears(linkedAccount.number)),
                depreciationMethod: asset.depreciationMethod || 'linea_recta',
                depreciationAsOf: currentDateKey,
                sourceType: 'import',
                lifecycleVersion: 2,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id,
            };
        });
        saveAssets([...canonicalAssets, ...newAssets]);
        toast({ title: 'Importación exitosa', description: `${newAssets.length} activos incorporados al registro permanente.` });
        setImportDialogOpen(false);
    };

    return (
        <>
        <Helmet><title>Activos Fijos - Sistema de Contabilidad</title></Helmet>
        <div className="space-y-6">
            <ProfessionalModuleHero
                eyebrow="Control patrimonial"
                title="Registro Permanente de Activos Fijos"
                subtitle="Registro permanente de cada bien: alta, cuenta PUC, depreciaciones, permanencia y baja, sin clones por vigencia."
                activeCompany={activeCompany}
                icon={Archive}
                accent="violet"
                badges={isReadOnly ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">{isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}</span> : null}
                metrics={[
                    { label: 'Registro histórico', value: filteredAssets.length },
                    { label: 'Vigentes al corte', value: filteredAssets.filter(asset => getAssetSnapshot(asset, currentDateKey, transactions).present).length },
                    { label: 'Pendientes PUC', value: filteredAssets.filter(asset => !asset.accountCode).length },
                ]}
                actions={canAdd ? (
                    <Button onClick={() => { setEditingAsset(null); setDialogOpen(true); }} className="col-span-2 h-10 rounded-xl bg-violet-600 font-bold text-white hover:bg-violet-500 sm:col-span-1">
                        <Plus className="mr-2 h-4 w-4" />Nuevo activo
                    </Button>
                ) : null}
            />
            
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end gap-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] sm:p-5">
                <div className="min-w-[170px] rounded-xl border border-violet-100 bg-violet-50 px-4 py-2.5"><Label className="text-xs uppercase tracking-wide text-violet-600">Período operativo</Label><div className="mt-1 text-lg font-extrabold text-slate-900">{currentYear}</div><p className="text-[11px] text-slate-500">La historia anterior permanece dentro de cada activo.</p></div>
                <div className="flex-1 min-w-[220px] relative"><Label>Buscar Activo:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Nombre, cuenta PUC, categoría, ubicación..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60" /></div>
                <div className="flex gap-2 flex-wrap">
                    {canImport && <Button onClick={() => setImportDialogOpen(true)} variant="outline"><Upload className="w-4 h-4 mr-2" /> Importar</Button>}
                    
                    {/* BOTONES DE EXPORTACIÓN */}
                    <Button onClick={handleExportExcel} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
                    <Button onClick={handleExportPdf} variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"><Printer className="w-4 h-4 mr-2" /> PDF</Button>
                    <Button onClick={handleExportWord} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50"><FileText className="w-4 h-4 mr-2" /> Word</Button>
                    
                    {canEdit && <Button onClick={() => setDepreciationDialogOpen(true)} variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50">Depreciación pendiente {currentYear - 1}</Button>}
                </div>


            </motion.div>

            {filteredAssets.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                    <Archive className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay activos registrados en el historial patrimonial.</p>
                </motion.div>
            ) : (
                <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]" style={{ WebkitOverflowScrolling: 'touch' }}><table className="w-full min-w-[1380px] text-sm">
                    {/* NUEVO: REORDEN DEL HEADER DE LA TABLA PARA COINCIDIR CON EL DOCUMENTO EXPORTADO */}
                    <thead className="bg-slate-950 text-slate-200">
                        <tr>
                            {['Cant.', 'Activo', 'Alta', 'Cuenta PUC', 'Categoría', 'Uso', 'Estado', 'Lugar', 'V. Original', 'Deprec.', 'V. Neto', 'Acciones'].map(h =>
                                <th key={h} className="p-3 text-left font-semibold whitespace-nowrap">{h}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y">{filteredAssets.map(asset => {
                        const snapshot = getAssetSnapshot(asset, currentDateKey, transactions);
                        const isRetired = !snapshot.present || asset.status === 'Dado de Baja';
                        const origVal = snapshot.originalValue;
                        const acumDepr = snapshot.accumulatedDepreciation;
                        const netVal = snapshot.netBookValue;
                        return (
                            <tr key={asset.id} className={`hover:bg-slate-50 ${isRetired ? 'bg-slate-50 text-slate-500' : ''}`}>
                                <td className="p-3">{asset.quantity || 1}</td>
                                <td className={`p-3 font-medium ${isRetired ? 'line-through text-slate-400' : ''}`}>{asset.name}</td>
                                <td className="p-3 whitespace-nowrap">{asset.acquisitionDate || asset.date || '—'}</td>
                                <td className="p-3"><div className="font-mono text-xs font-bold text-slate-700">{asset.accountCode || 'Pendiente'}</div><div className="max-w-48 truncate text-[11px] text-slate-500" title={asset.accountName || ''}>{asset.accountName || 'Sin vincular'}</div></td>
                                <td className="p-3">{asset.category}</td>
                                <td className="p-3">{asset.usage}</td>
                                <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${isRetired ? 'bg-red-100 text-red-800' : asset.status === 'Bueno' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{isRetired ? 'Dado de Baja' : asset.status}</span></td>
                                <td className="p-3">{asset.location || ''}</td>
                                <td className="p-3 font-mono">${origVal.toLocaleString('es-ES')}</td>
                                <td className="p-3 font-mono text-red-600">${acumDepr.toLocaleString('es-ES')}</td>
                                <td className="p-3 font-mono font-bold text-blue-600">${netVal.toLocaleString('es-ES')}</td>
                                <td className="p-3"><div className="flex gap-1">
                                    <Button size="icon" variant="ghost" onClick={() => setHistoryAsset(asset)} title="Ver historia"><History className="w-4 h-4 text-violet-600" /></Button>
                                    {canEdit && !isRetired && <Button size="icon" variant="ghost" onClick={() => handleOpenRetireDialog(asset)} title="Dar de baja"><Archive className="w-4 h-4 text-orange-600" /></Button>}
                                    {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingAsset(asset); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                                    {canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDeleteAsset(asset.id)}><Trash2 className="w-4 h-4" /></Button>}
                                </div></td>
                            </tr>
                        );
                    })}</tbody>
                </table></div>
            )}
        </div>
        <AssetDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSave={handleSaveAsset}
            asset={editingAsset}
            fixedAssetAccounts={fixedAssetAccounts}
            allAccounts={accounts || []}
            currentDateKey={currentDateKey}
        />
        <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImport} />
        <DepreciationDialog open={depreciationDialogOpen} onOpenChange={setDepreciationDialogOpen} onRun={handleRunDepreciation} year={currentYear - 1} />
        <RetireDialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen} asset={selectedAssetForRetire} reason={retireReason} setReason={setRetireReason} onConfirm={handleConfirmRetire} />
        <AssetHistoryDialog
            open={Boolean(historyAsset)}
            onOpenChange={(open) => { if (!open) setHistoryAsset(null); }}
            asset={historyAsset}
            transactions={transactions || []}
        />
</>
    );
}

const AssetDialog = ({ open, onOpenChange, onSave, asset, fixedAssetAccounts, allAccounts, currentDateKey }) => {
    const emptyAsset = React.useMemo(() => ({
        quantity: 1,
        name: '',
        model: '',
        category: '',
        usage: 'Uso',
        status: 'Bueno',
        location: '',
        value: '',
        residualValue: 0,
        accumulatedDepreciation: 0,
        depreciationAsOf: currentDateKey,
        acquisitionDate: currentDateKey,
        accountCode: '',
        accountName: '',
        accumulatedDepreciationAccountCode: '',
        accumulatedDepreciationAccountName: '',
        depreciationExpenseAccountCode: '',
        depreciationExpenseAccountName: '',
        usefulLifeYears: 10,
        depreciationMethod: 'linea_recta',
        notes: '',
    }), [currentDateKey]);
    const [data, setData] = useState(emptyAsset);

    useEffect(() => {
        if (!open) return;
        setData(asset ? {
            ...emptyAsset,
            ...asset,
            acquisitionDate: toAccountingDateInput(asset.acquisitionDate || asset.date) || currentDateKey,
            depreciationAsOf: toAccountingDateInput(asset.depreciationAsOf) || currentDateKey,
        } : emptyAsset);
    }, [asset, open, currentDateKey, emptyAsset]);

    const leafAccountsByPrefix = (prefix) => {
        const candidates = (allAccounts || []).filter(account => String(account.number || '').startsWith(prefix));
        return candidates.filter(account => {
            const code = String(account.number || '');
            return !candidates.some(other => {
                const otherCode = String(other.number || '');
                return otherCode !== code && otherCode.startsWith(code);
            });
        });
    };
    const accumulatedAccounts = leafAccountsByPrefix('1592');
    const expenseAccounts = leafAccountsByPrefix('5160');

    const handleAssetAccountChange = (code) => {
        const selected = (fixedAssetAccounts || []).find(account => String(account.number) === String(code));
        if (!selected) {
            setData(prev => ({ ...prev, accountCode: '', accountName: '' }));
            return;
        }
        const suggested = suggestDepreciationAccounts(selected, allAccounts || []);
        setData(prev => ({
            ...prev,
            accountCode: selected.number,
            accountName: selected.name,
            category: prev.category || selected.name,
            usefulLifeYears: defaultUsefulLifeYears(selected.number),
            accumulatedDepreciationAccountCode: suggested.accumulated?.number || '',
            accumulatedDepreciationAccountName: suggested.accumulated?.name || '',
            depreciationExpenseAccountCode: suggested.expense?.number || '',
            depreciationExpenseAccountName: suggested.expense?.name || '',
        }));
    };

    const handleDepAccountChange = (field, code, options) => {
        const selected = options.find(account => String(account.number) === String(code));
        setData(prev => ({
            ...prev,
            [field + 'Code']: selected?.number || '',
            [field + 'Name']: selected?.name || '',
        }));
    };

    const handleSubmit = e => {
        e.preventDefault();
        onSave(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{asset ? 'Editar' : 'Nuevo'} Activo Fijo</DialogTitle>
                    <DialogDescription>El bien conserva una sola identidad desde su alta hasta su baja y queda vinculado al Plan de Cuentas.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-2">
                    <div className="space-y-1"><Label>Fecha de adquisición / alta</Label><input type="date" required value={data.acquisitionDate || ''} onChange={e => setData({...data, acquisitionDate: e.target.value, date: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Cuenta del Activo (PUC) *</Label><select required value={data.accountCode || ''} onChange={e => handleAssetAccountChange(e.target.value)} className="w-full p-2 border rounded-lg bg-white"><option value="">Seleccionar cuenta...</option>{(fixedAssetAccounts || []).map(account => <option key={account.id || account.number} value={account.number}>{account.number} · {account.name}</option>)}</select></div>
                    <div className="space-y-1"><Label>Nombre del Activo</Label><input required value={data.name || ''} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Cantidad</Label><input type="number" min="1" required value={data.quantity || 1} onChange={e => setData({...data, quantity: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Marca / Modelo / Serie</Label><input value={data.model || ''} onChange={e => setData({...data, model: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Categoría</Label><input value={data.category || ''} onChange={e => setData({...data, category: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Uso</Label><select value={data.usage || 'Uso'} onChange={e => setData({...data, usage: e.target.value})} className="w-full p-2 border rounded-lg"><option>Uso</option><option>Desuso</option><option>Préstamo</option></select></div>
                    <div className="space-y-1"><Label>Estado físico</Label><select value={data.status || 'Bueno'} onChange={e => setData({...data, status: e.target.value})} className="w-full p-2 border rounded-lg"><option>Bueno</option><option>Regular</option><option>Malo</option></select></div>
                    <div className="space-y-1"><Label>Lugar a inventariar</Label><input value={data.location || ''} onChange={e => setData({...data, location: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Ej: Templo, Sacristía..." /></div>
                    <div className="space-y-1"><Label>Valor de adquisición</Label><input type="number" min="0" step="0.01" required value={data.value ?? ''} onChange={e => setData({...data, value: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Valor residual</Label><input type="number" min="0" step="0.01" value={data.residualValue || 0} onChange={e => setData({...data, residualValue: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Vida útil (años)</Label><input type="number" min="0" step="1" value={data.usefulLifeYears ?? 10} onChange={e => setData({...data, usefulLifeYears: e.target.value})} className="w-full p-2 border rounded-lg" /><p className="text-[11px] text-slate-500">0 = no depreciable (por ejemplo, terrenos).</p></div>
                    <div className="space-y-1"><Label>Método de depreciación</Label><select value={data.depreciationMethod || 'linea_recta'} onChange={e => setData({...data, depreciationMethod: e.target.value})} className="w-full p-2 border rounded-lg"><option value="linea_recta">Línea recta</option></select></div>
                    <div className="space-y-1"><Label>Cuenta gasto depreciación</Label><select value={data.depreciationExpenseAccountCode || ''} onChange={e => handleDepAccountChange('depreciationExpenseAccount', e.target.value, expenseAccounts)} className="w-full p-2 border rounded-lg bg-white"><option value="">Sin asignar / no depreciable</option>{expenseAccounts.map(account => <option key={account.id || account.number} value={account.number}>{account.number} · {account.name}</option>)}</select></div>
                    <div className="space-y-1"><Label>Cuenta depreciación acumulada</Label><select value={data.accumulatedDepreciationAccountCode || ''} onChange={e => handleDepAccountChange('accumulatedDepreciationAccount', e.target.value, accumulatedAccounts)} className="w-full p-2 border rounded-lg bg-white"><option value="">Sin asignar / no depreciable</option>{accumulatedAccounts.map(account => <option key={account.id || account.number} value={account.number}>{account.number} · {account.name}</option>)}</select></div>
                    <div className="space-y-1"><Label>Depreciación acumulada histórica</Label><input type="number" min="0" step="0.01" disabled={Boolean(asset)} value={data.accumulatedDepreciation || 0} onChange={e => setData({...data, accumulatedDepreciation: e.target.value})} className="w-full p-2 border rounded-lg text-red-600 disabled:bg-slate-100" /></div>
                    {!asset && Number(data.accumulatedDepreciation || 0) > 0 && <div className="space-y-1"><Label>Depreciación histórica reconocida al</Label><input type="date" value={data.depreciationAsOf || currentDateKey} onChange={e => setData({...data, depreciationAsOf: e.target.value})} className="w-full p-2 border rounded-lg" /></div>}
                    <div className="md:col-span-2 space-y-1"><Label>Observaciones</Label><textarea value={data.notes || ''} onChange={e => setData({...data, notes: e.target.value})} className="w-full p-2 border rounded-lg" rows={3} /></div>
                    <div className="md:col-span-2 flex justify-end gap-2 pt-2"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-violet-600 hover:bg-violet-700">Guardar activo</Button></div>
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
                    acquisitionDate: indexOf(['FECHA ADQUISICION', 'FECHA DE ADQUISICION', 'FECHA ALTA', 'FECHA DE ALTA', 'FECHA']),
                    accountCode: indexOf(['CUENTA PUC', 'CODIGO PUC', 'CODIGO CUENTA', 'CUENTA ACTIVO']),
                    accountName: indexOf(['NOMBRE CUENTA PUC', 'NOMBRE CUENTA', 'CUENTA CONTABLE']),
                    usefulLife: indexOf(['VIDA UTIL', 'VIDA UTIL ANOS', 'VIDA UTIL (ANOS)']),
                    residualValue: indexOf(['VALOR RESIDUAL', 'RESIDUAL']),
                    depreciationAsOf: indexOf(['DEPRECIACION AL', 'DEPREC. AL', 'CORTE DEPRECIACION']),
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
                        acquisitionDate: String(read(row, indexes.acquisitionDate) || '').trim(),
                        accountCode: String(read(row, indexes.accountCode) || '').trim(),
                        accountName: String(read(row, indexes.accountName) || '').trim(),
                        usefulLifeYears: Math.max(0, parseNumber(read(row, indexes.usefulLife))),
                        residualValue: Math.max(0, parseNumber(read(row, indexes.residualValue))),
                        depreciationAsOf: String(read(row, indexes.depreciationAsOf) || '').trim(),
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

const AssetHistoryDialog = ({ open, onOpenChange, asset, transactions }) => {
    const history = asset ? buildAssetHistory(asset, transactions) : [];
    const typeLabel = {
        acquisition: 'Alta / adquisición',
        depreciation: 'Depreciación',
        retirement: 'Baja',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Historia del Activo</DialogTitle>
                    <DialogDescription>{asset?.name || 'Activo'} · {asset?.accountCode || 'Sin cuenta PUC'}{asset?.accountName ? ' · ' + asset.accountName : ''}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {history.map((entry, index) => (
                        <div key={[entry.type, entry.date, index].join('-')} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs font-extrabold uppercase tracking-wide text-violet-600">{typeLabel[entry.type] || entry.type}</p>
                                    <p className="mt-1 font-bold text-slate-900">{entry.date || 'Fecha no disponible'}</p>
                                </div>
                                {Number(entry.amount || 0) > 0 && <span className="font-mono font-bold text-slate-800">$ {Number(entry.amount).toLocaleString('es-CO')}</span>}
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{entry.label || entry.reason || ''}</p>
                            {entry.voucherNumber != null && <p className="mt-1 text-xs text-slate-500">Comprobante A-{String(entry.voucherNumber).padStart(4, '0')}</p>}
                            {entry.reason && <p className="mt-1 text-xs text-slate-500">Motivo: {entry.reason}</p>}
                        </div>
                    ))}
                    {history.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay eventos históricos registrados.</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const DepreciationDialog = ({ open, onOpenChange, onRun, year }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Registrar depreciación · {year}</DialogTitle></DialogHeader>
            <DialogDescription>
                Calcula la depreciación pendiente sobre los mismos activos permanentes, usando costo, valor residual, vida útil y cuentas PUC vinculadas. Cada valor queda guardado en la historia individual del bien y genera comprobantes de ajuste sin afectar caja ni bancos.
            </DialogDescription>
            <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={onRun} className="bg-purple-600 hover:bg-purple-700">Calcular y registrar {year}</Button>
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