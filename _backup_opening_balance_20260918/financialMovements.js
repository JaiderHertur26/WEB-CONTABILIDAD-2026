import { getTransactionAllocations, getTransactionTotal } from '@/lib/transactionAllocations';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const upper = (value) => String(value || '').trim().toUpperCase();

export const getLiquidityKindFromCode = (code) => {
  const value = String(code || '').trim();
  if (value.startsWith('1105')) return 'cash';
  if (value.startsWith('1110') || value.startsWith('1120')) return 'bank';
  if (value.startsWith('1295')) return 'investment';
  return null;
};

const accountNumberForCategory = (category, accounts = []) => {
  const match = accounts.find(a => upper(a?.name) === upper(category));
  return String(match?.number || '');
};

const parseEndpoint = (value) => {
  const parts = String(value || '').split('|');
  return { id: String(parts[0] || '').trim(), name: String(parts[1] || '').trim() };
};
const buildContext = ({ bankAccounts = [], cashAccounts = [], accounts = [] } = {}) => ({
  bankAccounts: Array.isArray(bankAccounts) ? bankAccounts : [],
  cashAccounts: Array.isArray(cashAccounts) ? cashAccounts : [],
  accounts: Array.isArray(accounts) ? accounts : [],
});

const classifyEndpoint = (value, context) => {
  const { id, name } = parseEndpoint(value);
  const nameUpper = upper(name || id);

  if (id === 'caja_principal' || nameUpper.includes('CAJA PRINCIPAL') || id === '11050501') {
    return { kind: 'cash', id: 'caja_principal', name: name || 'CAJA PRINCIPAL' };
  }

  const customCash = context.cashAccounts.find(c => String(c.id) === id);
  if (customCash) return { kind: 'customCash', id, name: customCash.name || name || id };

  const bank = context.bankAccounts.find(b => String(b.id) === id);
  if (bank) return { kind: 'bank', id, name: bank.bankName || bank.name || name || id };

  if (id === '12950501' || nameUpper.includes('APORTE')) {
    return { kind: 'investment', id: '12950501', name: name || 'APORTES ORDINARIOS' };
  }

  const byCode = getLiquidityKindFromCode(id);
  if (byCode) return { kind: byCode, id, name: name || id };
  return null;
};

const emptyDeltas = () => ({ mainCash: 0, customCash: {}, banks: {}, investments: 0 });

const addDelta = (deltas, target, amount, context) => {
  if (!target || !amount) return;
  if (target.kind === 'cash') {
    deltas.mainCash += amount;
  } else if (target.kind === 'customCash') {
    deltas.customCash[target.id] = (deltas.customCash[target.id] || 0) + amount;
  } else if (target.kind === 'bank') {
    const bank = context.bankAccounts.find(b =>
      String(b.id) === String(target.id) ||
      String(b.accountingCode || '') === String(target.id)
    );
    const key = String(bank?.id || target.id || 'bank');
    deltas.banks[key] = (deltas.banks[key] || 0) + amount;
  } else if (target.kind === 'investment') {
    deltas.investments += amount;
  }
};

const classifyCodeTarget = (code, context) => {
  const kind = getLiquidityKindFromCode(code);
  if (!kind) return null;
  if (kind === 'cash') return { kind: 'cash', id: 'caja_principal' };
  if (kind === 'investment') return { kind: 'investment', id: '12950501' };

  const bank = context.bankAccounts.find(b =>
    String(b.accountingCode || '') === String(code || '')
  );
  return { kind: 'bank', id: String(bank?.id || code || 'bank') };
};

