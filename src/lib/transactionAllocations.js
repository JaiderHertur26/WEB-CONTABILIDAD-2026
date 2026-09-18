export const getTransactionAllocations = (transaction) => {
  if (!transaction) return [];

  const stored = Array.isArray(transaction.allocations)
    ? transaction.allocations
        .map((line, index) => ({
          id: line.id || `allocation-${index}`,
          category: line.category || line.accountName || '',
          amount: Number(line.amount) || 0,
          accountNumber: line.accountNumber || line.accountCode || '',
          description: line.description || '',
        }))
        .filter(line => line.category && line.amount > 0)
    : [];

  if (stored.length > 0) return stored;

  const amount = Number(transaction.amount) || 0;
  if (!transaction.category || amount <= 0) return [];

  return [{
    id: 'legacy-allocation',
    category: transaction.category,
    amount,
    accountNumber: transaction._accountNumber || '',
    description: '',
  }];
};

export const getTransactionTotal = (transaction) => {
  const allocations = getTransactionAllocations(transaction);
  return allocations.length > 0
    ? allocations.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
    : (Number(transaction?.amount) || 0);
};
export const getTransactionCategoryLabel = (transaction) => {
  const allocations = getTransactionAllocations(transaction);
  if (allocations.length === 0) return transaction?.category || 'Sin Categoría';
  if (allocations.length === 1) return allocations[0].category;
  return `${allocations.length} cuentas: ${allocations.map(line => line.category).join(' · ')}`;
};

export const expandTransactionsByAllocation = (transactions = []) => {
  return transactions.flatMap(transaction => {
    if (transaction?.isInternalTransfer || transaction?.type === 'transfer') {
      return [transaction];
    }

    const allocations = getTransactionAllocations(transaction);
    if (allocations.length <= 1) return [transaction];

    return allocations.map((line, index) => ({
      ...transaction,
      id: `${transaction.id || 'transaction'}::allocation::${line.id || index}`,
      category: line.category,
      amount: line.amount,
      _accountNumber: line.accountNumber || transaction._accountNumber,
      _allocationParentId: transaction.id,
      _allocationIndex: index,
      _allocationDescription: line.description || '',
      _isAllocationLine: true,
    }));
  });
};
