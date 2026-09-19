import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/contexts/CompanyContext';
import { getRetentionAlert } from '@/lib/contractTaxEngine';

const money = value => Number(value || 0);
const fmt = value => money(value).toLocaleString('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

const ContractTaxAlert = ({ compact = false }) => {
  const [contracts] = useCompanyData('contracts');
  const { activeCompany } = useCompany();
  const navigate = useNavigate();

  const obligations = useMemo(() => (contracts || []).flatMap(contract =>
    (contract.acts || [])
      .filter(act => act.status !== 'Anulada' && money(act.tax?.totalWithholdings) > 0 && act.taxStatus !== 'paid')
      .map(act => ({
        contract,
        act,
        amount: money(act.tax?.totalWithholdings),
        alert: getRetentionAlert(act.date, activeCompany?.doc),
      }))
  ).filter(item => item.alert.dueDate)
   .sort((a, b) => String(a.alert.dueDate).localeCompare(String(b.alert.dueDate))),
  [contracts, activeCompany]);  if (!obligations.length) return null;

  const urgent = obligations.filter(item => item.alert.days <= 5);
  const next = obligations[0];
  const total = obligations.reduce((sum, item) => sum + item.amount, 0);

  return (
    <button
      type="button"
      onClick={() => navigate('/contracts')}
      className={`w-full text-left rounded-xl border transition hover:shadow-md ${
        urgent.length ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
      } ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-full p-2 ${urgent.length ? 'bg-amber-100' : 'bg-blue-50'}`}>
          {urgent.length
            ? <AlertTriangle className="w-5 h-5 text-amber-700" />
            : <CalendarClock className="w-5 h-5 text-blue-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-slate-900">Retenciones contractuales pendientes</p>
            <span className="text-xs font-semibold bg-white border px-2 py-1 rounded-full">{obligations.length} obligación(es)</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Total retenido identificado: <strong>{fmt(total)}</strong>.
          </p>          <div className="mt-2 flex items-center gap-2 text-xs">
            <Receipt className="w-4 h-4 text-slate-500" />
            <span className="font-semibold">{next.contract.number} · Acta {next.act.number}</span>
            <span className={next.alert.days <= 5 ? 'text-amber-800 font-bold' : 'text-slate-600'}>
              {next.alert.days < 0
                ? `vencida hace ${Math.abs(next.alert.days)} días`
                : next.alert.days === 0
                  ? 'vence hoy'
                  : `vence en ${next.alert.days} días`} · {next.alert.dueDate}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default ContractTaxAlert;
