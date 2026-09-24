import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useCompanyData } from '@/hooks/useCompanyData';
import { getTransactionCategoryLabel } from '@/lib/transactionAllocations';
import { accountingDateValue, formatAccountingDate } from '@/lib/accountingDate';
import { cn } from '@/lib/utils';

const RecentTransactions = () => {
  const [transactionsData] = useCompanyData('transactions');
  const [recentTransactions, setRecentTransactions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const sorted = [...(transactionsData || [])]
      .sort((a, b) => accountingDateValue(b.date) - accountingDateValue(a.date));

    setRecentTransactions(sorted.slice(0, 5));
  }, [transactionsData]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
      className="hertur-surface overflow-hidden rounded-3xl border border-slate-200/80 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            Actividad reciente
          </p>
          <h3 className="mt-1 text-lg font-extrabold text-slate-900">
            Transacciones recientes
          </h3>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/transactions')}
          className="h-9 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm"
        >
          <Eye className="mr-2 h-4 w-4" />
          Ver todas
        </Button>
      </div>

      {recentTransactions.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-500">No hay transacciones registradas</p>
          <p className="mt-1 text-xs text-slate-400">Los últimos movimientos aparecerán aquí.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {recentTransactions.map((transaction, index) => {
            const isIncome = transaction.type === 'income';

            return (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.055 }}
                className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                      isIncome
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                        : 'bg-rose-50 text-rose-700 ring-rose-100'
                    )}
                  >
                    {isIncome
                      ? <ArrowUpRight className="h-4.5 w-4.5" strokeWidth={1.9} />
                      : <ArrowDownRight className="h-4.5 w-4.5" strokeWidth={1.9} />
                    }
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {transaction.description || 'Movimiento contable'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {getTransactionCategoryLabel(transaction)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pl-[3.4rem] sm:block sm:pl-0 sm:text-right">
                  <p
                    className={cn(
                      'text-sm font-extrabold tracking-[-0.01em]',
                      isIncome ? 'text-emerald-700' : 'text-slate-800'
                    )}
                  >
                    {isIncome ? '+' : '-'}$
                    {parseFloat(transaction.amount || 0).toLocaleString('es-CO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                    {formatAccountingDate(transaction.date, 'es-CO')}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
};

export default RecentTransactions;
