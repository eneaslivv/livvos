
import React from 'react';
import { motion } from 'framer-motion';
import { X, Eye, Bell, Shield, Database, LayoutGrid } from 'lucide-react';

const PreferencesPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-dark/20 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md h-full bg-[#fffffa] shadow-2xl flex flex-col border-l border-brand-dark/10"
      >
        <div className="p-8 border-b border-brand-dark/5">
          <button onClick={onClose} className="mb-8 p-3 hover:bg-brand-dark hover:text-white rounded-full transition-all border border-brand-dark/10">
            <X size={20} />
          </button>
          <h2 className="text-3xl font-black text-brand-dark uppercase tracking-tighter">Preferences</h2>
          <p className="text-brand-dark/40 text-[10px] uppercase tracking-[0.4em] mono font-bold mt-2">Environment Configuration</p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scroll">
          <section>
            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 mb-6 flex items-center gap-3">
              <Eye size={14} className="text-brand-accent" />
              Privacy & Visibility
            </h5>
            <div className="space-y-4">
              {[
                { label: 'Confidential Finance Mode', active: true },
                { label: 'Vault Access History', active: false },
                { label: 'Anonymize Project Logs', active: false }
              ].map((opt, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-brand-cream/10 rounded-2xl border border-brand-dark/5">
                  <span className="text-xs font-bold text-brand-dark/70">{opt.label}</span>
                  <div className={`w-10 h-6 rounded-full relative transition-colors ${opt.active ? 'bg-brand-accent' : 'bg-brand-dark/10'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${opt.active ? 'right-1' : 'left-1'}`} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 mb-6 flex items-center gap-3">
              <Bell size={14} className="text-brand-accent" />
              Notifications
            </h5>
            <div className="space-y-4">
               <div className="flex items-center justify-between p-4 bg-brand-cream/10 rounded-2xl border border-brand-dark/5">
                  <span className="text-xs font-bold text-brand-dark/70">Priority Support Alerts</span>
                  <div className="w-10 h-6 bg-brand-accent rounded-full relative">
                    <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
            </div>
          </section>

          <section>
            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 mb-6 flex items-center gap-3">
              <Database size={14} className="text-brand-accent" />
              Cloud Synchronicity
            </h5>
            <div className="p-4 bg-brand-dark/5 rounded-2xl border border-brand-dark/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-dark/40">Data Integrity</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-accent">99.9%</span>
              </div>
              <div className="h-1 w-full bg-brand-dark/10 rounded-full overflow-hidden">
                <div className="h-full w-[99.9%] bg-brand-accent" />
              </div>
            </div>
          </section>
        </div>

        <div className="p-8 border-t border-brand-dark/5 bg-brand-grey/30">
          <button className="w-full py-5 bg-brand-dark text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-brand-accent transition-all">
            Update Protocol
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default PreferencesPanel;
