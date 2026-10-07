import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Download,
  FileBarChart2,
  Landmark,
  Printer,
  Scale,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const money = (value) =>
  Math.abs(Number(value || 0)).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const signedMoney = (value) => {
  const amount = Number(value || 0);
  return amount < -0.01 ? `$ (${money(amount)})` : `$ ${money(amount)}`;
};

const KpiCard = ({ label, value, hint, icon: Icon, tone = 'blue', suffix = '' }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  };

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {hint}
        </span>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.11em] text-slate-500">{label}</p>
      <p className="mt-1 whitespace-nowrap font-mono text-[15px] font-bold tracking-[-0.035em] text-slate-950 min-[390px]:text-base sm:text-2xl sm:tracking-tight">
        {value}{suffix}
      </p>
    </div>
  );
};

const FinancialRows = ({ items = [] }) => (
  <div className="divide-y divide-slate-100">
    {items.map((item, index) => {
      const isSection = item.amount == null;
      const amount = Number(item.amount || 0);
      return (
        <div
          key={index}
          className={[
            'grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-4',
            item.isTopBorder ? 'border-t-2 border-t-slate-300' : '',
            item.isSubtotal ? 'bg-slate-50/80' : '',
            item.isTotal ? 'bg-blue-50/80' : '',
            isSection ? 'mt-1 bg-slate-50/60' : '',
          ].join(' ')}
        >
          <div className={isSection ? 'col-span-2' : ''}>
            <p
              className={[
                'break-words text-[13px] leading-5 sm:text-sm',
                item.isBold || item.isSubtotal || item.isTotal || isSection
                  ? 'font-bold text-slate-900'
                  : 'font-medium text-slate-600',
              ].join(' ')}
            >
              {String(item.item || '').trim()}
            </p>
          </div>
          {!isSection && (
            <p
              className={[
                'whitespace-nowrap text-right font-mono text-[12px] font-semibold tabular-nums sm:text-sm',
                amount < -0.01 ? 'text-rose-700' : 'text-slate-800',
              ].join(' ')}
            >
              {signedMoney(amount)}
            </p>
          )}
        </div>
      );
    })}
  </div>
);

const ExportActions = ({ onPdf, onExcel }) => (
  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
    <Button
      onClick={onPdf}
      className="h-9 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800 sm:text-sm"
    >
      <Printer className="mr-2 h-4 w-4" />
      PDF
    </Button>
    <Button
      onClick={onExcel}
      variant="outline"
      className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 sm:text-sm"
    >
      <Download className="mr-2 h-4 w-4" />
      Excel
    </Button>
  </div>
);

const ReportCard = ({ title, eyebrow, icon: Icon, actions, children, footer }) => (
  <motion.section
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.28 }}
    className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_16px_50px_-28px_rgba(15,23,42,0.35)]"
  >
    <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
          <h2 className="truncate text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
        </div>
      </div>
      {actions}
    </div>
    {children}
    {footer}
  </motion.section>
);

