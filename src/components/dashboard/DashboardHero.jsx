import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building,
  Building2,
  CalendarDays,
  FileBarChart2,
  Landmark,
  Plus,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const money = value =>
  Number(value || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const DashboardHero = ({
  activeCompany,
  selectedYear,
  availableYears,
  onYearChange,
  hasSubCompanies,
  isConsolidated,
  onToggleConsolidation,
  stats,
  periodLabel,
  cutoffLabel,
  onNewTransaction,
  onReports,
}) => {
  const netResult = Number(stats.totalIncome || 0) - Number(stats.totalExpenses || 0);
  const resultMargin = Number(stats.totalIncome || 0) > 0
    ? (netResult / Number(stats.totalIncome || 0)) * 100
    : 0;
  const marginWidth = Math.min(100, Math.max(0, Math.abs(resultMargin)));
  return (
    <motion.section
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white shadow-[0_28px_80px_-38px_rgba(15,23,42,0.9)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.16]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:42px_42px]" />
      </div>
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-blue-100 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Centro financiero
              </span>
              {isConsolidated && (
                <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-100">
                  Vista consolidada
                </span>
              )}
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              {activeCompany?.name || 'Entidad activa'}
            </p>
            <h1 className="company-hero-title mt-2 max-w-2xl text-2xl font-black tracking-[-0.04em] text-white min-[390px]:text-3xl sm:text-4xl lg:text-[2.85rem] lg:leading-[1.04]">
              Tu operación financiera, en una sola mirada.
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-5 text-slate-300 sm:mt-4 sm:text-[15px] sm:leading-6">
              Activos, ingresos, gastos y liquidez integrados para leer el estado real de la entidad y actuar con mayor claridad.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap">
              <Button
                onClick={onNewTransaction}
                className="h-10 whitespace-nowrap rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500 sm:h-11 sm:px-4 sm:text-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Transacciones
              </Button>
              <Button
                onClick={onReports}
                variant="outline"
                className="h-10 whitespace-nowrap rounded-xl border-white/15 bg-white/10 px-3 text-xs font-bold text-white backdrop-blur hover:bg-white/15 hover:text-white sm:h-11 sm:px-4 sm:text-sm"
              >
                <FileBarChart2 className="mr-2 h-4 w-4" />
                Reportes
              </Button>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 xl:w-[430px]">
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Resultado del período</p>
                  <p className={`mt-2 whitespace-nowrap font-mono text-2xl font-black tracking-[-0.045em] ${netResult >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {netResult < 0 ? '- ' : ''}$ {money(Math.abs(netResult))}
                  </p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${netResult >= 0 ? 'bg-emerald-300/10 text-emerald-200 ring-emerald-300/20' : 'bg-rose-300/10 text-rose-200 ring-rose-300/20'}`}>
                  <WalletCards className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${netResult >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${marginWidth}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                <span>{periodLabel}</span>
                <span className="shrink-0 font-bold text-slate-300">Margen {resultMargin.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <Landmark className="h-4 w-4 text-blue-300" />
              <p className="mt-3 text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Liquidez</p>
              <p className="mt-1 whitespace-nowrap font-mono text-[13px] font-black text-white min-[390px]:text-sm">$ {money(stats.cashBalance)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <CalendarDays className="h-4 w-4 text-cyan-300" />
              <p className="mt-3 text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-400">Corte</p>
              <p className="mt-1 text-sm font-black text-white">{cutoffLabel}</p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.07]">
              {isConsolidated ? <Building2 className="h-4 w-4 text-violet-200" /> : <Building className="h-4 w-4 text-blue-200" />}
            </div>
            <div>
              <p className="font-bold text-slate-200">{isConsolidated ? 'Estructura consolidada' : 'Vista individual'}</p>
              <p className="mt-0.5">{isConsolidated ? 'Información combinada de la estructura vinculada.' : 'Información exclusiva de la entidad activa.'}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedYear} onValueChange={onYearChange}>
              <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/[0.08] text-white shadow-none hover:bg-white/[0.12] sm:w-[145px] [&>svg]:text-slate-300">
                <CalendarDays className="mr-2 h-4 w-4 text-blue-300" />
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasSubCompanies && (
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-3.5 py-2">
                <Switch
                  id="dashboard-consolidation"
                  checked={isConsolidated}
                  onCheckedChange={onToggleConsolidation}
                  className="data-[state=checked]:bg-violet-500"
                />
                <Label htmlFor="dashboard-consolidation" className="cursor-pointer text-xs font-bold text-slate-200">
                  {isConsolidated ? 'Consolidada' : 'Individual'}
                </Label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-between border-t border-white/10 bg-black/10 px-5 py-3 text-[10px] font-semibold text-slate-400 sm:px-7 lg:px-8">
        <span>HERTUR · Panel ejecutivo</span>
        <span className="inline-flex items-center gap-1.5 text-slate-300">
          Datos al corte seleccionado
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </motion.section>
  );
};

export default DashboardHero;
