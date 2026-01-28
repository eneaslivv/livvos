
import React from 'react';
import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';
import { LogEntry } from '../types';

const SystemLogs: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card p-8 border border-brand-dark/5 rounded-[2rem]"
    >
      <div className="flex items-center gap-3 mb-6">
        <Terminal size={18} className="text-brand-accent" />
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.4em]">Environmental Telemetry</h3>
      </div>
      
      <div className="bg-white rounded-2xl p-6 border border-brand-dark/5 max-h-[180px] overflow-y-auto mono custom-scroll shadow-inner">
        {logs.map(log => (
          <div key={log.id} className="flex gap-6 mb-3 group items-center">
            <span className="text-brand-accent/30 text-[9px] min-w-[100px] font-black group-hover:text-brand-accent transition-colors">[{log.timestamp}]</span>
            <span className="text-brand-dark/60 text-[11px] group-hover:text-brand-dark transition-colors font-medium">{log.message}</span>
          </div>
        ))}
        <div className="flex gap-6 items-center mt-2">
          <div className="w-1.5 h-4 bg-brand-accent/20 animate-pulse ml-[104px]" />
          <span className="text-brand-dark/10 text-[10px] uppercase tracking-[0.3em] font-black italic">Awaiting secure signal...</span>
        </div>
      </div>
    </motion.div>
  );
};

export default SystemLogs;
