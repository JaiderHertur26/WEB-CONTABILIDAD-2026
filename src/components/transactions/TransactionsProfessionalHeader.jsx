import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  FileSpreadsheet,
  Plus,
  FileText,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const formatMoney = (value) =>
  Math.abs(Number(value || 0)).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const SummaryCard = ({ label, value, hint, icon: Icon, tone = 'blue' }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
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
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 whitespace-nowrap font-mono text-[15px] font-black tracking-[-0.035em] text-slate-950 min-[390px]:text-base sm:text-xl sm:tracking-tight">
        {value}
      </p>
    </div>
  );
};

const TransactionsProfessionalHeader = ({
  activeCompany,
  isConsolidated,
  isReadOnly,
  isConsolidatedReadOnly,
  canAdd,
  startDate,
  effectiveEndDate,
  summary,
  onNew,
  onTransfer,
  onReconcile,
  onStore,
}) => (
  <div className="space-y-4 sm:space-y-5">
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white shadow-[0_22px_60px_-30px_rgba(15,23,42,0.8)] sm:px-7 sm:py-7"
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Centro de operaciones
            </span>
            {isConsolidated && (
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-100">
                Vista consolidada
              </span>
            )}
            {isReadOnly && (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-100">
                {isConsolidatedReadOnly ? 'Solo lectura' : 'Acceso parcial'}
              </span>
            )}
          </div>

          <h1 className="company-hero-title text-2xl font-black tracking-tight text-white sm:text-3xl">
            Transacciones
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            {activeCompany?.name || 'Entidad contable'} · Registro, control y trazabilidad de todos los movimientos financieros.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur">
          <CalendarDays className="h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Período activo</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{startDate} → {effectiveEndDate}</p>
          </div>
        </div>
      </div>

      {canAdd && (
        <div className="relative mt-5 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
          <Button
            onClick={onNew}
            className="h-11 rounded-xl bg-blue-600 px-4 font-bold text-white shadow-lg shadow-blue-950/20 hover:bg-blue-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva
          </Button>
          <Button
            onClick={onTransfer}
            variant="outline"
            className="h-11 rounded-xl border-white/15 bg-white/10 px-4 font-bold text-white hover:bg-white/15 hover:text-white"
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Transferir
          </Button>
          <Button
            onClick={onReconcile}
            variant="outline"
            className="h-11 rounded-xl border-emerald-300/20 bg-emerald-300/10 px-4 font-bold text-emerald-100 hover:bg-emerald-300/15 hover:text-white"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Conciliar
          </Button>
          <Button
            onClick={onStore}
            variant="outline"
            className="h-11 rounded-xl border-white/15 bg-white/10 px-4 font-bold text-white hover:bg-white/15 hover:text-white"
          >
            <Store className="mr-2 h-4 w-4" />
            Tienda
          </Button>
        </div>
      )}
    </motion.header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard
        label="Ingresos"
        value={`$ ${formatMoney(summary.income)}`}
        hint="Período"
        icon={ArrowUpRight}
        tone="emerald"
      />
      <SummaryCard
        label="Egresos"
        value={`$ ${formatMoney(summary.expense)}`}
        hint="Período"
        icon={ArrowDownRight}
        tone="rose"
      />
      <SummaryCard
        label="Balance neto"
        value={`${summary.net < 0 ? '- ' : ''}$ ${formatMoney(summary.net)}`}
        hint="Resultado"
        icon={FileText}
        tone="blue"
      />
      <SummaryCard
        label="Movimientos"
        value={Number(summary.count || 0).toLocaleString('es-CO')}
        hint="Filtrados"
        icon={ArrowRightLeft}
        tone="violet"
      />
    </section>
  </div>
);

export default TransactionsProfessionalHeader;
