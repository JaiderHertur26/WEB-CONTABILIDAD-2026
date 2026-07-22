const units = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function convertThreeDigits(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';

  let str = '';
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;

  if (h > 0) {
    str += hundreds[h] + ' ';
  }

  const rem = n % 100;
  if (rem > 0) {
    if (rem < 10) {
      str += units[rem];
    } else if (rem < 20) {
      str += teens[rem - 10];
    } else {
      str += tens[t];
      if (u > 0) {
        str += (t === 2 ? 'i' : ' y ') + units[u];
      }
    }
  }
  return str.trim();
}

export function numberToWords(num) {
  if (num === 0) return 'cero';
  if (num === 1) return 'un';

  const integerPart = Math.floor(num);
  let str = '';

  const billions = Math.floor(integerPart / 1000000000);
  const millions = Math.floor((integerPart % 1000000000) / 1000000);
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  const remainder = integerPart % 1000;

  if (billions > 0) {
    str += (billions === 1 ? 'un mil millones' : convertThreeDigits(billions) + ' mil millones') + ' ';
  }
  if (millions > 0) {
    str += (millions === 1 ? 'un millón' : convertThreeDigits(millions) + ' millones') + ' ';
  }
  if (thousands > 0) {
    if (thousands === 1) {
      str += 'mil ';
    } else {
      str += convertThreeDigits(thousands).replace('uno', 'un') + ' mil ';
    }
  }
  if (remainder > 0) {
    str += convertThreeDigits(remainder).replace('uno', 'un');
  }

  return str.trim();
}