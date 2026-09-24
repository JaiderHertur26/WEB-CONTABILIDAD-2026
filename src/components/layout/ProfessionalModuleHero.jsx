import React from 'react';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';

const ProfessionalModuleHero = ({
  eyebrow,
  title,
  subtitle,
  activeCompany,
  icon: Icon,
  accent = 'blue',
  actions,
  badges,
  metrics = [],
}) => {
  const accents = {
    blue: 'from-blue-500/25 via-blue-500/5',
    emerald: 'from-emerald-500/25 via-emerald-500/5',
    amber: 'from-amber-400/25 via-amber-400/5',
    violet: 'from-violet-500/25 via-violet-500/5',
    rose: 'from-rose-500/25 via-rose-500/5',
    cyan: 'from-cyan-500/25 via-cyan-500/5',
  };
  const iconTones = {
    blue: 'bg-blue-500/15 text-blue-200 ring-blue-400/20',
    emerald: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/20',
    amber: 'bg-amber-400/15 text-amber-100 ring-amber-300/20',
    violet: 'bg-violet-500/15 text-violet-200 ring-violet-400/20',
    rose: 'bg-rose-500/15 text-rose-200 ring-rose-400/20',
    cyan: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/20',
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.9)]"
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accents[accent] || accents.blue} to-transparent`} />
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
      <div className="relative p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/80">
                {eyebrow}
              </span>
              {badges}
            </div>
            <div className="flex items-start gap-3">
              {Icon && (
                <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${iconTones[accent] || iconTones.blue}`}>
                  <Icon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="company-hero-title text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{subtitle}</p>
              </div>
            </div>
          </div>
          {actions && (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              {actions}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
            <Building2 className="h-4 w-4 shrink-0 text-slate-300" />
            <span className="truncate">{activeCompany?.name || 'Entidad activa'}</span>
          </div>
          {metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {metrics.map((metric, index) => (
                <div key={metric.label + index} className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-black text-white">{metric.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
};

export default ProfessionalModuleHero;
