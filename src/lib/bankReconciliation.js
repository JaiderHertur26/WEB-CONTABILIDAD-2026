import * as XLSX from 'xlsx';
import { isValid } from 'date-fns';

export const cleanBankNumber = value => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let text = String(value).trim();
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[()$€£\s]/g, '').replace(/[^0-9,.-]/g, '');

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    text = decimals > 0 && decimals <= 2
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimals = text.length - lastDot - 1;
    if ((text.match(/\./g) || []).length > 1 || decimals === 3) {
      text = text.replace(/\./g, '');
    }
  }

  const number = Math.abs(parseFloat(text) || 0);
  return negative ? -number : number;
};

export const parseBankDate = value => {
  if (!value) return null;
  if (value instanceof Date && isValid(value)) return value;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const text = String(value).trim().split(' ')[0];

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (local) return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));

  const localShort = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (localShort) {
    const yy = Number(localShort[3]);
    return new Date(yy >= 70 ? 1900 + yy : 2000 + yy, Number(localShort[2]) - 1, Number(localShort[1]));
  }

  const parsed = new Date(text);
  return isValid(parsed) ? parsed : null;
};

export const buildReconciliationFingerprint = (bankId, row) =>
  [
    String(bankId || ''),
    row?.date || '',
    row?.type || '',
    Number(row?.amount || 0).toFixed(2),
    String(row?.description || '').trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