export const getTransactionLiquidityDeltas = (transaction, options = {}) => {
  const context = buildContext(options);
  const deltas = emptyDeltas();
  if (!transaction) return deltas;

  const amount = getTransactionTotal(transaction);
  if (!amount) return deltas;

  if (transaction.debitAccount && transaction.creditAccount) {
    if (transaction.isInternalTransfer && String(transaction.id || '').endsWith('-inc')) return deltas;
    addDelta(deltas, classifyCodeTarget(transaction.debitAccount.code, context), amount, context);
    addDelta(deltas, classifyCodeTarget(transaction.creditAccount.code, context), -amount, context);
    return deltas;
  }

  if (transaction.type === 'transfer') {
    addDelta(deltas, classifyEndpoint(transaction.fromAccount, context), -amount, context);
    addDelta(deltas, classifyEndpoint(transaction.toAccount, context), amount, context);
    return deltas;
  }

  const categoryCode = accountNumberForCategory(transaction.category, context.accounts);
  const destination = classifyEndpoint(transaction.destination, context);

  // En ingresos multicuenta, una línea 1295/APORTES se separa del efectivo real.
  // La porción restante sí afecta Caja/Banco. Esto replica la lógica visible de Transacciones.
  if (transaction.type === 'income') {
    const allocations = getTransactionAllocations(transaction);
    const investmentAmount = allocations.reduce((sum, line) => {
      const lineCode = line.accountNumber || accountNumberForCategory(line.category, context.accounts);
      return sum + (getLiquidityKindFromCode(lineCode) === 'investment' ? num(line.amount) : 0);
    }, 0);

    if (investmentAmount > 0) {
      addDelta(deltas, { kind: 'investment', id: '12950501' }, investmentAmount, context);
      const regularAmount = Math.max(0, amount - investmentAmount);
      if (destination && regularAmount > 0) addDelta(deltas, destination, regularAmount, context);
      return deltas;
    }
  }

  if (getLiquidityKindFromCode(categoryCode) === 'investment') {
    addDelta(
      deltas,
      { kind: 'investment', id: categoryCode || '12950501' },
      transaction.type === 'expense' ? -amount : amount,
      context
    );
    return deltas;
  }

  if (destination) {
    const direction = transaction.type === 'expense' ? -1 : transaction.type === 'income' ? 1 : 0;
    addDelta(deltas, destination, direction * amount, context);
  }
  return deltas;
};

const sumObject = (obj) => Object.values(obj || {}).reduce((sum, value) => sum + num(value), 0);

export const sumCashAndBankDelta = (deltas) =>
  num(deltas?.mainCash) + sumObject(deltas?.customCash) + sumObject(deltas?.banks);
export const calculateLiquidityBalances = ({
  transactions = [],
  initialBalances = [],
  bankAccounts = [],
  cashAccounts = [],
  accounts = [],
  cutoffDate = null,
} = {}) => {
  const context = buildContext({ bankAccounts, cashAccounts, accounts });

  let mainCash = (initialBalances || []).reduce((sum, item) => {
    const code = String(item?.accountingCode || '');
    if (code && !code.startsWith('1105')) return sum;
    return sum + num(item?.balance);
  }, 0);

  const customCash = {};
  (cashAccounts || []).forEach(item => {
    customCash[String(item.id)] = num(item.initial_balance ?? item.initialBalance);
  });

  const banks = {};
  let investments = 0;
  (bankAccounts || []).forEach(item => {
    banks[String(item.id)] = num(item.initialBalance);
    investments += num(item.initialInvestmentBalance);
  });

  const cutoff = cutoffDate ? String(cutoffDate).slice(0, 10) : null;
  (transactions || []).forEach(transaction => {
    if (!transaction) return;
    const txDate = String(transaction.date || '').slice(0, 10);
    if (cutoff && txDate && txDate > cutoff) return;
    const status = upper(transaction.status).toLowerCase();
    if (['eliminado', 'anulado', 'cancelado', 'borrador'].includes(status)) return;

    const deltas = getTransactionLiquidityDeltas(transaction, context);
    mainCash += deltas.mainCash;

    Object.entries(deltas.customCash).forEach(([id, value]) => {
      customCash[id] = (customCash[id] || 0) + num(value);
    });
    Object.entries(deltas.banks).forEach(([id, value]) => {
      banks[id] = (banks[id] || 0) + num(value);
    });
    investments += deltas.investments;
  });

  const totalCustomCash = sumObject(customCash);
  const totalBanks = sumObject(banks);
  const totalCash = mainCash + totalCustomCash;

  return {
    mainCash,
    customCash,
    banks,
    investments,
    totalCustomCash,
    totalBanks,
    totalCash,
    cashAndBanks: totalCash + totalBanks,
    totalLiquidity: totalCash + totalBanks + investments,
  };
};

