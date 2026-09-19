export const resolveLiquidityAccount = (
  endpoint,
  { bankAccounts = [], cashAccounts = [] } = {}
) => {
  const [id, label] = String(endpoint || '').split('|');
  if (!id) return null;

  if (id === 'caja_principal') {
    return { code: '11050501', name: 'CAJA PRINCIPAL', id, label: label || 'CAJA PRINCIPAL' };
  }

  const bank = (bankAccounts || []).find(item => String(item.id) === String(id));
  if (bank) {
    return {
      code: String(bank.accountingCode || '1110'),
      name: bank.accountingConcept || bank.bankName || label || 'BANCO',
      id: String(bank.id),
      label: bank.bankName || label || 'BANCO',
    };
  }

  const cash = (cashAccounts || []).find(item => String(item.id) === String(id));
  if (cash) {
    return {
      code: String(cash.accounting_account || '1105'),
      name: cash.accounting_concept || cash.name || label || 'CAJA',
      id: String(cash.id),
      label: cash.name || label || 'CAJA',
    };
  }

  return { code: '', name: label || id, id: String(id), label: label || id };
};

export const liquidityEndpointOptions = ({ bankAccounts = [], cashAccounts = [] } = {}) => [
  { value: 'caja_principal|CAJA PRINCIPAL', label: 'Caja Principal (Efectivo)' },
  ...(cashAccounts || []).map(item => ({
    value: `${item.id}|${item.name}`,
    label: item.name,
  })),
  ...(bankAccounts || []).map(item => ({
    value: `${item.id}|${item.bankName}`,
    label: item.bankName,
  })),
];
