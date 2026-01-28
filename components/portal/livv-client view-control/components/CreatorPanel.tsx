
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Share2, Type, Layout, CreditCard, ListChecks, Link, Image as ImageIcon } from 'lucide-react';
import { DashboardData, Milestone } from '../types';

interface CreatorPanelProps {
  data: DashboardData;
  title: string;
  subtitle: string;
  onUpdateTitle: (t: string) => void;
  onUpdateSubtitle: (s: string) => void;
  onUpdateData: (d: Partial<DashboardData>) => void;
  onUpdateLogo: (l: string | null) => void;
  onClose: () => void;
}

const CreatorPanel: React.FC<CreatorPanelProps> = ({ 
  data, 
  title, 
  subtitle,
  onUpdateTitle, 
  onUpdateSubtitle, 
  onUpdateData, 
  onUpdateLogo,
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'branding' | 'roadmap' | 'finance'>('branding');

  const updateMilestoneStatus = (id: string, status: Milestone['status']) => {
    const updatedMilestones = data.milestones.map(m => 
      m.id === id ? { ...m, status } : m
    );
    onUpdateData({ milestones: updatedMilestones });
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-dark/40 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col border-l border-brand-accent/20"
      >
        <div className="p-8 md:p-12 border-b border-brand-dark/5 flex justify-between items-start">
          <div>
            <h2 className="text-4xl font-black text-brand-dark uppercase tracking-tighter">Environment Editor</h2>
            <p className="text-brand-accent mono text-[10px] uppercase tracking-[0.4em] font-black mt-2">Customizing Client Experience</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-brand-dark text-white rounded-full hover:bg-brand-accent transition-all shadow-xl"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-brand-dark/5 bg-brand-grey/30">
          {[
            { id: 'branding', label: 'Branding', icon: <Type size={14} /> },
            { id: 'roadmap', label: 'Roadmap', icon: <ListChecks size={14} /> },
            { id: 'finance', label: 'Finance', icon: <CreditCard size={14} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-6 flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                activeTab === tab.id ? 'border-brand-accent text-brand-accent bg-white' : 'border-transparent text-brand-dark/30 hover:text-brand-dark'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 custom-scroll">
          {activeTab === 'branding' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Project Headline</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => onUpdateTitle(e.target.value.toUpperCase())}
                  className="w-full bg-brand-grey/30 border border-brand-dark/10 rounded-2xl p-5 text-lg font-black tracking-tight text-brand-dark focus:outline-none focus:border-brand-accent"
                />
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Environment Metadata</label>
                <input 
                  type="text" 
                  value={subtitle} 
                  onChange={(e) => onUpdateSubtitle(e.target.value)}
                  className="w-full bg-brand-grey/30 border border-brand-dark/10 rounded-2xl p-5 text-xs font-bold mono text-brand-dark/60 focus:outline-none focus:border-brand-accent"
                />
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Client Identity</label>
                <div className="flex gap-4">
                   <button 
                    onClick={() => onUpdateLogo("https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&q=80&w=200&h=200")}
                    className="flex-1 p-5 border border-dashed border-brand-dark/20 rounded-2xl flex flex-col items-center gap-2 hover:border-brand-accent/50 hover:bg-brand-accent/5 transition-all group"
                   >
                     <ImageIcon size={24} className="text-brand-dark/20 group-hover:text-brand-accent" />
                     <span className="text-[9px] font-black uppercase tracking-widest text-brand-dark/40">Apply Placeholder Logo</span>
                   </button>
                   <button 
                    onClick={() => onUpdateLogo(null)}
                    className="px-8 border border-brand-dark/5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-brand-dark/40 hover:bg-red-50 hover:text-red-600 transition-all"
                   >
                     Reset
                   </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'roadmap' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Global Progress ({data.progress}%)</label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={data.progress} 
                  onChange={(e) => onUpdateData({ progress: parseInt(e.target.value) })}
                  className="w-full h-2 bg-brand-dark/5 rounded-full appearance-none cursor-pointer accent-brand-accent"
                />
              </div>
              
              <div className="space-y-6">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Phase Management</label>
                {data.milestones.map(m => (
                  <div key={m.id} className="p-5 bg-brand-grey/20 border border-brand-dark/5 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-brand-dark">{m.title}</p>
                      <p className="text-[9px] mono uppercase text-brand-dark/40 mt-1">{m.status}</p>
                    </div>
                    <div className="flex gap-2">
                      {(['completed', 'current', 'future'] as const).map(s => (
                        <button 
                          key={s}
                          onClick={() => updateMilestoneStatus(m.id, s)}
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                            m.status === s ? 'bg-brand-dark border-brand-dark text-white shadow-lg' : 'bg-white border-brand-dark/10 text-brand-dark/20 hover:border-brand-accent'
                          }`}
                        >
                          <span className="text-[8px] font-black uppercase">{s[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'finance' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Total Commitment</label>
                  <input 
                    type="number" 
                    value={data.budget.total} 
                    onChange={(e) => onUpdateData({ budget: { ...data.budget, total: parseInt(e.target.value) } })}
                    className="w-full bg-brand-grey/30 border border-brand-dark/10 rounded-2xl p-5 text-sm font-black mono text-brand-dark focus:outline-none focus:border-brand-accent"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 block">Settled Amount</label>
                  <input 
                    type="number" 
                    value={data.budget.paid} 
                    onChange={(e) => onUpdateData({ budget: { ...data.budget, paid: parseInt(e.target.value) } })}
                    className="w-full bg-brand-grey/30 border border-brand-dark/10 rounded-2xl p-5 text-sm font-black mono text-brand-accent focus:outline-none focus:border-brand-accent"
                  />
                </div>
              </div>
              <div className="p-6 bg-brand-accent/5 border border-brand-accent/10 rounded-3xl">
                <p className="text-[10px] text-brand-accent uppercase tracking-widest font-black italic text-center">
                  Live ROI Projection: +{Math.floor(data.progress * 1.2)}% based on asset deployment
                </p>
              </div>
            </motion.div>
          )}
        </div>

        <div className="p-8 md:p-12 border-t border-brand-dark/5 bg-brand-grey/50">
          <button className="w-full py-6 bg-brand-dark text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] hover:bg-brand-accent transition-all flex items-center justify-center gap-4 shadow-2xl shadow-brand-dark/20">
            <Share2 size={18} />
            Generate Client Access Link
          </button>
          <p className="text-center mt-6 text-[9px] text-brand-dark/30 mono font-bold uppercase tracking-widest">
            Last synchronization: Just now
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default CreatorPanel;
