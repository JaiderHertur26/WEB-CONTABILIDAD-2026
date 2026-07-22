import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useCompanyData } from '@/hooks/useCompanyData';

const RecentTransactions = () => {
  const [transactionsData] = useCompanyData('transactions');
  const [recentTransactions, setRecentTransactions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const sorted = [...(transactionsData || [])].sort((a,b) => new Date(b.date) - new Date(a.date));
    setRecentTransactions(sorted.slice(0, 5));
  }, [transactionsData]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-white rounded-xl shadow-lg p-6 border border-slate-200"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-slate-900">Transacciones Recientes</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/transactions')}
        >
          <Eye className="w-4 h-4 mr-2" />
          Ver todas
        </Button>
      </div>

      {recentTransactions.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No hay transacciones registradas</p>
      ) : (
        <div className="space-y-4">
          {recentTransactions.map((transaction, index) => (
            <motion.div
              key={transaction.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  transaction.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {transaction.type === 'income' ? (
                    <ArrowUpRight className="w-5 h-5 text-green-600" />
                  ) : (
                    <ArrowDownRight className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{transaction.description}</p>
                  <p className="text-sm text-slate-500">{transaction.category}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold ${
                  transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}${parseFloat(transaction.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-slate-500">
                  {new Date(transaction.date).toLocaleDateString('es-ES')}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default RecentTransactions;