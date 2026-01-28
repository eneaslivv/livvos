
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Clock, ChevronRight, X, Layers, Users, Terminal as TerminalIcon, Calendar } from 'lucide-react';
import { Milestone } from '../types';

const LiveRoadmap: React.FC<{ milestones: Milestone[] }> = ({ milestones }) => {
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);

  return (
    <>
      <motion.div 
        variants={{
          hidden: { opacity: 0, x: 20 },
          visible: { opacity: 1, x: 0 }
        }}
        className="glass-card gradient-border-light p-8 h-full flex flex-col"
      >
        <div className="flex justify-between items-center mb-10">
          <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em]">Strategic Roadmap</h3>
          <span className="text-[9px] mono text-brand-accent/50 font-bold uppercase tracking-widest">v2.4 Live Sync</span>
        </div>
        
        <div className="space-y-8 flex-1">
          {milestones.map((milestone, idx) => {
            const isCompleted = milestone.status === 'completed';
            const isCurrent = milestone.status === 'current';

            return (
              <motion.div 
                key={milestone.id}
                onClick={() => setSelectedMilestone(milestone)}
                className={`flex gap-6 group relative cursor-pointer transition-all duration-500 ${isCompleted ? 'opacity-30' : 'opacity-100'}`}
                whileHover={{ x: 8 }}
              >
                <div className="flex flex-col items-center">
                  <div className={`
                    w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500
                    ${isCompleted ? 'bg-brand-dark text-brand-light border-brand-dark' : ''}
                    ${isCurrent ? 'bg-brand-accent text-brand-light border-brand-accent shadow-xl shadow-brand-accent/20 scale-110 z-10' : ''}
                    ${isCurrent === false && isCompleted === false ? 'bg-white border-brand-dark/10 text-brand-dark/20' : ''}
                  `}>
                    {isCompleted && <CheckCircle2 size={18} />}
                    {isCurrent && <Clock size={18} />}
                    {!isCompleted && !isCurrent && <Circle size={8} className="fill-current" />}
                  </div>
                  {idx !== milestones.length - 1 && (
                    <div className={`w-[1px] h-12 mt-2 ${isCompleted ? 'bg-brand-dark/40' : 'bg-brand-dark/5'}`} />
                  )}
                </div>
                
                <div className="flex-1 pb-6 border-b border-brand-dark/5">
                  <div className="flex items-center gap-3">
                    <h4 className={`text-xs font-black uppercase tracking-[0.15em] ${isCurrent ? 'text-brand-accent' : 'text-brand-dark'}`}>
                      {milestone.title}
                    </h4>
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-brand-accent/5 text-brand-accent text-[9px] font-black rounded uppercase mono border border-brand-accent/10">Active</span>
                    )}
                  </div>
                  <p className="text-[11px] text-brand-dark/50 mt-2 leading-relaxed line-clamp-1 group-hover:text-brand-dark transition-all duration-500 font-medium italic">
                    {milestone.description}
                  </p>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 self-center">
                  <ChevronRight size={18} className="text-brand-accent" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedMilestone && (
          <MilestoneDrawer 
            milestone={selectedMilestone} 
            onClose={() => setSelectedMilestone(null)} 
          />
        )}
      </AnimatePresence>
    </>
  );
};

const MilestoneDrawer: React.FC<{ milestone: Milestone; onClose: () => void }> = ({ milestone, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-dark/20 backdrop-blur-sm"
      />
      
      {/* Drawer Panel */}
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-xl h-full bg-[#fffffa] shadow-2xl flex flex-col border-l border-brand-dark/10"
      >
        {/* Header Section */}
        <div className="p-8 md:p-12 border-b border-brand-dark/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none">
            <span className="mono text-[180px] font-black leading-none -tracking-[0.1em] text-brand-dark">
              {milestone.id}
            </span>
          </div>
          
          <button 
            onClick={onClose}
            className="mb-12 p-3 hover:bg-brand-dark hover:text-white rounded-full transition-all border border-brand-dark/10"
          >
            <X size={20} />
          </button>

          <div className="relative z-10">
            <span className="text-brand-accent mono text-[10px] uppercase tracking-[0.5em] font-black mb-4 block">Milestone Protocol</span>
            <h2 className="text-4xl font-black text-brand-dark uppercase tracking-tighter mb-4 leading-none">{milestone.title}</h2>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-brand-dark text-white rounded-full">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[9px] mono font-bold uppercase tracking-widest">{milestone.status}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 border border-brand-dark/10 rounded-full">
                <Calendar size={12} className="text-brand-dark/30" />
                <span className="text-[9px] mono font-bold uppercase tracking-widest opacity-60">Est. 14 Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 custom-scroll">
          {/* Detailed Description */}
          <section>
            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 mb-6 flex items-center gap-3">
              <TerminalIcon size={14} className="text-brand-accent" />
              Executive Summary
            </h5>
            <p className="text-brand-dark/70 text-sm leading-relaxed font-medium italic">
              {milestone.description}. This phase involves the critical synchronization of infrastructure and user-facing architecture. All protocols must adhere to the LIVV-X high-performance standards.
            </p>
          </section>

          {/* Deliverables Checklist */}
          <section>
            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 mb-6 flex items-center gap-3">
              <Layers size={14} className="text-brand-accent" />
              Engineering Deliverables
            </h5>
            <div className="space-y-4">
              {[
                { label: 'Security Handshake Protocol', done: true },
                { label: 'Multi-node API Integration', done: milestone.status === 'completed' },
                { label: 'Latency Optimization ( < 50ms )', done: false },
                { label: 'UX/UI Fluidity Pass', done: false }
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-brand-cream/20 border border-brand-dark/5 rounded-2xl group hover:border-brand-accent/20 transition-all">
                  <span className="text-xs font-bold text-brand-dark/60">{item.label}</span>
                  {item.done ? (
                    <CheckCircle2 size={16} className="text-brand-accent" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-brand-dark/20" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Assigned Team */}
          <section>
            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-dark/30 mb-6 flex items-center gap-3">
              <Users size={14} className="text-brand-accent" />
              Assigned Engineering Team
            </h5>
            <div className="flex gap-3">
              {['JD', 'SM', 'HL', 'AK'].map((member, i) => (
                <div key={i} className="w-10 h-10 rounded-xl bg-brand-dark flex items-center justify-center text-white text-[10px] font-black border border-brand-light shadow-lg">
                  {member}
                </div>
              ))}
              <div className="w-10 h-10 rounded-xl border border-brand-dark/10 flex items-center justify-center text-brand-dark/30 text-[10px] font-black">
                +2
              </div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-8 md:p-12 border-t border-brand-dark/5 bg-brand-grey/30">
          <button className="w-full py-5 bg-brand-dark text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-brand-accent transition-all shadow-xl shadow-brand-dark/10">
            Request Phase Audit
          </button>
          <p className="text-center mt-6 text-[9px] text-brand-dark/30 mono font-bold uppercase tracking-widest">
            Protocol: SECURE_PHASE_ACCESS_AUTH
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default LiveRoadmap;
