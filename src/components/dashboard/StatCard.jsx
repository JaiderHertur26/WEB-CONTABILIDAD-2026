import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const palette = {
  blue: {
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    accent: 'bg-blue-600',
    value: 'text-slate-950',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    accent: 'bg-emerald-500',
    value: 'text-slate-950',
  },
  red: {
    icon: 'bg-rose-50 text-rose-700 ring-rose-100',
    accent: 'bg-rose-500',
    value: 'text-slate-950',
  },
  purple: {
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    accent: 'bg-violet-500',
    value: 'text-slate-950',
  },
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  trend = 'static',
  color = 'blue',
  tooltip = '',
  caption = '',
}) => {
  const styles = palette[color] || palette.blue;
  const TrendIcon = caption
    ? Minus
    : (trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus);
  const statusText = caption
    || (trend === 'up' ? 'Positivo' : trend === 'down' ? 'Negativo' : 'Estable');

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_14px_38px_-28px_rgba(15,23,42,0.35)] transition-shadow hover:shadow-[0_20px_46px_-28px_rgba(15,23,42,0.4)] sm:p-5"
      title={tooltip || undefined}
    >
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', styles.accent)} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
            {title}
          </p>
          <p className={cn('mt-3 truncate font-mono text-[1.35rem] font-black tracking-[-0.045em] sm:text-[1.65rem]', styles.value)}>
            {value}
          </p>
        </div>
        <div className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-[1.03]',
          styles.icon
        )}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
      </div>

      <div className="mt-4 flex min-w-0 items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <TrendIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.8} />
        <span className="truncate">{statusText}</span>
      </div>
    </motion.div>
  );
};

export default StatCard;