const FinancialReportsView = ({
  activeCompany,
  isConsolidated,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  effectiveEndDate,
  todayDateKey,
  reportData,
  onPrint,
  onExportBalance,
  onExportPnl,
  onExportCashFlow,
}) => {
  const [mobileReport, setMobileReport] = useState('balance');

  const periodLabel = useMemo(() => {
    if (!startDate || !effectiveEndDate) return 'Período no definido';
    return `${startDate} → ${effectiveEndDate}`;
  }, [startDate, effectiveEndDate]);

  const applyPreset = (preset) => {
    const today = new Date(`${todayDateKey}T12:00:00`);
    const year = today.getFullYear();
    const month = today.getMonth();

    if (preset === 'year') {
      setStartDate(`${year}-01-01`);
      setEndDate(todayDateKey);
      return;
    }

    if (preset === 'month') {
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      setStartDate(monthStart);
      setEndDate(todayDateKey);
      return;
    }

    const previousEnd = new Date(year, month, 0, 12);
    const previousStart = new Date(year, month - 1, 1, 12);
    const key = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setStartDate(key(previousStart));
    setEndDate(key(previousEnd));
  };

  const balanceOk =
    Math.abs(
      Number(reportData.balanceSheet?.totals?.assets || 0) -
        Number(reportData.balanceSheet?.totals?.liabilitiesAndEquity || 0)
    ) < 0.01;
  const cashOk = Math.abs(Number(reportData.cashFlow?.reconciliationDifference || 0)) < 0.01;

  const reportTabs = [
    { id: 'balance', label: 'Balance' },
    { id: 'pnl', label: 'Resultados' },
    { id: 'cashflow', label: 'Flujo' },
  ];

  return (
    <div className="space-y-5 pb-8 sm:space-y-6">
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
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">
                Centro financiero
              </span>
              {isConsolidated && (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">
                  Vista consolidada
                </span>
              )}
            </div>
            <h1 className="company-hero-title text-2xl font-bold tracking-tight text-white sm:text-3xl">Reportes Financieros</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {activeCompany?.name || 'Entidad contable'} · Lectura ejecutiva de balance, resultados y liquidez.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur">
            <CalendarDays className="h-5 w-5 shrink-0 text-blue-300" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Período analizado</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{periodLabel}</p>
            </div>
          </div>
        </div>
      </motion.header>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Período contable</p>
            <p className="mt-1 text-sm text-slate-500">Ajusta el corte sin salir del centro de reportes.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => applyPreset('month')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Este mes</button>
            <button onClick={() => applyPreset('previous')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Mes anterior</button>
            <button onClick={() => applyPreset('year')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Este año</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Desde</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none" />
          </label>
          <label className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Hasta</span>
            <input type="date" value={endDate} max={todayDateKey} onChange={(e) => setEndDate(e.target.value > todayDateKey ? todayDateKey : e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none" />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard label="Ingresos operacionales" value={`$ ${money(reportData.summary.totalIncome)}`} hint="P&L" icon={ArrowUpRight} tone="emerald" />
        <KpiCard label="Costos y gastos" value={`$ ${money(reportData.summary.totalExpenses)}`} hint="P&L" icon={ArrowDownRight} tone="rose" />
        <KpiCard label="Utilidad neta" value={signedMoney(reportData.summary.netProfit)} hint="Resultado" icon={TrendingUp} tone="blue" />
        <KpiCard label="Margen neto" value={Number(reportData.summary.profitMargin || 0).toLocaleString('es-CO')} suffix="%" hint="Rentabilidad" icon={Activity} tone="violet" />
      </section>

      <div className="md:hidden">
        <div className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileReport(tab.id)}
              className={`rounded-xl px-2 py-2.5 text-xs font-bold transition ${mobileReport === tab.id ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${mobileReport === 'balance' ? 'block' : 'hidden'} md:block`}>
        <ReportCard
          title="Balance General"
          eyebrow="Posición financiera"
          icon={Scale}
          actions={<ExportActions onPdf={() => onPrint('balance')} onExcel={onExportBalance} />}
          footer={
            <div className={`flex items-center justify-center gap-2 border-t px-4 py-3 text-center text-xs font-bold sm:text-sm ${balanceOk ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-rose-100 bg-rose-50 text-rose-800'}`}>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {balanceOk ? 'Balance cuadrado · Activos = Pasivo + Patrimonio' : 'El balance presenta una diferencia por revisar'}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-2 lg:gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between bg-blue-50/80 px-4 py-3">
                <div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-blue-700" /><h3 className="font-bold text-blue-950">Activos</h3></div>
                <span className="text-xs font-bold text-blue-700">{signedMoney(reportData.balanceSheet.totals.assets)}</span>
              </div>
              <FinancialRows items={reportData.balanceSheet.assets} />
              <div className="grid grid-cols-[1fr_auto] gap-3 border-t-2 border-slate-900 px-4 py-3 text-sm font-bold text-slate-950">
                <span>Total Activos</span><span className="font-mono">{signedMoney(reportData.balanceSheet.totals.assets)}</span>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between bg-slate-100/80 px-4 py-3">
                <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-slate-700" /><h3 className="font-bold text-slate-950">Pasivos y Patrimonio</h3></div>
                <span className="text-xs font-bold text-slate-700">{signedMoney(reportData.balanceSheet.totals.liabilitiesAndEquity)}</span>
              </div>
              <FinancialRows items={reportData.balanceSheet.liabilities} />
              <FinancialRows items={reportData.balanceSheet.equity} />
              <div className="grid grid-cols-[1fr_auto] gap-3 border-t-2 border-slate-900 px-4 py-3 text-sm font-bold text-slate-950">
                <span>Total Pasivo + Patrimonio</span><span className="font-mono">{signedMoney(reportData.balanceSheet.totals.liabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>
        </ReportCard>
      </div>

      <div className={`${mobileReport === 'pnl' ? 'block' : 'hidden'} md:block`}>
        <ReportCard title="Estado de Resultados" eyebrow="Desempeño del período" icon={FileBarChart2} actions={<ExportActions onPdf={() => onPrint('pnl')} onExcel={onExportPnl} />}>
          <div className="p-3 sm:p-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <FinancialRows items={reportData.incomeStatement} />
            </div>
          </div>
        </ReportCard>
      </div>

      <div className={`${mobileReport === 'cashflow' ? 'block' : 'hidden'} md:block`}>
        <ReportCard
          title="Flujo de Efectivo"
          eyebrow="Liquidez real"
          icon={Landmark}
          actions={<ExportActions onPdf={() => onPrint('cashflow')} onExcel={onExportCashFlow} />}
          footer={
            <div className={`flex items-center justify-center gap-2 border-t px-4 py-3 text-center text-xs font-bold sm:text-sm ${cashOk ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-rose-100 bg-rose-50 text-rose-800'}`}>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {cashOk
                ? 'Flujo conciliado con los saldos reales de Caja y Bancos'
                : `Diferencia de conciliación: $ ${money(reportData.cashFlow?.reconciliationDifference)}`}
            </div>
          }
        >
          <div className="p-3 sm:p-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="bg-emerald-50/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] text-emerald-800">Fuentes de efectivo</div>
              <FinancialRows
                items={[
                  { item: 'Disponible inicial (Caja-Bancos)', amount: reportData.cashFlow?.initial || 0 },
                  { item: 'Entradas reales del período', amount: reportData.cashFlow?.totalSources || 0, isSubtotal: true },
                  ...(reportData.cashFlow?.sources || []),
                  { item: 'Total disponible', amount: (reportData.cashFlow?.initial || 0) + (reportData.cashFlow?.totalSources || 0), isBold: true, isTopBorder: true },
                ]}
              />
              <div className="border-t bg-rose-50/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] text-rose-800">Usos de fondo</div>
              <FinancialRows
                items={[
                  { item: 'Salidas reales del período', amount: reportData.cashFlow?.totalUses || 0, isSubtotal: true },
                  ...(reportData.cashFlow?.uses || []),
                  { item: 'Total usos de fondo', amount: reportData.cashFlow?.totalUses || 0, isBold: true, isTopBorder: true },
                ]}
              />
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t-2 border-blue-900 bg-blue-50 px-4 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-blue-600">Cierre de liquidez</p>
                  <p className="font-bold text-blue-950">Saldo Disponible Final</p>
                </div>
                <p className="whitespace-nowrap font-mono text-sm font-bold text-blue-950 sm:text-lg">
                  {signedMoney(reportData.cashFlow?.final || 0)}
                </p>
              </div>
            </div>
          </div>
        </ReportCard>
      </div>
    </div>
  );
};

export default FinancialReportsView;
