import { getAccountingYear, toAccountingDateInput } from '@/lib/accountingDate';

export const accountingPeriodKey = value => {
  const date = toAccountingDateInput(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : '';
};

export const getMonthBounds = value => {
  const period = /^\d{4}-\d{2}$/.test(String(value || ''))
    ? String(value)
    : accountingPeriodKey(value);
  if (!period) return { period: '', startDate: '', endDate: '' };
  const [year, month] = period.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { period: '', startDate: '', endDate: '' };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    period,
    startDate: `${period}-01`,
    endDate: `${period}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const isFiscalYearClosed = (value, fiscalYears = []) => {
  const year = String(getAccountingYear(value) || '');
  if (!year) return false;
  return (fiscalYears || []).some(item =>
    String(item?.year) === year &&
    String(item?.status || '').toUpperCase() === 'CERRADO'
  );
};

export const getMonthlyClosing = (value, monthlyClosings = []) => {
  const period = accountingPeriodKey(value);
  if (!period) return null;
  return (monthlyClosings || []).find(item =>
    String(item?.period || item?.id || '') === period &&
    String(item?.status || 'OFICIAL').toUpperCase() !== 'ANULADO'
  ) || null;
};

export const getAccountingPeriodLockReason = (
  value,
  { fiscalYears = [], monthlyClosings = [] } = {}
) => {
  const date = toAccountingDateInput(value);
  if (!date) return null;
  if (isFiscalYearClosed(date, fiscalYears)) {
    return `La vigencia ${date.slice(0, 4)} está cerrada y no admite nuevos movimientos ni modificaciones.`;
  }
  const monthly = getMonthlyClosing(date, monthlyClosings);
  if (monthly) {
    return `El período ${monthly.period || accountingPeriodKey(date)} está oficializado y es inalterable.`;
  }
  return null;
};

export const isAccountingPeriodClosed = (value, options = {}) =>
  Boolean(getAccountingPeriodLockReason(value, options));

export const canOfficializePeriod = (period, today = new Date()) => {
  const bounds = getMonthBounds(period);
  const { startDate, endDate } = bounds;
  if (!startDate || !endDate) return { ok: false, reason: 'Período inválido.' };

  const todayKey = toAccountingDateInput(today);
  const currentPeriod = /^\d{4}-\d{2}-\d{2}$/.test(todayKey) ? todayKey.slice(0, 7) : '';
  if (!currentPeriod || bounds.period >= currentPeriod) {
    return { ok: false, reason: 'Sólo puede oficializarse un mes completamente terminado. El mes actual no puede cerrarse todavía.' };
  }
  return { ok: true, reason: '' };
};
