import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Building, Plus, Edit2, Trash2, Search, Lock, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { useDestructiveAction } from '@/contexts/DestructiveActionContext';
import { usePermission } from '@/hooks/usePermission';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { getAccountingYear, toAccountingDateInput } from '@/lib/accountingDate';
import { buildAssetHistory, calculateAnnualDepreciation, getAssetSnapshot } from '@/lib/fixedAssetLifecycle';
import {
    PATRIMONIAL_ASSET_TYPES,
    buildPatrimonialRegistry,
    getRealEstateAccounts,
    inferPatrimonialAssetType,
    suggestPatrimonialAccounts,
} from '@/lib/patrimonialAssets';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';

const RealEstates = () => {
    const { canEdit, canDelete, canAdd, isReadOnly, isConsolidatedReadOnly } = usePermission();
    const { activeCompany } = useCompany();
    const [realEstates, saveRealEstates] = useCompanyData('realEstates');
    const [fixedAssets, saveFixedAssets, isFixedAssetsLoaded] = useCompanyData('fixedAssets');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    const { toast } = useToast();
    const { requestDestructiveAuthorization, releaseDestructiveAuthorization } = useDestructiveAction();

    const currentDate = toAccountingDateInput(new Date());
    const currentYear = getAccountingYear(currentDate);
    const registry = useMemo(
        () => buildPatrimonialRegistry(fixedAssets || [], realEstates || []),
        [fixedAssets, realEstates]
    );
    const estateAssets = useMemo(
        () => registry.filter(asset => inferPatrimonialAssetType(asset) === PATRIMONIAL_ASSET_TYPES.REAL_ESTATE),
        [registry]
    );
    const estateAccounts = useMemo(() => getRealEstateAccounts(accounts || []), [accounts]);

    const [searchTerm, setSearchTerm] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEstate, setEditingEstate] = useState(null);
    const [historyAsset, setHistoryAsset] = useState(null);
    const [depreciationDialogOpen, setDepreciationDialogOpen] = useState(false);

    useEffect(() => {
        if (!isFixedAssetsLoaded || isReadOnly) return;
        if (JSON.stringify(registry) !== JSON.stringify(fixedAssets || [])) {
            saveFixedAssets(registry);
        }
    }, [registry, fixedAssets, isFixedAssetsLoaded, isReadOnly, saveFixedAssets]);

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const getNextVoucher = (type, dateStr) => {
        const year = getAccountingYear(dateStr).toString();
        return (transactions || [])
            .filter(t => getAccountingYear(t.date).toString() === year && (
                type === 'adjustment'
                    ? t.type === 'adjustment' || t.voucherPrefix === 'A'
                    : t.type === 'transfer' || t.voucherPrefix === 'T'
            ))
            .reduce((max, t) => Math.max(max, Number(t.voucherNumber) || 0), 0) + 1;
    };

    const metadataFor = asset => (realEstates || []).find(estate =>
        String(estate.id || '') === String(asset.sourceEstateId || '') ||
        String(estate.masterAssetId || '') === String(asset.id || '')
    );

    const filteredEstates = estateAssets.filter(asset => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return true;
        return [asset.name, asset.address, asset.location, asset.accountCode, asset.accountName]
            .some(value => String(value || '').toLowerCase().includes(q));
    });
    const handleSaveEstate = async data => {
        if (editingEstate ? !canEdit : !canAdd) return;

        const value = Number(data.value || 0);
        const residual = Number(data.residualValue || 0);
        const acquisitionDate = toAccountingDateInput(data.acquisitionDate || data.date) || currentDate;
        if (!data.accountCode) {
            toast({ variant: 'destructive', title: 'Cuenta PUC requerida', description: 'Selecciona la cuenta del terreno, construcción o edificación.' });
            return;
        }
        if (!Number.isFinite(value) || value < 0 || residual < 0 || residual > value) {
            toast({ variant: 'destructive', title: 'Valores inválidos', description: 'Revisa costo histórico y valor residual.' });
            return;
        }

        const prior = editingEstate || null;
        const selectedAccount = estateAccounts.find(account => String(account.number) === String(data.accountCode));
        const recognitionAccount = !prior && value > 0
            ? (accounts || []).find(account => String(account.number) === String(data.recognitionAccountCode || ''))
            : null;
        if (!prior && value > 0 && !recognitionAccount) {
            toast({
                variant: 'destructive',
                title: 'Contrapartida requerida',
                description: 'Selecciona la cuenta contable que explica el reconocimiento inicial del inmueble: Caja/Banco, cuenta por pagar, patrimonio o ingreso/donación.'
            });
            return;
        }
        if (recognitionAccount && String(recognitionAccount.number) === String(data.accountCode)) {
            toast({ variant: 'destructive', title: 'Contrapartida inválida', description: 'La cuenta del inmueble y su contrapartida no pueden ser la misma.' });
            return;
        }
        const suggested = suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.REAL_ESTATE, selectedAccount, accounts || []);
        const hasHistory = prior && (
            Number(prior.accumulatedDepreciation || 0) > 0 ||
            Boolean(prior.transactionId) ||
            (Array.isArray(prior.depreciationHistory) && prior.depreciationHistory.length > 0)
        );

        if (hasHistory) {
            const changedBase =
                Number(prior.value || 0) !== value ||
                toAccountingDateInput(prior.acquisitionDate || prior.date) !== acquisitionDate ||
                (prior.accountCode && String(prior.accountCode) !== String(data.accountCode));
            if (changedBase) {
                toast({
                    variant: 'destructive',
                    title: 'Historia inmobiliaria protegida',
                    description: 'Costo, fecha de alta y una cuenta PUC ya utilizada no se cambian directamente cuando existe historia contable.'
                });
                return;
            }
        }

        const masterId = prior?.id || `estate-asset-${Date.now()}`;
        const oldMetadata = prior ? metadataFor(prior) : null;
        const metadataId = oldMetadata?.id || prior?.sourceEstateId || `estate-meta-${Date.now()}`;
        const normalizedMaster = {
            ...(prior || {}),
            id: masterId,
            sourceEstateId: metadataId,
            assetType: PATRIMONIAL_ASSET_TYPES.REAL_ESTATE,
            acquisitionDate,
            date: acquisitionDate,
            name: data.name,
            value,
            quantity: 1,
            location: data.address || data.location || '',
            address: data.address || data.location || '',
            category: selectedAccount?.name || data.category || 'Propiedad / Inmueble',
            accountCode: selectedAccount?.number || data.accountCode,
            accountName: selectedAccount?.name || data.accountName,
            usefulLifeYears: Number(data.usefulLifeYears || (String(data.accountCode).startsWith('1504') ? 0 : 45)),
            residualValue: residual,
            depreciationMethod: 'linea_recta',
            accumulatedDepreciation: Number(prior?.accumulatedDepreciation || data.accumulatedDepreciation || 0),
            accumulatedDepreciationAccountCode: data.accumulatedDepreciationAccountCode || suggested.accumulated?.number || prior?.accumulatedDepreciationAccountCode || '',
            accumulatedDepreciationAccountName: data.accumulatedDepreciationAccountName || suggested.accumulated?.name || prior?.accumulatedDepreciationAccountName || '',
            depreciationExpenseAccountCode: data.depreciationExpenseAccountCode || suggested.expense?.number || prior?.depreciationExpenseAccountCode || '',
            depreciationExpenseAccountName: data.depreciationExpenseAccountName || suggested.expense?.name || prior?.depreciationExpenseAccountName || '',
            status: prior?.status || 'Activo',
            contractManaged: Boolean(prior?.contractManaged || data.contractManaged),
            sourceContractNumber: prior?.sourceContractNumber || data.sourceContractNumber || '',
            recognitionAccountCode: prior?.recognitionAccountCode || recognitionAccount?.number || data.recognitionAccountCode || '',
            recognitionAccountName: prior?.recognitionAccountName || recognitionAccount?.name || data.recognitionAccountName || '',
            lifecycleVersion: 3,
            company_id: activeCompany?.id,
            companyId: activeCompany?.id,
        };

        const metadata = {
            ...(oldMetadata || {}),
            id: metadataId,
            masterAssetId: masterId,
            name: normalizedMaster.name,
            address: normalizedMaster.address,
            date: acquisitionDate,
            value,
            accountCode: normalizedMaster.accountCode,
            accountName: normalizedMaster.accountName,
            usefulLifeYears: normalizedMaster.usefulLifeYears,
            residualValue: normalizedMaster.residualValue,
            accumulatedDepreciation: normalizedMaster.accumulatedDepreciation,
            accumulatedDepreciationAccountCode: normalizedMaster.accumulatedDepreciationAccountCode,
            accumulatedDepreciationAccountName: normalizedMaster.accumulatedDepreciationAccountName,
            depreciationExpenseAccountCode: normalizedMaster.depreciationExpenseAccountCode,
            depreciationExpenseAccountName: normalizedMaster.depreciationExpenseAccountName,
            status: normalizedMaster.status,
            contractManaged: normalizedMaster.contractManaged,
            sourceContractNumber: normalizedMaster.sourceContractNumber,
            recognitionAccountCode: normalizedMaster.recognitionAccountCode || '',
            recognitionAccountName: normalizedMaster.recognitionAccountName || '',
            company_id: activeCompany?.id,
            companyId: activeCompany?.id,
        };

        const otherMaster = registry.filter(asset => String(asset.id) !== String(masterId));
        const nextMetadata = oldMetadata
            ? (realEstates || []).map(estate => String(estate.id) === String(oldMetadata.id) ? metadata : estate)
            : [...(realEstates || []), metadata];

        if (!prior && value > 0) {
            const lockReason = periodLockReason(acquisitionDate);
            if (lockReason) {
                toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
                return;
            }
            const counterpart = recognitionAccount;
            const voucherNumber = getNextVoucher('transfer', acquisitionDate);
            const transactionId = `txn-estate-${masterId}`;
            normalizedMaster.transactionId = transactionId;
            await saveTransactions([...(transactions || []), {
                id: transactionId,
                date: acquisitionDate,
                type: 'transfer',
                voucherPrefix: 'T',
                voucherNumber,
                description: `Registro Inicial de Propiedad: ${normalizedMaster.name}`,
                amount: value,
                category: counterpart.name,
                debitAccount: { code: normalizedMaster.accountCode, name: normalizedMaster.accountName },
                creditAccount: { code: counterpart.number, name: counterpart.name },
                isInternalTransfer: false,
                isInitialStock: true,
                isEstateInitialEntry: true,
                isFixedAsset: true,
                isPatrimonialAsset: true,
                patrimonialAssetType: PATRIMONIAL_ASSET_TYPES.REAL_ESTATE,
                fixedAssetId: masterId,
                estateId: metadataId,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id,
            }]);
        }

        await saveRealEstates(nextMetadata);
        await saveFixedAssets([...otherMaster, normalizedMaster]);
        toast({ title: prior ? 'Propiedad actualizada' : 'Propiedad registrada', description: 'El inmueble quedó vinculado al Registro Patrimonial Maestro.' });
        setDialogOpen(false);
        setEditingEstate(null);
    };
    const handleDelete = async asset => {
        if (!canDelete) return;
        const metadata = metadataFor(asset);
        if (asset.contractManaged || metadata?.contractManaged) {
            toast({ variant: 'destructive', title: 'Propiedad protegida', description: 'Fue generada desde Contratos y debe conservar su trazabilidad.' });
            return;
        }
        const hasHistory =
            Boolean(asset.transactionId) ||
            Number(asset.accumulatedDepreciation || 0) > 0 ||
            (Array.isArray(asset.depreciationHistory) && asset.depreciationHistory.length > 0);
        if (hasHistory) {
            toast({ variant: 'destructive', title: 'Historia contable protegida', description: 'No puede eliminarse un inmueble con transacción de origen o depreciación. Utilice la baja patrimonial.' });
            return;
        }

        const destructiveAuthorization = await requestDestructiveAuthorization({
            title: 'Eliminar propiedad',
            subject: asset.name || asset.description || metadata?.name || 'Inmueble seleccionado',
            description: 'Se eliminará el registro patrimonial y su ficha inmobiliaria. Solo es posible porque el inmueble no tiene historia contable.',
        });
        if (!destructiveAuthorization?.sessionToken) return;

        try {
            const options = { destructiveAuthorization };
            const masterSaved = await saveFixedAssets(
                (fixedAssets || []).filter(item => String(item.id) !== String(asset.id)),
                options
            );
            if (masterSaved === false) throw new Error('No se pudo actualizar el Registro Patrimonial Maestro.');

            if (metadata) {
                const metadataSaved = await saveRealEstates(
                    (realEstates || []).filter(item => String(item.id) !== String(metadata.id)),
                    options
                );
                if (metadataSaved === false) throw new Error('No se pudo actualizar la ficha inmobiliaria.');
            }

            toast({ title: 'Propiedad eliminada', description: 'La eliminación fue autorizada con Acceso Total.' });
        } catch (error) {
            toast({ variant:'destructive', title:'Eliminación bloqueada', description:error?.message || 'No se pudo eliminar la propiedad.' });
        } finally {
            await releaseDestructiveAuthorization(destructiveAuthorization);
        }
    };

    const handleRunDepreciation = async () => {
        if (!canEdit) return;
        const targetYear = currentYear - 1;
        const dateStr = `${targetYear}-12-31`;
        const lockReason = periodLockReason(dateStr);
        if (lockReason) {
            toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
            return;
        }

        const eligible = estateAssets.filter(asset => {
            const acquired = toAccountingDateInput(asset.acquisitionDate || asset.date);
            const retired = toAccountingDateInput(asset.retiredAt);
            const years = Array.isArray(asset.depreciatedYears) ? asset.depreciatedYears.map(String) : [];
            return acquired && acquired <= dateStr &&
                (!retired || retired > dateStr) &&
                asset.status !== 'Dado de Baja' &&
                calculateAnnualDepreciation(asset) > 0 &&
                !years.includes(String(targetYear));
        });

        const missingPuc = eligible.filter(asset => !asset.accountCode);
        if (missingPuc.length > 0) {
            toast({ variant: 'destructive', title: 'Inmuebles sin cuenta PUC', description: `Hay ${missingPuc.length} inmueble(s) sin cuenta PUC. Vincúlalos antes de depreciar.` });
            setDepreciationDialogOpen(false);
            return;
        }
        const missingDepAccounts = eligible.filter(asset => {
            const suggested = suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.REAL_ESTATE, { number: asset.accountCode }, accounts || []);
            return !(asset.depreciationExpenseAccountCode || suggested.expense?.number) ||
                !(asset.accumulatedDepreciationAccountCode || suggested.accumulated?.number);
        });
        if (missingDepAccounts.length > 0) {
            toast({ variant: 'destructive', title: 'Falta parametrizar depreciación', description: `Hay ${missingDepAccounts.length} inmueble(s) sin las dos cuentas de depreciación.` });
            setDepreciationDialogOpen(false);
            return;
        }

        const groups = new Map();
        eligible.forEach(asset => {
            const historical = Number(asset.accumulatedDepreciation || 0);
            const remaining = Math.max(0, Number(asset.value || 0) - Number(asset.residualValue || 0) - historical);
            const annual = calculateAnnualDepreciation(asset);
            if (annual <= 0 || remaining <= 0) return;
            const acquired = toAccountingDateInput(asset.acquisitionDate || asset.date);
            const acquiredYear = Number(acquired.slice(0, 4));
            const acquiredMonth = Number(acquired.slice(5, 7));
            const factor = acquiredYear === targetYear ? Math.max(1, 13 - acquiredMonth) / 12 : 1;
            const amount = Math.min(remaining, annual * factor);
            if (amount <= 0) return;

            const suggested = suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.REAL_ESTATE, { number: asset.accountCode }, accounts || []);
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
            toast({ title: 'Sin depreciación pendiente', description: `No hay inmuebles pendientes de depreciar para ${targetYear}.` });
            setDepreciationDialogOpen(false);
            return;
        }
        const firstVoucher = getNextVoucher('adjustment', dateStr);
        const createdTransactions = [];
        const byAsset = new Map();
        [...groups.values()].forEach((group, index) => {
            const transactionId = `${Date.now()}-depr-estate-${index}`;
            const voucherNumber = firstVoucher + index;
            const amount = group.entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
            createdTransactions.push({
                id: transactionId,
                type: 'adjustment',
                voucherPrefix: 'A',
                voucherNumber,
                date: dateStr,
                description: `Depreciación de Inmuebles - Vigencia ${targetYear}`,
                amount,
                category: 'Depreciación Acumulada Activos Fijos',
                debitAccount: group.expense,
                creditAccount: group.accumulated,
                isFixedAssetDepreciation: true,
                isPropertyDepreciation: true,
                depreciationYear: String(targetYear),
                fixedAssetEntries: group.entries,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id,
            });
            group.entries.forEach(entry => byAsset.set(String(entry.assetId), { ...entry, transactionId, voucherNumber }));
        });

        const nextRegistry = registry.map(asset => {
            const entry = byAsset.get(String(asset.id));
            if (!entry) return asset;
            const accumulated = Number(asset.accumulatedDepreciation || 0) + Number(entry.amount || 0);
            const history = buildAssetHistory(asset, transactions).filter(item => item.type === 'depreciation');
            const years = Array.isArray(asset.depreciatedYears) ? asset.depreciatedYears.map(String) : [];
            return {
                ...asset,
                accumulatedDepreciation: accumulated,
                netBookValue: Math.max(0, Number(asset.value || 0) - accumulated),
                depreciatedYear: String(targetYear),
                depreciatedYears: [...new Set([...years, String(targetYear)])],
                depreciationHistory: [...history, entry],
                lifecycleVersion: 3,
            };
        });

        const nextMetadata = (realEstates || []).map(estate => {
            const master = nextRegistry.find(asset =>
                String(asset.id) === String(estate.masterAssetId || '') ||
                String(asset.sourceEstateId || '') === String(estate.id || '')
            );
            return master ? {
                ...estate,
                masterAssetId: master.id,
                accumulatedDepreciation: master.accumulatedDepreciation,
                depreciatedYears: master.depreciatedYears,
            } : estate;
        });

        await saveTransactions([...(transactions || []), ...createdTransactions]);
        await saveFixedAssets(nextRegistry);
        await saveRealEstates(nextMetadata);
        toast({ title: 'Depreciación registrada', description: `Los inmuebles quedaron depreciados para ${targetYear} dentro del registro patrimonial único.` });
        setDepreciationDialogOpen(false);
    };

    return (
        <>
            <Helmet><title>Propiedades e Inmuebles - HERTUR Contabilidad</title></Helmet>
            <div className="space-y-6">
                <ProfessionalModuleHero
                    eyebrow="Gestión inmobiliaria"
                    title="Propiedades e Inmuebles"
                    subtitle="Vista especializada del Registro Patrimonial Maestro para terrenos, templos, casas curales, oficinas y edificaciones."
                    activeCompany={activeCompany}
                    icon={Building}
                    accent="blue"
                    badges={isReadOnly ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">{isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}</span> : null}
                    metrics={[
                        { label: 'Inmuebles', value: filteredEstates.length },
                        { label: 'Vigentes', value: filteredEstates.filter(asset => getAssetSnapshot(asset, currentDate, transactions).present).length },
                        { label: 'Pendientes PUC', value: filteredEstates.filter(asset => !asset.accountCode).length },
                    ]}
                    actions={<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{canEdit && <Button variant="outline" onClick={() => setDepreciationDialogOpen(true)} className="h-10 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">Depreciar {currentYear - 1}</Button>}{canAdd && <Button onClick={() => { setEditingEstate(null); setDialogOpen(true); }} className="h-10 bg-blue-600 text-white hover:bg-blue-500"><Plus className="mr-2 h-4 w-4" />Nueva propiedad</Button>}</div>}
                />

                <motion.div initial={{ opacity:0,y:14 }} animate={{ opacity:1,y:0 }} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="relative"><Label>Buscar inmueble</Label><Search className="absolute left-3 top-10 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Nombre, dirección o cuenta PUC..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/60" /></div>
                </motion.div>

                {filteredEstates.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-sm"><Building className="mx-auto mb-4 h-16 w-16 text-slate-300" /><p className="text-slate-500">No hay inmuebles registrados.</p></div> :
                <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm" style={{WebkitOverflowScrolling:'touch'}}>
                    <table className="w-full min-w-[1250px] text-sm">
                        <thead className="bg-slate-950 text-slate-200"><tr>{['Inmueble','Dirección','Alta','Cuenta PUC','Costo','Depreciación','Valor libros','Estado','Acciones'].map(h=><th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr></thead>
                        <tbody className="divide-y">{filteredEstates.map(asset=>{
                            const snapshot=getAssetSnapshot(asset,currentDate,transactions);
                            const metadata=metadataFor(asset);
                            return <tr key={asset.id} className="hover:bg-slate-50">
                                <td className="p-3 font-semibold">{asset.name}</td>
                                <td className="p-3">{asset.address||asset.location||'—'}</td>
                                <td className="p-3">{asset.acquisitionDate||asset.date||'—'}</td>
                                <td className="p-3"><div className="font-mono text-xs font-bold">{asset.accountCode||'Pendiente'}</div><div className="max-w-56 truncate text-[11px] text-slate-500">{asset.accountName||''}</div></td>
                                <td className="p-3 font-mono">$ {snapshot.originalValue.toLocaleString('es-CO')}</td>
                                <td className="p-3 font-mono text-rose-600">$ {snapshot.accumulatedDepreciation.toLocaleString('es-CO')}</td>
                                <td className="p-3 font-mono font-bold text-blue-700">$ {snapshot.netBookValue.toLocaleString('es-CO')}</td>
                                <td className="p-3">{asset.contractManaged||metadata?.contractManaged?<span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700"><Lock className="h-3 w-3"/>Contrato</span>:snapshot.present?'Activo':'Baja'}</td>
                                <td className="p-3"><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={()=>setHistoryAsset(asset)} title="Historia"><History className="h-4 w-4 text-blue-600"/></Button>{canEdit&&<Button size="icon" variant="ghost" onClick={()=>{setEditingEstate(asset);setDialogOpen(true)}}><Edit2 className="h-4 w-4"/></Button>}{canDelete&&<Button size="icon" variant="ghost" onClick={()=>handleDelete(asset)}><Trash2 className="h-4 w-4 text-red-600"/></Button>}</div></td>
                            </tr>;
                        })}</tbody>
                    </table>
                </div>}
            </div>
            <EstateDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveEstate} estate={editingEstate} accounts={accounts||[]} estateAccounts={estateAccounts} currentDate={currentDate}/>
            <HistoryDialog open={Boolean(historyAsset)} onOpenChange={open=>{if(!open)setHistoryAsset(null)}} asset={historyAsset} transactions={transactions||[]}/>
            <DepreciationDialog open={depreciationDialogOpen} onOpenChange={setDepreciationDialogOpen} year={currentYear-1} onRun={handleRunDepreciation}/>
        </>
    );
};

const EstateDialog = ({open,onOpenChange,onSave,estate,accounts,estateAccounts,currentDate}) => {
    const blank = useMemo(() => ({name:'',address:'',acquisitionDate:currentDate,date:currentDate,value:'',residualValue:0,usefulLifeYears:45,accountCode:'',accountName:'',recognitionAccountCode:'',recognitionAccountName:'',accumulatedDepreciation:0,accumulatedDepreciationAccountCode:'',accumulatedDepreciationAccountName:'',depreciationExpenseAccountCode:'',depreciationExpenseAccountName:''}), [currentDate]);
    const [data,setData]=useState(blank);
    useEffect(()=>{if(open)setData(estate?{...blank,...estate,address:estate.address||estate.location||'',acquisitionDate:toAccountingDateInput(estate.acquisitionDate||estate.date)||currentDate}:blank)},[estate,open,currentDate,blank]);

    const leafByPrefix=prefix=>{
        const pool=(accounts||[]).filter(a=>String(a.number||'').startsWith(prefix));
        return pool.filter(a=>!pool.some(other=>String(other.number||'')!==String(a.number||'')&&String(other.number||'').startsWith(String(a.number||''))));
    };
    const depAccum=[...leafByPrefix('1592')];
    const depExpense=[...leafByPrefix('5160')];
    const counterpartCandidates = (accounts || []).filter(account => {
        const code = String(account.number || '');
        return code.startsWith('11') || code.startsWith('2') || code.startsWith('3') || code.startsWith('4');
    });
    const counterpartAccounts = counterpartCandidates
        .filter(account => {
            const code = String(account.number || '');
            return !counterpartCandidates.some(other => {
                const otherCode = String(other.number || '');
                return otherCode !== code && otherCode.startsWith(code);
            });
        })
        .sort((a,b)=>String(a.number||'').localeCompare(String(b.number||'')));

    const handleAccount=code=>{
        const selected=estateAccounts.find(a=>String(a.number)===String(code));
        const suggested=suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.REAL_ESTATE,selected,accounts);
        setData(prev=>({...prev,accountCode:selected?.number||'',accountName:selected?.name||'',usefulLifeYears:String(code).startsWith('1504')?0:Number(prev.usefulLifeYears||45),accumulatedDepreciationAccountCode:suggested.accumulated?.number||prev.accumulatedDepreciationAccountCode||'',accumulatedDepreciationAccountName:suggested.accumulated?.name||prev.accumulatedDepreciationAccountName||'',depreciationExpenseAccountCode:suggested.expense?.number||prev.depreciationExpenseAccountCode||'',depreciationExpenseAccountName:suggested.expense?.name||prev.depreciationExpenseAccountName||''}));
    };
    const pick=(kind,code)=>{
        const pool=kind==='expense'?depExpense:depAccum;
        const selected=pool.find(a=>String(a.number)===String(code));
        setData(prev=>kind==='expense'?{...prev,depreciationExpenseAccountCode:selected?.number||'',depreciationExpenseAccountName:selected?.name||''}:{...prev,accumulatedDepreciationAccountCode:selected?.number||'',accumulatedDepreciationAccountName:selected?.name||''});
    };
    const pickRecognitionAccount = code => {
        const selected = counterpartAccounts.find(account => String(account.number) === String(code));
        setData(prev => ({
            ...prev,
            recognitionAccountCode: selected?.number || '',
            recognitionAccountName: selected?.name || '',
        }));
    };

    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{estate?'Editar':'Nueva'} Propiedad</DialogTitle><DialogDescription>El inmueble queda enlazado al Registro Patrimonial Maestro y al Plan de Cuentas.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();onSave(data)}} className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
        <div className="space-y-1"><Label>Nombre</Label><input required value={data.name||''} onChange={e=>setData({...data,name:e.target.value})} className="w-full rounded-lg border p-2"/></div>
        <div className="space-y-1"><Label>Fecha de adquisición / alta</Label><input type="date" required value={data.acquisitionDate||''} onChange={e=>setData({...data,acquisitionDate:e.target.value,date:e.target.value})} className="w-full rounded-lg border p-2"/></div>
        <div className="space-y-1 md:col-span-2"><Label>Dirección / ubicación</Label><input required value={data.address||''} onChange={e=>setData({...data,address:e.target.value})} className="w-full rounded-lg border p-2"/></div>
        <div className="space-y-1 md:col-span-2"><Label>Cuenta del inmueble (PUC) *</Label><select required value={data.accountCode||''} onChange={e=>handleAccount(e.target.value)} className="w-full rounded-lg border bg-white p-2"><option value="">Seleccionar cuenta...</option>{estateAccounts.map(a=><option key={a.id||a.number} value={a.number}>{a.number} · {a.name}</option>)}</select></div>
        <div className="space-y-1"><Label>Costo histórico</Label><input type="number" min="0" step="0.01" required value={data.value??''} onChange={e=>setData({...data,value:e.target.value})} className="w-full rounded-lg border p-2"/></div>
        <div className="space-y-1"><Label>Valor residual</Label><input type="number" min="0" step="0.01" value={data.residualValue||0} onChange={e=>setData({...data,residualValue:e.target.value})} className="w-full rounded-lg border p-2"/></div>
        {!estate && Number(data.value || 0) > 0 && <div className="space-y-1 md:col-span-2">
            <Label>Contrapartida del reconocimiento inicial *</Label>
            <select required value={data.recognitionAccountCode||''} onChange={e=>pickRecognitionAccount(e.target.value)} className="w-full rounded-lg border bg-white p-2">
                <option value="">Seleccionar cuenta...</option>
                {counterpartAccounts.filter(account=>String(account.number)!==String(data.accountCode||'')).map(account=><option key={account.id||account.number} value={account.number}>{account.number} · {account.name}</option>)}
            </select>
            <p className="text-[11px] text-slate-500">Elige la cuenta que realmente financia u origina el inmueble: Caja/Banco, cuenta por pagar, patrimonio o ingreso/donación. El sistema no escogerá una por ti.</p>
        </div>}
        <div className="space-y-1"><Label>Vida útil (años)</Label><input type="number" min="0" step="1" disabled={String(data.accountCode||'').startsWith('1504')} value={data.usefulLifeYears??45} onChange={e=>setData({...data,usefulLifeYears:e.target.value})} className="w-full rounded-lg border p-2 disabled:bg-slate-100"/><p className="text-[11px] text-slate-500">Terrenos: 0 / no depreciables.</p></div>
        {!estate&&<div className="space-y-1"><Label>Depreciación acumulada histórica</Label><input type="number" min="0" step="0.01" value={data.accumulatedDepreciation||0} onChange={e=>setData({...data,accumulatedDepreciation:e.target.value})} className="w-full rounded-lg border p-2 text-rose-600"/></div>}
        {!String(data.accountCode||'').startsWith('1504')&&<>
            <div className="space-y-1"><Label>Cuenta gasto depreciación</Label><select value={data.depreciationExpenseAccountCode||''} onChange={e=>pick('expense',e.target.value)} className="w-full rounded-lg border bg-white p-2"><option value="">Pendiente de parametrizar</option>{depExpense.map(a=><option key={a.id||a.number} value={a.number}>{a.number} · {a.name}</option>)}</select></div>
            <div className="space-y-1"><Label>Cuenta depreciación acumulada</Label><select value={data.accumulatedDepreciationAccountCode||''} onChange={e=>pick('accumulated',e.target.value)} className="w-full rounded-lg border bg-white p-2"><option value="">Pendiente de parametrizar</option>{depAccum.map(a=><option key={a.id||a.number} value={a.number}>{a.number} · {a.name}</option>)}</select></div>
        </>}
        <div className="md:col-span-2 flex justify-end gap-2 pt-2"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar propiedad</Button></div>
    </form></DialogContent></Dialog>;
};

