
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Landmark, TrendingUp } from 'lucide-react';

const InvestmentTracker: React.FC<{ budget: { total: number, paid: number } }> = ({ budget }) => {
  const [showValues, setShowValues] = useState(true);
  const remaining = budget.total - budget.paid;
  const percent = (budget.paid / budget.total) * 100;

  const formatCurrency = (val: number) => {
    if (!showValues) return 'PRIVATE_ENC';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card gradient-border-light p-8 h-full flex flex-col"
    >
      <div className="flex justify-between items-center mb-10">
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] flex items-center gap-2">
          <Landmark size={14} className="text-brand-accent" />
          Financial Ledger
        </h3>
        <button 
          onClick={() => setShowValues(!showValues)}
          className="p-2.5 bg-white hover:bg-brand-grey border border-brand-dark/5 rounded-xl transition-all shadow-sm active:scale-95"
        >
          {showValues ? <EyeOff size={16} className="text-brand-dark/40" /> : <Eye size={16} className="text-brand-accent" />}
        </button>
      </div>

      <div className="space-y-10 flex-1 flex flex-col justify-center">
        <div>
          <p className="text-[10px] text-brand-dark/30 uppercase tracking-[0.3em] mono font-black mb-3 italic">Capital Commitment</p>
          <p className="mono text-4xl font-black text-brand-dark tracking-tight leading-none">
            {formatCurrency(budget.total)}
          </p>
        </div>

        <div>
          <div className="flex justify-between text-[10px] text-brand-dark/40 uppercase tracking-[0.3em] mono mb-4 font-bold">
            <span>Funding Maturation</span>
            <span className="text-brand-accent">{showValues ? `${Math.round(percent)}%` : 'ENCRYPTED'}</span>
          </div>
          <div className="h-2 bg-brand-dark/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 1.8, ease: "circOut" }}
              className="h-full bg-brand-accent shadow-[0_4px_10px_rgba(130,43,46,0.15)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="p-5 bg-white border border-brand-dark/5 rounded-2xl">
            <p className="text-[9px] text-brand-dark/20 uppercase tracking-[0.3em] mono font-black mb-2">Settled</p>
            <p className="text-base font-black text-brand-accent mono">{formatCurrency(budget.paid)}</p>
          </div>
          <div className="p-5 bg-white border border-brand-dark/5 rounded-2xl">
            <p className="text-[9px] text-brand-dark/20 uppercase tracking-[0.3em] mono font-black mb-2">Floating</p>
            <p className="text-base font-black text-brand-dark/80 mono">{formatCurrency(remaining)}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InvestmentTracker;
