const normalizeId = value => String(value ?? '').trim();

export const getRecordCompanyId = record =>
  normalizeId(record?._companyId ?? record?.company_id ?? record?.companyId);

export const resolveAccountForTransaction = (accounts = [], transaction = {}, categoryName = transaction?.category) => {
  const name = String(categoryName || '').trim();
  if (!name || !Array.isArray(accounts)) return null;

  const candidates = accounts.filter(account => String(account?.name || '').trim() === name);
  if (candidates.length === 0) return null;

  const companyId = getRecordCompanyId(transaction);
  if (companyId) {
    const scoped = candidates.find(account => getRecordCompanyId(account) === companyId);
    if (scoped) return scoped;

    const unscoped = candidates.find(account => !getRecordCompanyId(account));
    if (unscoped) return unscoped;
  }

  return candidates[0] || null;
};

export const getAccountPrefixForTransaction = (accounts, transaction, categoryName = transaction?.category) => {
  const account = resolveAccountForTransaction(accounts, transaction, categoryName);
  return account ? String(account.number || '').charAt(0) : null;
};