const nonCashCounterpart = (transaction, accounts = []) => {
  if (transaction?.debitAccount && transaction?.creditAccount) {
    const drKind = getLiquidityKindFromCode(transaction.debitAccount.code);
    const crKind = getLiquidityKindFromCode(transaction.creditAccount.code);
    if (drKind && !crKind) return transaction.creditAccount;
    if (crKind && !drKind) return transaction.debitAccount;
    if (!drKind && !crKind) return transaction.debitAccount;
  }

  const number = accountNumberForCategory(transaction?.category, accounts);
  return { code: number, name: transaction?.category || 'MOVIMIENTO' };
};

const flowLabel = (transaction, accounts = []) => {
  const counterpart = nonCashCounterpart(transaction, accounts);
  const code = String(counterpart?.code || '');
  const name = counterpart?.name || transaction?.category || 'MOVIMIENTO';

  if (
    transaction?.isFixedAsset ||
    (code.startsWith('15') && !code.startsWith('1592')) ||
    getLiquidityKindFromCode(code) === 'investment'
  ) return 'Inversiones y Adquisiciones Activos';

  return ((code ? code + ' ' : '') + name).trim();
};
const periodTransactions = (transactions, startDate, endDate) =>
  (transactions || []).filter(t => {
    const date = String(t?.date || '').slice(0, 10);
    if (!date) return false;
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });

export const buildCashFlowFromLiquidity = ({
  transactions = [],
  initialBalances = [],
  bankAccounts = [],
  cashAccounts = [],
  accounts = [],
  startDate,
  endDate,
} = {}) => {
  const beforeStart = startDate ? new Date(startDate + 'T00:00:00') : null;
  const openingCutoff = beforeStart
    ? new Date(beforeStart.getTime() - 86400000).toISOString().slice(0, 10)
    : null;

  const opening = calculateLiquidityBalances({
    transactions, initialBalances, bankAccounts, cashAccounts, accounts, cutoffDate: openingCutoff,
  });

  const closing = calculateLiquidityBalances({
    transactions, initialBalances, bankAccounts, cashAccounts, accounts, cutoffDate: endDate,
  });

  const groups = new Map();
  periodTransactions(transactions, startDate, endDate).forEach((t, index) => {
    if (t?.isInternalTransfer && /-(exp|inc)$/.test(String(t.id || ''))) {
      const key = String(t.id).replace(/-(exp|inc)$/, '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    } else {
      groups.set('single:' + String(t?.id || index), [t]);
    }
  });

  const sourceMap = {};
  const useMap = {};

  for (const group of groups.values()) {
    let cashBankDelta = 0;
    let representative = group[0];

    group.forEach(t => {
      const delta = getTransactionLiquidityDeltas(t, { bankAccounts, cashAccounts, accounts });
      const thisDelta = sumCashAndBankDelta(delta);
      cashBankDelta += thisDelta;
      if (Math.abs(thisDelta) > 0.001) representative = t;
    });

    if (Math.abs(cashBankDelta) < 0.005) continue;

    const label = flowLabel(representative, accounts);
    if (cashBankDelta > 0) {
      sourceMap[label] = (sourceMap[label] || 0) + cashBankDelta;
    } else {
      useMap[label] = (useMap[label] || 0) + Math.abs(cashBankDelta);
    }
  }

  const sources = Object.entries(sourceMap)
    .map(([item, amount]) => ({ item, amount }))
    .sort((a, b) => a.item.localeCompare(b.item));
  const uses = Object.entries(useMap)
    .map(([item, amount]) => ({ item, amount }))
    .sort((a, b) => a.item.localeCompare(b.item));

  const totalSources = sources.reduce((sum, row) => sum + row.amount, 0);
  const totalUses = uses.reduce((sum, row) => sum + row.amount, 0);
  const initial = opening.cashAndBanks;
  const final = initial + totalSources - totalUses;

  return {
    initial,
    sources,
    uses,
    totalSources,
    totalUses,
    final,
    actualClosing: closing.cashAndBanks,
    reconciliationDifference: final - closing.cashAndBanks,
  };
};
