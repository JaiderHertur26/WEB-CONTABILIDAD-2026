import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Boxes, Building, KeyRound, Briefcase, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import ProfessionalModuleHero from '@/components/layout/ProfessionalModuleHero';
import { toAccountingDateInput } from '@/lib/accountingDate';
import {
  PATRIMONIAL_ASSET_TYPES,
  buildPatrimonialRegistry,
  getIntangibleSnapshot,
  inferPatrimonialAssetType,
  summarizePatrimonialAtCutoff,
} from '@/lib/patrimonialAssets';
import { getAssetSnapshot } from '@/lib/fixedAssetLifecycle';

const typeMeta = {
  [PATRIMONIAL_ASSET_TYPES.TANGIBLE]: { label: 'Tangible', icon: Briefcase },
  [PATRIMONIAL_ASSET_TYPES.REAL_ESTATE]: { label: 'Inmueble', icon: Building },
  [PATRIMONIAL_ASSET_TYPES.INTANGIBLE]: { label: 'Intangible', icon: KeyRound },
};

const PatrimonialRegistry = () => {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [fixedAssets] = useCompanyData('fixedAssets');
  const [realEstates] = useCompanyData('realEstates');
  const [transactions] = useCompanyData('transactions');
  const [searchTerm, setSearchTerm] = useState('');
  const cutoff = toAccountingDateInput(new Date());

  const registry = useMemo(
    () => buildPatrimonialRegistry(fixedAssets || [], realEstates || []),
    [fixedAssets, realEstates]
  );

  const summary = useMemo(
    () => summarizePatrimonialAtCutoff(fixedAssets || [], realEstates || [], cutoff, transactions || []),
    [fixedAssets, realEstates, cutoff, transactions]
  );

  const filtered = registry.filter(asset => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return [asset.name, asset.accountCode, asset.accountName, asset.location, asset.address, asset.provider]
      .some(value => String(value || '').toLowerCase().includes(q));
  });

  const snapshotFor = asset => inferPatrimonialAssetType(asset) === PATRIMONIAL_ASSET_TYPES.INTANGIBLE
    ? getIntangibleSnapshot(asset, cutoff, transactions || [])
    : getAssetSnapshot(asset, cutoff, transactions || []);

  const gross = summary.tangible.grossCost + summary.realEstate.grossCost + summary.intangible.grossCost;
  const accumulated = summary.tangible.accumulatedDepreciation +
    summary.realEstate.accumulatedDepreciation +
    summary.intangible.accumulatedAmortization;
  const net = summary.tangible.netBookValue + summary.realEstate.netBookValue + summary.intangible.netBookValue;

  return (
    <>
      <Helmet><title>Registro Patrimonial - HERTUR Contabilidad</title></Helmet>
      <div className="space-y-6">
        <ProfessionalModuleHero
          eyebrow="Patrimonio maestro"
          title="Registro Patrimonial"
          subtitle="Una sola vista para bienes tangibles, inmuebles e intangibles, conservando alta, cuenta PUC, depreciación o amortización y valor en libros."
          activeCompany={activeCompany}
          icon={Boxes}
          accent="violet"
          metrics={[
            { label: 'Bienes registrados', value: registry.length },
            { label: 'Costo histórico vigente', value: '$ ' + gross.toLocaleString('es-CO', { maximumFractionDigits: 0 }) },
            { label: 'Valor en libros', value: '$ ' + net.toLocaleString('es-CO', { maximumFractionDigits: 0 }) },
          ]}
          actions={
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={() => navigate('/fixed-assets')} className="h-10 border-white/15 bg-white/10 px-3 text-white hover:bg-white/15 hover:text-white">Tangibles</Button>
              <Button variant="outline" onClick={() => navigate('/real-estates')} className="h-10 border-white/15 bg-white/10 px-3 text-white hover:bg-white/15 hover:text-white">Inmuebles</Button>
              <Button variant="outline" onClick={() => navigate('/intangible-assets')} className="h-10 border-white/15 bg-white/10 px-3 text-white hover:bg-white/15 hover:text-white">Intangibles</Button>
            </div>
          }
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tangibles</p><p className="mt-2 text-2xl font-black text-slate-900">{summary.tangible.count}</p><p className="mt-1 text-sm text-slate-500">Valor libros: $ {summary.tangible.netBookValue.toLocaleString('es-CO')}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Inmuebles</p><p className="mt-2 text-2xl font-black text-slate-900">{summary.realEstate.count}</p><p className="mt-1 text-sm text-slate-500">Valor libros: $ {summary.realEstate.netBookValue.toLocaleString('es-CO')}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Intangibles</p><p className="mt-2 text-2xl font-black text-slate-900">{summary.intangible.count}</p><p className="mt-1 text-sm text-slate-500">Valor libros: $ {summary.intangible.netBookValue.toLocaleString('es-CO')}</p></div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Label>Buscar en todo el patrimonio</Label>
            <Search className="absolute left-3 top-10 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Nombre, cuenta PUC, ubicación, proveedor..." className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-950 text-slate-200">
              <tr>{['Tipo', 'Activo', 'Alta', 'Cuenta PUC', 'Costo', 'Acumulado', 'Valor libros', 'Estado'].map(label => <th key={label} className="p-3 text-left font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(asset => {
                const type = inferPatrimonialAssetType(asset);
                const meta = typeMeta[type];
                const Icon = meta.icon;
                const snap = snapshotFor(asset);
                const accumulatedValue = type === PATRIMONIAL_ASSET_TYPES.INTANGIBLE
                  ? snap.accumulatedAmortization
                  : snap.accumulatedDepreciation;
                return <tr key={asset.id} className="hover:bg-slate-50">
                  <td className="p-3"><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700"><Icon className="h-3.5 w-3.5" />{meta.label}</span></td>
                  <td className="p-3 font-semibold">{asset.name}</td>
                  <td className="p-3">{asset.acquisitionDate || asset.date || '—'}</td>
                  <td className="p-3"><div className="font-mono text-xs font-bold">{asset.accountCode || 'Pendiente'}</div><div className="max-w-64 truncate text-[11px] text-slate-500">{asset.accountName || ''}</div></td>
                  <td className="p-3 font-mono">$ {snap.originalValue.toLocaleString('es-CO')}</td>
                  <td className="p-3 font-mono text-rose-600">$ {Number(accumulatedValue || 0).toLocaleString('es-CO')}</td>
                  <td className="p-3 font-mono font-bold text-violet-700">$ {snap.netBookValue.toLocaleString('es-CO')}</td>
                  <td className="p-3">{snap.present ? 'Vigente' : 'Baja'}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No hay bienes para mostrar.</div>}
        </div>

        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-800">
          <strong>Control patrimonial:</strong> costo histórico vigente $ {gross.toLocaleString('es-CO')} · depreciación/amortización acumulada $ {accumulated.toLocaleString('es-CO')} · valor neto $ {net.toLocaleString('es-CO')}.
        </div>
      </div>
    </>
  );
};

export default PatrimonialRegistry;