const HistoryDialog=({open,onOpenChange,asset,transactions})=>{const history=asset?buildAssetHistory(asset,transactions):[];return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100vw-1rem)] max-h-[88dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Historia del Inmueble</DialogTitle><DialogDescription>{asset?.name} · {asset?.accountCode||'Sin cuenta PUC'}</DialogDescription></DialogHeader><div className="space-y-3">{history.map((entry,index)=><div key={`${entry.type}-${entry.date}-${index}`} className="rounded-xl border bg-slate-50 p-4"><div className="flex justify-between"><div><p className="text-xs font-extrabold uppercase text-blue-600">{entry.type==='depreciation'?'Depreciación':entry.type==='retirement'?'Baja':'Alta / adquisición'}</p><p className="mt-1 font-bold">{entry.date||'Fecha no disponible'}</p></div>{Number(entry.amount||0)>0&&<span className="font-mono font-bold">$ {Number(entry.amount).toLocaleString('es-CO')}</span>}</div><p className="mt-2 text-sm text-slate-600">{entry.label||entry.reason||''}</p></div>)}</div></DialogContent></Dialog>};

const DepreciationDialog=({open,onOpenChange,year,onRun})=><Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Depreciación de Inmuebles · {year}</DialogTitle><DialogDescription>Calcula la depreciación pendiente desde el registro maestro, usando vida útil, residual y cuentas PUC. Los terrenos con vida útil 0 quedan excluidos.</DialogDescription></DialogHeader><div className="flex justify-end gap-2 pt-4"><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button onClick={onRun} className="bg-blue-600 hover:bg-blue-700">Calcular y registrar</Button></div></DialogContent></Dialog>;

export default RealEstates;
