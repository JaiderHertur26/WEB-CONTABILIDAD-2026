import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { KeyRound, Plus, Edit2, History, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import { toAccountingDateInput, getAccountingYear } from '@/lib/accountingDate';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';
import {
    PATRIMONIAL_ASSET_TYPES,
    buildIntangibleHistory,
    buildPatrimonialRegistry,
    calculateAnnualAmortization,
    getIntangibleAssetAccounts,
    getIntangibleSnapshot,
    suggestPatrimonialAccounts,
} from '@/lib/patrimonialAssets';

const EMPTY = currentDate => ({
    assetType: PATRIMONIAL_ASSET_TYPES.INTANGIBLE,
    intangibleKind: 'software',
    acquisitionDate: currentDate,
    date: currentDate,
    name: '',
    provider: '',
    licenseReference: '',
    expiryDate: '',
    value: '',
    residualValue: 0,
    usefulLifeType: 'finite',
    usefulLifeYears: 3,
    amortizationMethod: 'linea_recta',
    accountCode: '',
    accountName: '',
    recognitionAccountCode: '',
    recognitionAccountName: '',
    amortizationExpenseAccountCode: '',
    amortizationExpenseAccountName: '',
    accumulatedAmortizationAccountCode: '',
    accumulatedAmortizationAccountName: '',
    accumulatedAmortization: 0,
    status: 'Activo',
    notes: '',
});

const IntangibleAssets = () => {
    const { activeCompany } = useCompany();
    const { canAdd, canEdit, isReadOnly, isConsolidatedReadOnly } = usePermission();
    const [assets, saveAssets] = useCompanyData('fixedAssets');
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts, saveAccounts] = useCompanyData('accounts');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    const { toast } = useToast();

    const currentDate = toAccountingDateInput(new Date());
    const currentYear = getAccountingYear(currentDate);
    const registry = useMemo(() => buildPatrimonialRegistry(assets || [], []), [assets]);
    const intangibleAssets = useMemo(
        () => registry.filter(asset => asset.assetType === PATRIMONIAL_ASSET_TYPES.INTANGIBLE),
        [registry]
    );
    const intangibleAccounts = useMemo(() => getIntangibleAssetAccounts(accounts || []), [accounts]);

    const [searchTerm, setSearchTerm] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [historyAsset, setHistoryAsset] = useState(null);
    const [editingAsset, setEditingAsset] = useState(null);
    const [amortizationDialogOpen, setAmortizationDialogOpen] = useState(false);
    const [pucSetupDialogOpen, setPucSetupDialogOpen] = useState(false);

    const amortizationPucTemplate = [
        { number: '1698', name: 'DEPRECIACIÓN Y/O AMORTIZACIÓN ACUMULADA' },
        { number: '169840', name: 'LICENCIAS' },
        { number: '16984001', name: 'AMORTIZACIÓN ACUMULADA LICENCIAS Y SOFTWARE' },
        { number: '5165', name: 'AMORTIZACIONES' },
        { number: '516510', name: 'INTANGIBLES' },
        { number: '51651001', name: 'AMORTIZACIÓN DE INTANGIBLES' },
    ];
    const missingAmortizationPuc = amortizationPucTemplate.filter(template =>
        !(accounts || []).some(account => String(account.number) === template.number)
    );

    const handlePrepareAmortizationPuc = async () => {
        if (!canAdd || missingAmortizationPuc.length === 0) {
            setPucSetupDialogOpen(false);
            return;
        }
        const additions = missingAmortizationPuc.map(item => ({
            ...item,
            id: crypto.randomUUID(),
        }));
        await saveAccounts(
            [...(accounts || []), ...additions].sort((a, b) =>
                String(a.number || '').localeCompare(String(b.number || ''))
            )
        );
        toast({
            title: 'PUC de amortización preparado',
            description: `Se agregaron ${additions.length} cuenta(s) faltante(s). No se creó ningún asiento ni se modificó ningún saldo.`
        });
        setPucSetupDialogOpen(false);
    };

    const filteredAssets = intangibleAssets.filter(asset => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return true;
        return [asset.name, asset.provider, asset.accountCode, asset.accountName, asset.licenseReference]
            .some(value => String(value || '').toLowerCase().includes(q));
    });

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const saveIntoRegistry = nextIntangibles => {
        const otherAssets = registry.filter(asset => asset.assetType !== PATRIMONIAL_ASSET_TYPES.INTANGIBLE);
        return saveAssets([...otherAssets, ...nextIntangibles]);
    };
    const handleSave = async data => {
        if (editingAsset ? !canEdit : !canAdd) return;

        const value = Number(data.value || 0);
        const residual = Number(data.residualValue || 0);
        if (!data.accountCode) {
            toast({ variant: 'destructive', title: 'Cuenta PUC requerida', description: 'Selecciona la cuenta del intangible en el Plan de Cuentas.' });
            return;
        }
        if (!Number.isFinite(value) || value < 0 || residual < 0 || residual > value) {
            toast({ variant: 'destructive', title: 'Valores inválidos', description: 'Revisa costo y valor residual.' });
            return;
        }
        if (data.usefulLifeType === 'finite' && Number(data.usefulLifeYears || 0) <= 0) {
            toast({ variant: 'destructive', title: 'Vida útil requerida', description: 'Un intangible de vida finita debe tener una vida útil mayor que cero.' });
            return;
        }

        const acquisitionDate = toAccountingDateInput(data.acquisitionDate || data.date) || currentDate;
        const prior = editingAsset || null;
        const recognitionAccount = !prior && value > 0
            ? (accounts || []).find(account => String(account.number) === String(data.recognitionAccountCode || ''))
            : null;
        if (!prior && value > 0 && !recognitionAccount) {
            toast({
                variant: 'destructive',
                title: 'Contrapartida requerida',
                description: 'Selecciona la cuenta que explica el reconocimiento inicial del intangible: Caja/Banco, cuenta por pagar, patrimonio o ingreso/donación.'
            });
            return;
        }
        if (recognitionAccount && String(recognitionAccount.number) === String(data.accountCode)) {
            toast({ variant: 'destructive', title: 'Contrapartida inválida', description: 'La cuenta del intangible y su contrapartida no pueden ser la misma.' });
            return;
        }

        const normalized = {
            ...data,
            assetType: PATRIMONIAL_ASSET_TYPES.INTANGIBLE,
            acquisitionDate,
            date: acquisitionDate,
            value,
            residualValue: residual,
            usefulLifeYears: data.usefulLifeType === 'indefinite' ? 0 : Number(data.usefulLifeYears || 0),
            accumulatedAmortization: Number(data.accumulatedAmortization || 0),
            recognitionAccountCode: prior?.recognitionAccountCode || recognitionAccount?.number || data.recognitionAccountCode || '',
            recognitionAccountName: prior?.recognitionAccountName || recognitionAccount?.name || data.recognitionAccountName || '',
            lifecycleVersion: 3,
            company_id: activeCompany?.id,
            companyId: activeCompany?.id,
        };

        let next;
        if (prior) {
            const protectedHistory =
                Number(prior.accumulatedAmortization || 0) > 0 ||
                Boolean(prior.transactionId) ||
                (Array.isArray(prior.amortizationHistory) && prior.amortizationHistory.length > 0);

            if (protectedHistory) {
                const changedBase =
                    Number(prior.value || 0) !== value ||
                    toAccountingDateInput(prior.acquisitionDate || prior.date) !== acquisitionDate ||
                    (prior.accountCode && String(prior.accountCode) !== String(data.accountCode));
                if (changedBase) {
                    toast({
                        variant: 'destructive',
                        title: 'Historia contable protegida',
                        description: 'Costo, fecha de alta y una cuenta PUC ya utilizada no se cambian directamente cuando existe amortización o transacción de origen.'
                    });
                    return;
                }
            }
            next = intangibleAssets.map(asset => asset.id === prior.id ? { ...asset, ...normalized } : asset);
            toast({ title: 'Intangible actualizado' });
        } else {
            const assetId = `intangible-${Date.now()}`;
            const newAsset = {
                ...normalized,
                id: assetId,
                sourceType: 'manual',
                accumulatedAmortization: Number(normalized.accumulatedAmortization || 0),
                netBookValue: Math.max(0, value - Number(normalized.accumulatedAmortization || 0)),
            };

            if (value > 0) {
                const lockReason = periodLockReason(acquisitionDate);
                if (lockReason) {
                    toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
                    return;
                }
                const year = getAccountingYear(acquisitionDate).toString();
                const voucherNumber = (transactions || [])
                    .filter(t => getAccountingYear(t.date).toString() === year && (t.type === 'transfer' || t.voucherPrefix === 'T'))
                    .reduce((max, t) => Math.max(max, Number(t.voucherNumber) || 0), 0) + 1;
                const transactionId = `txn-intangible-${assetId}`;
                newAsset.transactionId = transactionId;
                await saveTransactions([...(transactions || []), {
                    id: transactionId,
                    date: acquisitionDate,
                    type: 'transfer',
                    voucherPrefix: 'T',
                    voucherNumber,
                    description: `Registro Inicial de Intangible: ${newAsset.name}`,
                    amount: value,
                    category: recognitionAccount.name,
                    debitAccount: { code: newAsset.accountCode, name: newAsset.accountName },
                    creditAccount: { code: recognitionAccount.number, name: recognitionAccount.name },
                    isInternalTransfer: false,
                    isInitialStock: true,
                    isFixedAsset: true,
                    isPatrimonialAsset: true,
                    patrimonialAssetType: PATRIMONIAL_ASSET_TYPES.INTANGIBLE,
                    fixedAssetId: assetId,
                    company_id: activeCompany?.id,
                    companyId: activeCompany?.id,
                }]);
            }

            next = [...intangibleAssets, newAsset];
            toast({ title: 'Intangible registrado', description: 'El activo quedó vinculado a su reconocimiento contable y conservará su historia de amortización.' });
        }

        await saveIntoRegistry(next);
        setDialogOpen(false);
        setEditingAsset(null);
    };

    const getNextAdjustmentVoucher = dateStr => {
        const year = getAccountingYear(dateStr).toString();
        return (transactions || [])
            .filter(t => getAccountingYear(t.date).toString() === year && (t.type === 'adjustment' || t.voucherPrefix === 'A'))
            .reduce((max, t) => Math.max(max, Number(t.voucherNumber) || 0), 0) + 1;
    };

    const handleRunAmortization = async () => {
        if (!canEdit) return;
        const targetYear = currentYear - 1;
        const dateStr = `${targetYear}-12-31`;
        const lockReason = periodLockReason(dateStr);
        if (lockReason) {
            toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
            return;
        }

        const eligible = intangibleAssets.filter(asset => {
            if (asset.usefulLifeType === 'indefinite') return false;
            const acquired = toAccountingDateInput(asset.acquisitionDate || asset.date);
            const retired = toAccountingDateInput(asset.retiredAt);
            const years = Array.isArray(asset.amortizedYears) ? asset.amortizedYears.map(String) : [];
            return acquired && acquired <= dateStr &&
                (!retired || retired > dateStr) &&
                asset.status !== 'Dado de Baja' &&
                !years.includes(String(targetYear));
        });

        const missing = eligible.filter(asset => {
            const suggested = suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.INTANGIBLE, { number: asset.accountCode }, accounts || []);
            return !(asset.amortizationExpenseAccountCode || suggested.expense?.number) ||
                !(asset.accumulatedAmortizationAccountCode || suggested.accumulated?.number);
        });
        if (missing.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Plan de Cuentas incompleto para amortizar',
                description: `Hay ${missing.length} intangible(s) sin cuenta de gasto de amortización y/o amortización acumulada. Créelas en Plan de Cuentas y asígnalas antes de ejecutar.`
            });
            setAmortizationDialogOpen(false);
            return;
        }
        const groups = new Map();
        eligible.forEach(asset => {
            const annual = calculateAnnualAmortization(asset);
            const historical = Number(asset.accumulatedAmortization || 0);
            const remaining = Math.max(0, Number(asset.value || 0) - Number(asset.residualValue || 0) - historical);
            if (annual <= 0 || remaining <= 0) return;

            const acquired = toAccountingDateInput(asset.acquisitionDate || asset.date);
            const acquiredYear = Number(acquired.slice(0, 4));
            const acquiredMonth = Number(acquired.slice(5, 7));
            const factor = acquiredYear === targetYear ? Math.max(1, 13 - acquiredMonth) / 12 : 1;
            const amount = Math.min(remaining, annual * factor);
            if (amount <= 0) return;

            const suggested = suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.INTANGIBLE, { number: asset.accountCode }, accounts || []);
            const expense = {
                code: asset.amortizationExpenseAccountCode || suggested.expense?.number,
                name: asset.amortizationExpenseAccountName || suggested.expense?.name,
            };
            const accumulated = {
                code: asset.accumulatedAmortizationAccountCode || suggested.accumulated?.number,
                name: asset.accumulatedAmortizationAccountName || suggested.accumulated?.name,
            };
            const key = `${expense.code}|${accumulated.code}`;
            if (!groups.has(key)) groups.set(key, { expense, accumulated, entries: [] });
            groups.get(key).entries.push({ assetId: asset.id, name: asset.name, amount, year: targetYear, date: dateStr });
        });

        if (groups.size === 0) {
            toast({ title: 'Sin amortización pendiente', description: `No hay intangibles pendientes de amortizar para ${targetYear}.` });
            setAmortizationDialogOpen(false);
            return;
        }

        const firstVoucher = getNextAdjustmentVoucher(dateStr);
        const createdTransactions = [];
        const byAsset = new Map();

        [...groups.values()].forEach((group, index) => {
            const voucherNumber = firstVoucher + index;
            const transactionId = `${Date.now()}-amort-${index}`;
            const amount = group.entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
            createdTransactions.push({
                id: transactionId,
                type: 'adjustment',
                voucherPrefix: 'A',
                voucherNumber,
                date: dateStr,
                description: `Amortización de intangibles - Vigencia ${targetYear}`,
                amount,
                category: 'Amortización acumulada de intangibles',
                debitAccount: group.expense,
                creditAccount: group.accumulated,
                isAssetAmortization: true,
                amortizationYear: String(targetYear),
                intangibleAssetEntries: group.entries,
                company_id: activeCompany?.id,
                companyId: activeCompany?.id,
            });
            group.entries.forEach(entry => byAsset.set(String(entry.assetId), { ...entry, transactionId, voucherNumber }));
        });

        const updated = intangibleAssets.map(asset => {
            const entry = byAsset.get(String(asset.id));
            if (!entry) return asset;
            const accumulated = Number(asset.accumulatedAmortization || 0) + Number(entry.amount || 0);
            const priorHistory = buildIntangibleHistory(asset, transactions).filter(item => item.type === 'amortization');
            const years = Array.isArray(asset.amortizedYears) ? asset.amortizedYears.map(String) : [];
            return {
                ...asset,
                accumulatedAmortization: accumulated,
                netBookValue: Math.max(0, Number(asset.value || 0) - accumulated),
                amortizedYear: String(targetYear),
                amortizedYears: [...new Set([...years, String(targetYear)])],
                amortizationHistory: [...priorHistory, entry],
                lifecycleVersion: 3,
            };
        });

        await saveTransactions([...(transactions || []), ...createdTransactions]);
        await saveIntoRegistry(updated);
        toast({ title: 'Amortización registrada', description: `Se contabilizó la amortización pendiente de ${targetYear} con trazabilidad individual.` });
        setAmortizationDialogOpen(false);
    };

    return (
        <>
            <Helmet><title>Activos Intangibles - HERTUR Contabilidad</title></Helmet>
            <div className="space-y-6">
                <ProfessionalModuleHero
                    eyebrow="Patrimonio intangible"
                    title="Activos Intangibles"
                    subtitle="Software, licencias y derechos con costo histórico, vida útil, vencimiento, amortización y valor en libros."
                    activeCompany={activeCompany}
                    icon={KeyRound}
                    accent="indigo"
                    badges={isReadOnly ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">{isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}</span> : null}
                    metrics={[
                        { label: 'Registrados', value: filteredAssets.length },
                        { label: 'Vigentes', value: filteredAssets.filter(asset => getIntangibleSnapshot(asset, currentDate, transactions).present).length },
                        { label: 'Pendientes PUC amort.', value: filteredAssets.filter(asset => asset.usefulLifeType !== 'indefinite' && (!asset.amortizationExpenseAccountCode || !asset.accumulatedAmortizationAccountCode)).length },
                    ]}
                    actions={
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {canAdd && missingAmortizationPuc.length > 0 && <Button variant="outline" onClick={() => setPucSetupDialogOpen(true)} className="h-10 border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20 hover:text-white"><AlertTriangle className="mr-2 h-4 w-4" />Preparar PUC</Button>}
                            {canEdit && <Button variant="outline" onClick={() => setAmortizationDialogOpen(true)} className="h-10 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">Amortizar {currentYear - 1}</Button>}
                            {canAdd && <Button onClick={() => { setEditingAsset(null); setDialogOpen(true); }} className="h-10 bg-indigo-500 text-white hover:bg-indigo-400"><Plus className="mr-2 h-4 w-4" />Nuevo intangible</Button>}
                        </div>
                    }
                />
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <div className="relative">
                        <Label>Buscar intangible</Label>
                        <Search className="absolute left-3 top-10 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Software, proveedor, licencia o cuenta PUC..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100/60" />
                    </div>
                </motion.div>

                {filteredAssets.length === 0 ? (
                    <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                        <KeyRound className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                        <p className="text-slate-500">No hay activos intangibles registrados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white shadow-sm" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <table className="w-full min-w-[1260px] text-sm">
                            <thead className="bg-slate-950 text-slate-200">
                                <tr>{['Activo', 'Tipo', 'Alta', 'Cuenta PUC', 'Proveedor', 'Vencimiento', 'Costo', 'Amortización', 'Valor libros', 'Estado', 'Acciones'].map(label => <th key={label} className="p-3 text-left font-semibold">{label}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredAssets.map(asset => {
                                    const snapshot = getIntangibleSnapshot(asset, currentDate, transactions);
                                    const expired = asset.expiryDate && asset.expiryDate < currentDate;
                                    return (
                                        <tr key={asset.id} className="hover:bg-slate-50">
                                            <td className="p-3 font-semibold text-slate-900">{asset.name}</td>
                                            <td className="p-3 capitalize">{String(asset.intangibleKind || 'otro').replace('_', ' ')}</td>
                                            <td className="p-3 whitespace-nowrap">{asset.acquisitionDate || asset.date}</td>
                                            <td className="p-3"><div className="font-mono text-xs font-bold">{asset.accountCode || 'Pendiente'}</div><div className="max-w-52 truncate text-[11px] text-slate-500">{asset.accountName || ''}</div></td>
                                            <td className="p-3">{asset.provider || '—'}</td>
                                            <td className="p-3 whitespace-nowrap">{asset.expiryDate || (asset.usefulLifeType === 'indefinite' ? 'Indefinida' : '—')}{expired && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">VENCIDA</span>}</td>
                                            <td className="p-3 font-mono">$ {snapshot.originalValue.toLocaleString('es-CO')}</td>
                                            <td className="p-3 font-mono text-rose-600">$ {snapshot.accumulatedAmortization.toLocaleString('es-CO')}</td>
                                            <td className="p-3 font-mono font-bold text-indigo-700">$ {snapshot.netBookValue.toLocaleString('es-CO')}</td>
                                            <td className="p-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">{asset.status || 'Activo'}</span></td>
                                            <td className="p-3"><div className="flex gap-1">
                                                <Button size="icon" variant="ghost" onClick={() => setHistoryAsset(asset)} title="Historia"><History className="h-4 w-4 text-indigo-600" /></Button>
                                                {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingAsset(asset); setDialogOpen(true); }} title="Editar"><Edit2 className="h-4 w-4" /></Button>}
                                            </div></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <IntangibleDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                asset={editingAsset}
                accounts={accounts || []}
                intangibleAccounts={intangibleAccounts}
                currentDate={currentDate}
                onSave={handleSave}
            />
            <HistoryDialog open={Boolean(historyAsset)} onOpenChange={open => { if (!open) setHistoryAsset(null); }} asset={historyAsset} transactions={transactions || []} />
            <AmortizationDialog open={amortizationDialogOpen} onOpenChange={setAmortizationDialogOpen} year={currentYear - 1} onRun={handleRunAmortization} />
            <PucSetupDialog open={pucSetupDialogOpen} onOpenChange={setPucSetupDialogOpen} missing={missingAmortizationPuc} onConfirm={handlePrepareAmortizationPuc} />
        </>
    );
};
const IntangibleDialog = ({ open, onOpenChange, asset, accounts, intangibleAccounts, currentDate, onSave }) => {
    const [data, setData] = useState(EMPTY(currentDate));

    React.useEffect(() => {
        if (!open) return;
        setData(asset ? {
            ...EMPTY(currentDate),
            ...asset,
            acquisitionDate: toAccountingDateInput(asset.acquisitionDate || asset.date) || currentDate,
        } : EMPTY(currentDate));
    }, [asset, open, currentDate]);

    const leafByPrefix = prefix => {
        const candidates = (accounts || []).filter(account => String(account.number || '').startsWith(prefix));
        return candidates.filter(account => {
            const code = String(account.number || '');
            return !candidates.some(other => {
                const otherCode = String(other.number || '');
                return otherCode !== code && otherCode.startsWith(code);
            });
        });
    };
    const accumulatedAccounts = [...leafByPrefix('1698'), ...leafByPrefix('169')].filter((account, index, arr) => arr.findIndex(x => x.number === account.number) === index);
    const expenseAccounts = [...leafByPrefix('5165'), ...leafByPrefix('5265')].filter((account, index, arr) => arr.findIndex(x => x.number === account.number) === index);
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

    const handleAccount = code => {
        const selected = intangibleAccounts.find(account => String(account.number) === String(code));
        const suggested = suggestPatrimonialAccounts(PATRIMONIAL_ASSET_TYPES.INTANGIBLE, selected, accounts);
        setData(prev => ({
            ...prev,
            accountCode: selected?.number || '',
            accountName: selected?.name || '',
            accumulatedAmortizationAccountCode: suggested.accumulated?.number || prev.accumulatedAmortizationAccountCode || '',
            accumulatedAmortizationAccountName: suggested.accumulated?.name || prev.accumulatedAmortizationAccountName || '',
            amortizationExpenseAccountCode: suggested.expense?.number || prev.amortizationExpenseAccountCode || '',
            amortizationExpenseAccountName: suggested.expense?.name || prev.amortizationExpenseAccountName || '',
        }));
    };

    const selectAccount = (prefix, code) => {
        const pool = prefix === 'expense' ? expenseAccounts : accumulatedAccounts;
        const selected = pool.find(account => String(account.number) === String(code));
        setData(prev => prefix === 'expense'
            ? { ...prev, amortizationExpenseAccountCode: selected?.number || '', amortizationExpenseAccountName: selected?.name || '' }
            : { ...prev, accumulatedAmortizationAccountCode: selected?.number || '', accumulatedAmortizationAccountName: selected?.name || '' }
        );
    };
    const selectRecognitionAccount = code => {
        const selected = counterpartAccounts.find(account => String(account.number) === String(code));
        setData(prev => ({
            ...prev,
            recognitionAccountCode: selected?.number || '',
            recognitionAccountName: selected?.name || '',
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{asset ? 'Editar' : 'Nuevo'} Activo Intangible</DialogTitle>
                    <DialogDescription>Una sola identidad contable desde la adquisición hasta el vencimiento o baja. La amortización queda vinculada al PUC.</DialogDescription>
                </DialogHeader>
                <form onSubmit={e => { e.preventDefault(); onSave(data); }} className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
                    <div className="space-y-1"><Label>Tipo</Label><select value={data.intangibleKind || 'software'} onChange={e => setData({...data, intangibleKind:e.target.value})} className="w-full rounded-lg border p-2"><option value="software">Software</option><option value="licencia">Licencia</option><option value="derecho">Derecho</option><option value="dominio">Dominio / activo digital</option><option value="otro">Otro intangible</option></select></div>
                    <div className="space-y-1"><Label>Fecha de adquisición / activación</Label><input type="date" required value={data.acquisitionDate || ''} onChange={e=>setData({...data, acquisitionDate:e.target.value, date:e.target.value})} className="w-full rounded-lg border p-2" /></div>
                    <div className="space-y-1 md:col-span-2"><Label>Nombre del intangible</Label><input required value={data.name || ''} onChange={e=>setData({...data,name:e.target.value})} placeholder="Ej: Licencia sistema contable" className="w-full rounded-lg border p-2" /></div>
                    <div className="space-y-1 md:col-span-2"><Label>Cuenta del Intangible (PUC) *</Label><select required value={data.accountCode || ''} onChange={e=>handleAccount(e.target.value)} className="w-full rounded-lg border bg-white p-2"><option value="">Seleccionar cuenta...</option>{intangibleAccounts.map(account=><option key={account.id||account.number} value={account.number}>{account.number} · {account.name}</option>)}</select></div>
                    <div className="space-y-1"><Label>Proveedor / titular</Label><input value={data.provider || ''} onChange={e=>setData({...data,provider:e.target.value})} className="w-full rounded-lg border p-2" /></div>
                    <div className="space-y-1"><Label>Referencia de licencia / contrato</Label><input value={data.licenseReference || ''} onChange={e=>setData({...data,licenseReference:e.target.value})} className="w-full rounded-lg border p-2" placeholder="Referencia, no contraseña" /></div>
                    <div className="space-y-1"><Label>Costo histórico</Label><input type="number" min="0" step="0.01" required value={data.value ?? ''} onChange={e=>setData({...data,value:e.target.value})} className="w-full rounded-lg border p-2" /></div>
                    <div className="space-y-1"><Label>Valor residual</Label><input type="number" min="0" step="0.01" value={data.residualValue || 0} onChange={e=>setData({...data,residualValue:e.target.value})} className="w-full rounded-lg border p-2" /></div>
                    {!asset && Number(data.value || 0) > 0 && <div className="space-y-1 md:col-span-2">
                        <Label>Contrapartida del reconocimiento inicial *</Label>
                        <select required value={data.recognitionAccountCode || ''} onChange={e=>selectRecognitionAccount(e.target.value)} className="w-full rounded-lg border bg-white p-2">
                            <option value="">Seleccionar cuenta...</option>
                            {counterpartAccounts.filter(account=>String(account.number)!==String(data.accountCode||'')).map(account=><option key={account.id||account.number} value={account.number}>{account.number} · {account.name}</option>)}
                        </select>
                        <p className="text-[11px] text-slate-500">Elige la cuenta real que origina el intangible: Caja/Banco, cuenta por pagar, patrimonio o ingreso/donación. No se seleccionará automáticamente.</p>
                    </div>}
                    <div className="space-y-1"><Label>Vida útil</Label><select value={data.usefulLifeType || 'finite'} onChange={e=>setData({...data,usefulLifeType:e.target.value})} className="w-full rounded-lg border p-2"><option value="finite">Finita</option><option value="indefinite">Indefinida / no amortizable por ahora</option></select></div>
                    {data.usefulLifeType !== 'indefinite' && <div className="space-y-1"><Label>Vida útil (años)</Label><input type="number" min="1" step="1" required value={data.usefulLifeYears || ''} onChange={e=>setData({...data,usefulLifeYears:e.target.value})} className="w-full rounded-lg border p-2" /></div>}
                    <div className="space-y-1"><Label>Fecha de vencimiento (si aplica)</Label><input type="date" value={data.expiryDate || ''} onChange={e=>setData({...data,expiryDate:e.target.value})} className="w-full rounded-lg border p-2" /></div>
                    <div className="space-y-1"><Label>Método</Label><select value={data.amortizationMethod || 'linea_recta'} onChange={e=>setData({...data,amortizationMethod:e.target.value})} className="w-full rounded-lg border p-2"><option value="linea_recta">Línea recta</option></select></div>
                    {data.usefulLifeType !== 'indefinite' && <>
                        <div className="space-y-1"><Label>Cuenta gasto de amortización</Label><select value={data.amortizationExpenseAccountCode || ''} onChange={e=>selectAccount('expense',e.target.value)} className="w-full rounded-lg border bg-white p-2"><option value="">Pendiente de parametrizar</option>{expenseAccounts.map(account=><option key={account.id||account.number} value={account.number}>{account.number} · {account.name}</option>)}</select></div>
                        <div className="space-y-1"><Label>Cuenta amortización acumulada</Label><select value={data.accumulatedAmortizationAccountCode || ''} onChange={e=>selectAccount('accumulated',e.target.value)} className="w-full rounded-lg border bg-white p-2"><option value="">Pendiente de parametrizar</option>{accumulatedAccounts.map(account=><option key={account.id||account.number} value={account.number}>{account.number} · {account.name}</option>)}</select></div>
                        {(expenseAccounts.length === 0 || accumulatedAccounts.length === 0) && <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>El Plan de Cuentas todavía no tiene todas las cuentas de amortización. El intangible puede registrarse, pero la amortización automática permanecerá bloqueada hasta parametrizarlas.</p></div></div>}
                    </>}
                    {!asset && <div className="space-y-1"><Label>Amortización acumulada histórica</Label><input type="number" min="0" step="0.01" value={data.accumulatedAmortization || 0} onChange={e=>setData({...data,accumulatedAmortization:e.target.value})} className="w-full rounded-lg border p-2 text-rose-600" /></div>}
                    <div className="md:col-span-2 space-y-1"><Label>Observaciones</Label><textarea rows={3} value={data.notes || ''} onChange={e=>setData({...data,notes:e.target.value})} className="w-full rounded-lg border p-2" /></div>
                    <div className="md:col-span-2 flex justify-end gap-2 pt-2"><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">Guardar intangible</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const HistoryDialog = ({ open, onOpenChange, asset, transactions }) => {
    const history = asset ? buildIntangibleHistory(asset, transactions) : [];
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100vw-1rem)] max-h-[88dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Historia del Intangible</DialogTitle><DialogDescription>{asset?.name} · {asset?.accountCode || 'Sin cuenta PUC'}</DialogDescription></DialogHeader><div className="space-y-3">{history.map((entry,index)=><div key={`${entry.type}-${entry.date}-${index}`} className="rounded-xl border bg-slate-50 p-4"><div className="flex justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-indigo-600">{entry.type === 'amortization' ? 'Amortización' : entry.type === 'retirement' ? 'Baja' : 'Alta / adquisición'}</p><p className="mt-1 font-bold">{entry.date || 'Fecha no disponible'}</p></div>{Number(entry.amount||0)>0&&<span className="font-mono font-bold">$ {Number(entry.amount).toLocaleString('es-CO')}</span>}</div><p className="mt-2 text-sm text-slate-600">{entry.label||entry.reason||''}</p>{entry.voucherNumber!=null&&<p className="mt-1 text-xs text-slate-500">Comprobante A-{String(entry.voucherNumber).padStart(4,'0')}</p>}</div>)}</div></DialogContent></Dialog>;
};

const AmortizationDialog = ({ open, onOpenChange, year, onRun }) => (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Amortización de intangibles · {year}</DialogTitle><DialogDescription>Calcula la amortización pendiente según costo, residual, vida útil y cuentas PUC. No afecta Caja ni Bancos.</DialogDescription></DialogHeader><div className="flex justify-end gap-2 pt-4"><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button onClick={onRun} className="bg-indigo-600 hover:bg-indigo-700">Calcular y registrar</Button></div></DialogContent></Dialog>
);

const PucSetupDialog = ({ open, onOpenChange, missing, onConfirm }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Preparar PUC para amortización</DialogTitle>
                <DialogDescription>
                    Se agregarán únicamente las cuentas faltantes para amortización de licencias y software. Esta acción no crea asientos, no cambia saldos y no modifica cuentas existentes.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {(missing || []).map(account => (
                    <div key={account.number} className="flex gap-3 text-sm">
                        <span className="font-mono font-bold text-indigo-700">{account.number}</span>
                        <span className="text-slate-700">{account.name}</span>
                    </div>
                ))}
                {(missing || []).length === 0 && <p className="text-sm text-emerald-700">El PUC ya está preparado.</p>}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Jerarquía utilizada: 1698 / 169840 para amortización acumulada de licencias y 5165 / 516510 para gasto de amortización de intangibles.
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={onConfirm} disabled={!missing?.length} className="bg-indigo-600 hover:bg-indigo-700">Crear cuentas faltantes</Button>
            </div>
        </DialogContent>
    </Dialog>
);

export default IntangibleAssets;
