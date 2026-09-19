const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const settledStatuses = new Set([
  'cobrado', 'pagado', 'anulado', 'anulada', 'cancelado', 'cancelada'
]);

const dateKey = value => {
  if (!value) return '';
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getOutstandingBalance = (item, cutoffDate = '') => {
  if (!item) return 0;
  const total = Math.max(0, numberOrNull(item.amount) || 0);
  const status = String(item.status || '').trim().toLowerCase();
  const cutoff = dateKey(cutoffDate);
  const issueDate = dateKey(getOpenItemDate(item));

  if (cutoff && issueDate && issueDate > cutoff) return 0;

  if (cutoff) {
    const payments = Array.isArray(item.payments) ? item.payments : [];
    if (payments.length > 0) {
      const paidThroughCutoff = payments.reduce((sum, payment) => {
        const paymentDate = dateKey(payment?.date || payment?.paymentDate || payment?.createdAt);
        if (!paymentDate || paymentDate > cutoff) return sum;
        const reversalDate = dateKey(payment?.reversedAt);
        if (reversalDate && reversalDate <= cutoff) return sum;
        return sum + Math.max(0, numberOrNull(payment?.amount) || 0);
      }, 0);
      return Math.max(0, total - paidThroughCutoff);
    }

    const settlementDate = dateKey(item.collectedAt || item.paidAt || item.settledAt);
    if (settledStatuses.has(status) && settlementDate) {
      return settlementDate <= cutoff ? 0 : total;
    }

    const storedBalanceAtCutoff = numberOrNull(item.balance);
    if (storedBalanceAtCutoff !== null && status === 'parcial') {
      return Math.max(0, Math.min(total || storedBalanceAtCutoff, storedBalanceAtCutoff));
    }

    if (settledStatuses.has(status)) return 0;
    return total;
  }

  if (settledStatuses.has(status)) return 0;

  const paidField = numberOrNull(item.paidAmount);
  if (paidField !== null && paidField > 0) {
    return Math.max(0, total - paidField);
  }

  const activePayments = Array.isArray(item.payments)
    ? item.payments.filter(payment => !payment?.reversedAt)
    : [];
  const paidFromHistory = activePayments.reduce(
    (sum, payment) => sum + Math.max(0, numberOrNull(payment?.amount) || 0),
    0
  );
  if (paidFromHistory > 0) {
    return Math.max(0, total - paidFromHistory);
  }

  const storedBalance = numberOrNull(item.balance);
  if (storedBalance !== null && (status === 'parcial' || storedBalance < total)) {
    return Math.max(0, Math.min(total || storedBalance, storedBalance));
  }

  return total;
};

export const getOpenItemDate = item =>
  item?.issueDate || item?.date || item?.createdAt || item?.created_at || '';
