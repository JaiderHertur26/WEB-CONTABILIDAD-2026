import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, trend, color }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600',
  };

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl shadow-lg p-6 text-white relative overflow-hidden`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm opacity-90">{title}</p>
          <Icon className="w-8 h-8 opacity-80" />
        </div>
        <p className="text-3xl font-bold mb-2">{value}</p>
        <div className="flex items-center text-sm">
          <TrendIcon className="w-4 h-4 mr-1" />
          <span className="opacity-90">{trend === 'up' ? 'Positivo' : trend === 'down' ? 'Negativo' : 'Estable'}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;