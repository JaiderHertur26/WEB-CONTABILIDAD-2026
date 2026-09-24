import { getAccountingYear } from '@/lib/accountingDate';
import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Building, Search, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermission } from '@/hooks/usePermission';
import { getAccountingPeriodLockReason } from '@/lib/accountingPeriod';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';

const RealEstates = () => {
    const { canEdit, canDelete, canAdd, isReadOnly, isConsolidatedReadOnly } = usePermission();
    const { activeCompany } = useCompany();
    const [realEstates, saveRealEstates] = useCompanyData('realEstates');
    
    // Importamos transacciones y cuentas para asegurar la Partida Doble
    const [transactions, saveTransactions] = useCompanyData('transactions');
    const [accounts] = useCompanyData('accounts');
    const [fiscalYears] = useCompanyData('fiscal_years');
    const [monthlyClosings] = useCompanyData('monthly_closings');
    
    const [dialogOpen, setDialogOpen] = useState(false);
    const [depreciationDialogOpen, setDepreciationDialogOpen] = useState(false);
    const [depreciationYear, setDepreciationYear] = useState(new Date().getFullYear().toString());
    const [editingEstate, setEditingEstate] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    // --- AUTO-REINTEGRAR PROPIEDAD SI SE ELIMINA EL COMPROBANTE ---
    useEffect(() => {
        if (!transactions || !realEstates) return;
        
        const estatesToRestore = realEstates.filter(e => 
            e.status === 'Dado de Baja' && 
            e.retireTransactionId && 
            !transactions.some(t => String(t.id) === String(e.retireTransactionId))
        );

        if (estatesToRestore.length > 0) {
            const updatedEstates = realEstates.map(e => {
                if (estatesToRestore.some(res => res.id === e.id)) {
                    return {
                        ...e,
                        status: 'Activo',
                        retireTransactionId: null,
                        notes: (e.notes || '').replace(/ \[Dado de baja: .*?\]/g, '').trim()
                    };
                }
                return e;
            });
            saveRealEstates(updatedEstates);
            toast({ title: "Propiedad Reintegrada", description: "Se detectó la eliminación del comprobante contable y la propiedad regresó al inventario." });
        }
    }, [transactions, realEstates]);

    // Calculador automático de consecutivo por clase de comprobante.
    const getNextVoucherNumber = (type, dateStr) => {
        if (!transactions) return 1;
        const year = getAccountingYear(dateStr).toString();

        const typeTransactions = transactions.filter(t => {
            const tYear = getAccountingYear(t.date).toString();
            if (tYear !== year) return false;

            if (type === 'adjustment') {
                return t.type === 'adjustment' || t.voucherPrefix === 'A';
            }
            if (type === 'transfer') {
                return t.type === 'transfer' || t.voucherPrefix === 'T' ||
                    (t.isInternalTransfer && t.type !== 'adjustment');
            }
            return t.type === type;
        });

        const maxNum = typeTransactions.reduce((max, t) => {
            const value = Number(t.voucherNumber) || 0;
            return value > max ? value : max;
        }, 0);

        return maxNum + 1;
    };

    const periodLockReason = date =>
        getAccountingPeriodLockReason(date, { fiscalYears, monthlyClosings });

    const handleSaveEstate = (estateData) => {
        if (editingEstate ? !canEdit : !canAdd) return;
        if (!canEdit && editingEstate) return;

        const newValue = Number(estateData.value || 0);
        if (!Number.isFinite(newValue) || newValue < 0) {
            toast({ variant:'destructive', title:'Valor inválido', description:'El valor de la propiedad no puede ser negativo.' });
            return;
        }

        const newAccumulatedDepreciation = Number(estateData.accumulatedDepreciation || 0);
        if (
            !Number.isFinite(newAccumulatedDepreciation) ||
            newAccumulatedDepreciation < 0 ||
            newAccumulatedDepreciation > newValue
        ) {
            toast({ variant:'destructive', title:'Depreciación inválida', description:'La depreciación acumulada debe estar entre $0 y el valor original de la propiedad.' });
            return;
        }

        const depreciationRate = estateData.depreciationRate === '' || estateData.depreciationRate == null
            ? 2.22
            : Number(estateData.depreciationRate);
        if (!Number.isFinite(depreciationRate) || depreciationRate <= 0 || depreciationRate > 100) {
            toast({ variant:'destructive', title:'Tasa inválida', description:'La tasa anual de depreciación debe ser mayor que 0% y no superar 100%.' });
            return;
        }

        const normalizedEstateData = {
            ...estateData,
            value: newValue,
            accumulatedDepreciation: newAccumulatedDepreciation,
            depreciationRate
        };

        let updatedEstates;
        if (editingEstate) {
            const linkedTransaction = (transactions || []).find(t => t.estateId === editingEstate.id);
            const sensitiveChanged =
                Number(editingEstate.value || 0) !== newValue ||
                String(editingEstate.date || '') !== String(estateData.date || '');
            const historicalDepreciation = Number(editingEstate.accumulatedDepreciation || 0);
            const depreciationChanged = historicalDepreciation !== newAccumulatedDepreciation;

            if (depreciationChanged) {
                toast({ variant:'destructive', title:'Depreciación protegida', description:'La depreciación acumulada de una propiedad existente no se edita manualmente. Registre un ajuste contable o use el proceso anual para conservar la trazabilidad.' });
                return;
            }

            if (sensitiveChanged && historicalDepreciation > 0) {
                toast({ variant:'destructive', title:'Valor histórico protegido', description:'No puede cambiarse valor o fecha porque la propiedad ya tiene depreciación acumulada.' });
                return;
            }
            const originalTransactionLock = linkedTransaction ? periodLockReason(linkedTransaction.date) : periodLockReason(editingEstate.date);
            if (sensitiveChanged && (linkedTransaction?.isLocked || originalTransactionLock)) {
                toast({ variant:'destructive', title:'Comprobante protegido', description: linkedTransaction?.isLocked ? 'El registro inicial está oficializado y es inalterable.' : originalTransactionLock });
                return;
            }
            const lockReason = periodLockReason(estateData.date);
            if (sensitiveChanged && lockReason) {
                toast({ variant:'destructive', title:'Período contable cerrado', description: lockReason });
                return;
            }

            updatedEstates = (realEstates || []).map(estate =>
                estate.id === editingEstate.id ? { ...estate, ...normalizedEstateData } : estate
            );

            if (linkedTransaction && !linkedTransaction.isLocked) {
                const transactionPeriodLocked = periodLockReason(linkedTransaction.date);
                const mayUpdateAccounting = !transactionPeriodLocked;
                if (mayUpdateAccounting) {
                    const updatedTxns = (transactions || []).map(t => t.id === linkedTransaction.id ? {
                        ...t,
                        ...(sensitiveChanged ? { amount: newValue, date: normalizedEstateData.date } : {}),
                        ...(transactionPeriodLocked ? {} : { description: `Registro Inicial de Propiedad: ${normalizedEstateData.name}` })
                    } : t);
                    saveTransactions(updatedTxns);
                }
            }
            toast({ title: "Propiedad actualizada" });
        } else {
            const newId = Date.now().toString();
            if (newValue > 0) {
                const lockReason = periodLockReason(estateData.date);
                if (lockReason) {
                    toast({ variant:'destructive', title:'Período contable cerrado', description: lockReason });
                    return;
                }
            }

            updatedEstates = [...(realEstates || []), {
                ...normalizedEstateData,
                id: newId,
                status: normalizedEstateData.status || 'Activo'
            }];

            if (newValue > 0) {
                const propertyAccount = accounts?.find(a => String(a.number).startsWith('1516')) || accounts?.find(a => String(a.number).startsWith('15')) || { id: 'default-prop', name: 'Construcciones y Edificaciones', number: '151601' };
                const equityAccount = accounts?.find(a => String(a.number).startsWith('3')) || { id: 'default-equity', name: 'PATRIMONIO', number: '3' };
                const nextVoucher = getNextVoucherNumber('transfer', normalizedEstateData.date);

                saveTransactions([...(transactions || []), {
                    id: `txn-estate-${newId}`,
                    date: normalizedEstateData.date,
                    type: 'transfer',
                    voucherPrefix: 'T',
                    description: `Registro Inicial de Propiedad: ${normalizedEstateData.name}`,
                    amount: newValue,
                    category: equityAccount.name,
                    destination: 'propiedad|PROPIEDAD PLANTA Y EQUIPO',
                    voucherNumber: nextVoucher,
                    debitAccount: { code: propertyAccount.number, name: propertyAccount.name },
                    creditAccount: { code: equityAccount.number, name: equityAccount.name },
                    isPurchase: false,
                    isInternalTransfer: true,
                    isInitialStock: true,
                    isEstateInitialEntry: true,
                    estateId: newId,
                    company_id: activeCompany?.id,
                    companyId: activeCompany?.id
                }]);
            }

            toast({ title: "Propiedad creada", description: "El activo se integró a la contabilidad con trazabilidad." });
        }
        saveRealEstates(updatedEstates);
        setDialogOpen(false);
    };

    const handleDeleteEstate = (id) => {
        if (!canDelete) return;
        const target = (realEstates || []).find(estate => estate.id === id);
        if (!target) return;
        if (target.contractManaged) {
            toast({ variant: 'destructive', title: 'Propiedad protegida', description: 'Este activo fue generado por Contratos. Su eliminación debe resolverse desde el expediente contractual para conservar la trazabilidad contable.' });
            return;
        }
        if (Number(target.accumulatedDepreciation || 0) > 0) {
            toast({ variant:'destructive', title:'Propiedad con depreciación', description:'No puede eliminarse un activo que ya tiene depreciación acumulada. Debe conservarse su historia y, si corresponde, darse de baja mediante un movimiento contable.' });
            return;
        }
        const linkedTransactions = (transactions || []).filter(t => t.estateId === id);
        if (linkedTransactions.some(t => t.isLocked || periodLockReason(t.date))) {
            toast({ variant:'destructive', title:'Historia contable protegida', description:'La propiedad tiene comprobantes pertenecientes a períodos cerrados u oficializados.' });
            return;
        }

        saveRealEstates((realEstates || []).filter(estate => estate.id !== id));
        if (linkedTransactions.length > 0) {
            saveTransactions((transactions || []).filter(t => t.estateId !== id));
        }
        toast({ title: "Propiedad eliminada", description:'Sólo se permitió porque no tenía depreciación ni historia oficializada.' });
    };

    // --- DEPRECIACIÓN ANUAL DE EDIFICACIONES ---
    const handleRunDepreciation = async () => {
        if (!canEdit) return;

        const year = String(depreciationYear || '').trim();
        if (!/^\d{4}$/.test(year)) {
            toast({ variant: 'destructive', title: 'Vigencia inválida', description: 'Indique un año válido de cuatro dígitos.' });
            return;
        }

        const dateStr = `${year}-12-31`;
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (dateStr >= todayKey) {
            toast({ variant: 'destructive', title: 'Vigencia no terminada', description: 'La depreciación anual sólo puede registrarse después de finalizar la vigencia seleccionada.' });
            return;
        }

        const lockReason = periodLockReason(dateStr);
        if (lockReason) {
            toast({ variant: 'destructive', title: 'Período contable cerrado', description: lockReason });
            return;
        }

        const existingDeprTransaction = (transactions || []).find(t =>
            (t.isPropertyDepreciation && String(t.depreciationYear) === year) ||
            (
                t.description === `Depreciación Edificaciones - Vigencia ${year}` &&
                t.category === 'Depreciación Acumulada Activos Fijos'
            )
        );

        if (existingDeprTransaction) {
            toast({
                title: 'Vigencia ya depreciada',
                description: `Ya existe el comprobante ${existingDeprTransaction.voucherPrefix || 'A'}-${String(existingDeprTransaction.voucherNumber || '').padStart(4, '0')} para ${year}. No se duplicó la depreciación.`
            });
            setDepreciationDialogOpen(false);
            return;
        }

        const defaultAnnualRate = 0.0222;
        let totalDepreciationGenerated = 0;
        const breakdown = [];

        const updatedEstates = (realEstates || []).map(estate => {
            if (estate.status === 'Dado de Baja') return estate;
            if (estate.date && String(estate.date).slice(0, 10) > dateStr) return estate;

            const depreciatedYears = Array.isArray(estate.depreciatedYears)
                ? estate.depreciatedYears.map(String)
                : [];
            if (depreciatedYears.includes(year)) return estate;

            const originalValue = Math.max(0, Number(estate.value) || 0);
            const historicalDepreciation = Math.max(0, Number(estate.accumulatedDepreciation) || 0);
            const remainingDepreciable = Math.max(0, originalValue - historicalDepreciation);
            if (originalValue <= 0 || remainingDepreciable <= 0) return estate;

            const configuredRate = Number(estate.depreciationRate);
            const annualRate = Number.isFinite(configuredRate) && configuredRate > 0
                ? configuredRate / 100
                : defaultAnnualRate;
            const depreciationAmount = Math.min(remainingDepreciable, originalValue * annualRate);
            if (depreciationAmount <= 0) return estate;

            totalDepreciationGenerated += depreciationAmount;
            breakdown.push({
                estateId: estate.id,
                estateName: estate.name,
                rate: annualRate,
                amount: depreciationAmount
            });

            return {
                ...estate,
                accumulatedDepreciation: historicalDepreciation + depreciationAmount,
                depreciatedYears: [...depreciatedYears, year]
            };
        });

        if (totalDepreciationGenerated <= 0) {
            toast({
                title: 'Sin depreciación pendiente',
                description: 'No hay propiedades activas con valor pendiente de depreciar para esta vigencia.'
            });
            setDepreciationDialogOpen(false);
            return;
        }

        const nextVoucher = getNextVoucherNumber('adjustment', dateStr);
        const deprTransaction = {
            id: `${Date.now()}-depr-estate-${year}`,
            type: 'adjustment',
            voucherPrefix: 'A',
            description: `Depreciación Edificaciones - Vigencia ${year}`,
            amount: totalDepreciationGenerated,
            category: 'Depreciación Acumulada Activos Fijos',
            date: dateStr,
            isInternalTransfer: true,
            isPropertyDepreciation: true,
            depreciationYear: year,
            estateDepreciationBreakdown: breakdown,
            voucherNumber: nextVoucher,
            debitAccount: { code: '516005', name: 'GASTOS DEPRECIACION' },
            creditAccount: { code: '159205', name: 'DEPRECIACION ACUMULADA' },
            company_id: activeCompany?.id,
            companyId: activeCompany?.id
        };

        try {
            await saveRealEstates(updatedEstates);
            await saveTransactions([...(transactions || []), deprTransaction]);
            toast({
                title: 'Depreciación registrada',
                description: `Comprobante A-${String(nextVoucher).padStart(4, '0')} por ${totalDepreciationGenerated.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}. La ejecución es idempotente por vigencia.`
            });
            setDepreciationDialogOpen(false);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'No fue posible registrar la depreciación',
                description: error?.message || 'Revise el período contable y vuelva a intentarlo.'
            });
        }
    };

    const filteredEstates = (realEstates || []).filter(estate => 
        (estate.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (estate.address?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <Helmet><title>Propiedades y Oficinas - JaiderHerTur26</title></Helmet>
            <div className="space-y-6">
                <ProfessionalModuleHero
                    eyebrow="Patrimonio inmobiliario"
                    title="Propiedades y Oficinas"
                    subtitle="Controla inmuebles, oficinas, valores históricos, depreciación fiscal y estado patrimonial con trazabilidad."
                    activeCompany={activeCompany}
                    icon={Building}
                    accent="blue"
                    badges={isReadOnly ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">{isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}</span> : null}
                    metrics={[
                        { label: 'Propiedades', value: filteredEstates.length },
                        { label: 'Activas', value: filteredEstates.filter(item => item.status !== 'Dado de Baja').length },
                        { label: 'Depreciación', value: depreciationYear },
                    ]}
                    actions={
                        <>
                            {canEdit && <Button onClick={() => setDepreciationDialogOpen(true)} variant="outline" className="h-10 whitespace-nowrap rounded-xl border-white/15 bg-white/10 px-3 text-sm text-white hover:bg-white/15 hover:text-white">Depreciación</Button>}
                            {canAdd && <Button onClick={() => { setEditingEstate(null); setDialogOpen(true); }} className="h-10 whitespace-nowrap rounded-xl bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-500"><Plus className="mr-2 h-4 w-4" />Nueva propiedad</Button>}
                        </>
                    }
                />
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] sm:p-5">
                    <div className="relative"><Label>Buscar Propiedad:</Label><Search className="absolute left-3 top-10 transform -translate-y-1/2 text-slate-400 w-5 h-5" /><input type="text" placeholder="Buscar por nombre o dirección..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/60" /></div>
                </motion.div>

                {filteredEstates.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                        <Building className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500">No hay propiedades registradas.</p>
                    </motion.div>
                ) : (
                    <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]" style={{ WebkitOverflowScrolling: 'touch' }}><table className="w-full min-w-[980px] text-sm">
                        <thead className="bg-slate-950 text-slate-200">
                            <tr>
                                {['Nombre', 'Dirección', 'Fecha', 'Estado', 'Valor Original', 'Deprec. Acumulada', 'Valor Neto', 'Acciones'].map(h => 
                                    <th key={h} className="p-3 text-left font-semibold">{h}</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y">{filteredEstates.map(estate => {
                            const isRetired = estate.status === 'Dado de Baja';
                            const origVal = isRetired ? 0 : (parseFloat(estate.value) || 0);
                            const acumDepr = isRetired ? 0 : (parseFloat(estate.accumulatedDepreciation) || 0);
                            const netVal = origVal - acumDepr;
                            return (
                                <tr key={estate.id} className={`hover:bg-slate-50 ${isRetired ? 'opacity-50 bg-slate-100' : ''}`}>
                                    <td className={`p-3 font-medium ${isRetired ? 'line-through text-slate-400' : ''}`}>{estate.name}</td>
                                    <td className="p-3">{estate.address}</td>
                                    <td className="p-3">{estate.date}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${estate.status === 'Dado de Baja' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                            {estate.status || 'Activo'}
                                        </span>
                                    </td>
                                    <td className="p-3 font-mono">${origVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 font-mono text-red-600">${acumDepr.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 font-mono font-bold text-blue-600">${netVal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3"><div className="flex gap-1">
                                        {estate.contractManaged ? <span title={'Generada por contrato '+(estate.sourceContractNumber||'')} className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700"><Lock className="w-3 h-3 mr-1"/>Contrato {estate.sourceContractNumber||''}</span> : <>{canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditingEstate(estate); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}{canDelete && <Button size="icon" variant="ghost" className="hover:text-red-600" onClick={() => handleDeleteEstate(estate.id)}><Trash2 className="w-4 h-4" /></Button>}</>}
                                    </div></td>
                                </tr>
                            );
                        })}</tbody>
                    </table></div>
                )}
            </div>
            <EstateDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveEstate} estate={editingEstate} />
            <DepreciationDialog open={depreciationDialogOpen} onOpenChange={setDepreciationDialogOpen} year={depreciationYear} setYear={setDepreciationYear} onRun={handleRunDepreciation} />
        </>
    );
}

const EstateDialog = ({ open, onOpenChange, onSave, estate }) => {
    const [data, setData] = useState({ name: '', address: '', value: '', date: '', accumulatedDepreciation: 0, depreciationRate: 2.22, status: 'Activo' });
    
    useEffect(() => { 
        if(open) { 
            if(estate) {
                setData({ ...estate, depreciationRate: estate.depreciationRate ?? 2.22 });
            } else {
                setData({ name: '', address: '', value: '', date: new Date().toISOString().split('T')[0], accumulatedDepreciation: 0, depreciationRate: 2.22, status: 'Activo' });
            }
        } 
    }, [estate, open]);

    const handleSubmit = e => { 
        e.preventDefault(); 
        onSave(data); 
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader><DialogTitle>{estate ? 'Editar' : 'Nueva'} Propiedad</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 pt-4">
                    <div className="space-y-1"><Label>Nombre</Label><input required value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-lg" placeholder="Ej: Templo Principal, Despacho Parroquial"/></div>
                    <div className="space-y-1"><Label>Dirección</Label><input required value={data.address} onChange={e => setData({...data, address: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Fecha de Adquisición</Label><input type="date" required value={data.date} onChange={e => setData({...data, date: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1"><Label>Valor Original</Label><input type="number" step="0.01" required value={data.value} onChange={e => setData({...data, value: e.target.value})} className="w-full p-2 border rounded-lg" /></div>
                    <div className="space-y-1">
                        <Label>Deprec. acumulada histórica {estate ? '(protegida)' : '(si aplica)'}</Label>
                        <input type="number" min="0" step="0.01" disabled={Boolean(estate)} value={data.accumulatedDepreciation || 0} onChange={e => setData({...data, accumulatedDepreciation: e.target.value})} className="w-full p-2 border rounded-lg text-red-600 disabled:bg-slate-100 disabled:text-slate-500" />
                        {estate && <p className="text-xs text-slate-500">En una propiedad existente este valor sólo cambia mediante depreciación o ajuste contable trazable.</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Tasa anual de depreciación (%)</Label>
                        <input type="number" min="0.01" max="100" step="0.01" required value={data.depreciationRate ?? 2.22} onChange={e => setData({...data, depreciationRate: e.target.value})} className="w-full p-2 border rounded-lg" />
                        <p className="text-xs text-slate-500">2,22% es sólo el valor operativo inicial. Ajuste esta tasa a la política contable aplicable al inmueble.</p>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const DepreciationDialog = ({ open, onOpenChange, year, setYear, onRun }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Depreciación anual de edificaciones</DialogTitle></DialogHeader>
            <DialogDescription>
                El sistema usa 2,22% anual como parámetro operativo por defecto cuando la propiedad no tiene una tasa propia. La depreciación nunca superará el valor pendiente del activo y una vigencia ya registrada no se duplicará. La tasa y vida útil deben corresponder a la política contable aplicable a cada inmueble.
            </DialogDescription>
            <div className="space-y-4 pt-4">
                <div className="space-y-1">
                    <Label>Año de Vigencia a Depreciar</Label>
                    <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full p-2 border rounded-lg" />
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={onRun} className="bg-purple-600 hover:bg-purple-700">Calcular y Registrar</Button>
            </div>
        </DialogContent>
    </Dialog>
);

export default RealEstates;