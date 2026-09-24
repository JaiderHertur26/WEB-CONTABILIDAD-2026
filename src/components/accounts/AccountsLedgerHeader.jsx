import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  DollarSign,
  Link2,
  Plus,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const money = value =>
  Number(value || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const StatCard = ({ label, value, hint, icon: Icon, tone = 'blue' }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.blue}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
          {hint}
        </span>
      </div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 sm:text-xs">{label}</p>
      <p className="mt-1 whitespace-nowrap font-mono text-[15px] font-black tracking-[-0.035em] text-slate-950 min-[390px]:text-base sm:text-xl">
        {value}
      </p>
    </div>
  );
};

const AccountsLedgerHeader = ({
  kind,
  activeCompany,
  isReadOnly,
  isConsolidatedReadOnly,
  canAdd,
  stats,
  searchTerm,
  setSearchTerm,
  onNew,
  onExport,
}) => {
  const receivable = kind === 'receivable';
  const title = receivable ? 'Cuentas por Cobrar' : 'Cuentas por Pagar';
  const subtitle = receivable
    ? 'Control de cartera, vencimientos y recaudos pendientes.'
    : 'Control de obligaciones, vencimientos y pagos pendientes.';
  const accent = receivable ? 'from-emerald-950' : 'from-rose-950';

  return (
    <div className="space-y-4 sm:space-y-5">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${accent} via-slate-950 to-blue-950 px-5 py-6 text-white shadow-[0_22px_60px_-30px_rgba(15,23,42,0.8)] sm:px-7 sm:py-7`}
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/80">
                Cartera y obligaciones
              </span>
              {isReadOnly && (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-100">
                  {isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}
                </span>
              )}
            </div>
            <h1 className="company-hero-title text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {activeCompany?.name || 'Entidad contable'} · {subtitle}
            </p>
          </div>
          {canAdd && (
            <Button
              onClick={onNew}
              className={`h-11 rounded-xl px-5 font-bold text-white shadow-lg ${receivable ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva cuenta
            </Button>
          )}
        </div>
      </motion.header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo pendiente"
          value={`$ ${money(stats.outstanding)}`}
          hint="Cartera"
          icon={DollarSign}
          tone={receivable ? 'emerald' : 'rose'}
        />
        <StatCard label="Vencidas" value={stats.overdue} hint="Atención" icon={AlertTriangle} tone="amber" />
        <StatCard label="Parciales" value={stats.partial} hint="Abonos" icon={CheckCircle} tone="blue" />
        <StatCard label="Intenciones" value={stats.massLinked} hint="Vinculadas" icon={Link2} tone="blue" />
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={receivable ? 'Buscar cliente, contacto o descripción...' : 'Buscar proveedor, contacto o descripción...'}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/70"
            />
          </div>
          <Button
            onClick={onExport}
            variant="outline"
            className="h-11 rounded-xl border-slate-200 bg-white px-4 font-bold text-slate-700"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </section>
    </div>
  );
};

export default AccountsLedgerHeader;
