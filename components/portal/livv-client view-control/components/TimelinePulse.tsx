
import React from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Zap, Activity, Calendar } from 'lucide-react';
import { DashboardData } from '../types';

const sparklineData = [
  { val: 45 }, { val: 42 }, { val: 68 }, { val: 55 }, { val: 78 }, { val: 74 }, { val: 92 }
];

const TimelinePulse: React.FC<{ data: DashboardData }> = ({ data }) => {
  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card gradient-border-light p-8 h-full flex flex-col justify-between"
    >
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] mb-3 flex items-center gap-2">
            <Activity size={14} className="text-brand-accent" />
            Project Velocity
          </h3>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-accent shadow-[0_0_8px_rgba(130,43,46,0.3)] animate-pulse" />
            <span className="mono text-xs font-bold uppercase tracking-widest text-brand-dark/70">
              Operational Intensity: High
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="mono text-5xl font-black text-brand-dark tracking-tighter leading-none">{data.progress}%</span>
          <p className="text-[10px] text-brand-dark/40 uppercase tracking-[0.2em] mt-2 font-bold">Aggregate Completion</p>
        </div>
      </div>

      <div className="relative h-2 bg-brand-dark/5 rounded-full mb-10 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${data.progress}%` }}
          transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-0 left-0 h-full bg-brand-accent rounded-full shadow-[0_2px_10px_rgba(130,43,46,0.2)]"
        />
      </div>

      <div className="flex-1 min-h-[140px] mb-8 relative">
        <div className="absolute top-0 left-0 flex items-center gap-2 z-10 opacity-40">
          <Zap size={10} className="text-brand-dark" />
          <span className="text-[9px] uppercase text-brand-dark tracking-widest mono font-black">Performance Telemetry</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparklineData}>
            <defs>
              <linearGradient id="brandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#822b2e" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#822b2e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area 
              type="monotone" 
              dataKey="val" 
              stroke="#822b2e" 
              fillOpacity={1} 
              fill="url(#brandGradient)" 
              strokeWidth={3}
              animationDuration={3000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-8 pt-8 border-t border-brand-dark/5">
        <div>
          <p className="text-[9px] text-brand-dark/30 uppercase mono font-black tracking-widest mb-1">Contract Started</p>
          <p className="text-sm font-bold text-brand-dark/80">{data.startDate}</p>
        </div>
        <div>
          <p className="text-[9px] text-brand-dark/30 uppercase mono font-black tracking-widest mb-1">Estimated ETA</p>
          <p className="text-sm font-bold text-brand-dark/80">{data.etaDate}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-brand-dark/30 uppercase mono font-black tracking-widest mb-1">T-Minus</p>
          <p className="text-sm font-black text-brand-accent mono">24 Days</p>
        </div>
      </div>
    </motion.div>
  );
};

export default TimelinePulse;
