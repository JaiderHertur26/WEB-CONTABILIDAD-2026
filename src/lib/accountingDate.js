const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const parseAccountingDate = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  if (value == null || value === '') return new Date(NaN);

  const text = String(value).trim();
  const match = DATE_ONLY_RE.exec(text);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
};

export const getAccountingYear = (value) => {
  const text = value == null ? '' : String(value).trim();
  const match = DATE_ONLY_RE.exec(text);
  if (match) return Number(match[1]);
  return parseAccountingDate(value).getFullYear();
};

export const accountingDateValue = (value) => {
  const date = parseAccountingDate(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export const formatAccountingDate = (value, locale = 'es-CO', options = {}) => {
  const date = parseAccountingDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, options);
};

export const toAccountingDateInput = (value) => {
  const text = value == null ? '' : String(value).trim();
  if (DATE_ONLY_RE.test(text)) return text;

  const date = parseAccountingDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
