export const getDynamicCashAccounts = (cashAccounts, transactions, selectedYear) => {
  if (!cashAccounts || !transactions) return [];

  // Identify relevant accounts (Menor / Mayor)
  const relevantAccounts = cashAccounts.filter(acc => {
      const name = (acc.name || '').toLowerCase();
      const code = (acc.code || '').toLowerCase();
      // Check for 'menor' or 'mayor' in name or code
      return name.includes('menor') || name.includes('mayor') || code.includes('menor') || code.includes('mayor');
  });

  return relevantAccounts.map(acc => {
      let balance = parseFloat(acc.initial_balance) || 0;
      
      // Calculate movements
      transactions.forEach(t => {
          // Status check (Exclude invalid)
          if (['eliminado', 'anulado', 'cancelado', 'borrador'].includes((t.status || '').toLowerCase())) return;
          
          // Date check (Accumulated up to end of selected year)
          if (!t.date) return;
          const tDate = new Date(t.date);
          if (tDate.getFullYear() > parseInt(selectedYear)) return;
          
          // Account check (Transaction belongs to this cash account)
          if (t.destination && t.destination.startsWith(acc.id)) {
              const amount = parseFloat(t.amount) || 0;
              if (t.type === 'income') balance += amount;
              else if (t.type === 'expense') balance -= amount;
          }
      });

      return { name: acc.name, balance };
  }).filter(item => item.balance > 0);
};