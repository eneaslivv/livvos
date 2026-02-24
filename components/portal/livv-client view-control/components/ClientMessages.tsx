
import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Shield } from 'lucide-react';
import { MessageItem } from '../types';

const ClientMessages: React.FC<{ messages?: MessageItem[] }> = ({ messages }) => {
  const items = messages && messages.length ? messages : [];

  if (items.length === 0) {
    return (
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: { opacity: 1, y: 0 }
        }}
        className="glass-card gradient-border-light p-8 h-full flex flex-col"
      >
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
          <MessageSquare size={14} className="text-brand-accent" />
          Secure Communications
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Shield size={24} className="mx-auto text-brand-dark/10 mb-3" />
            <p className="text-[11px] text-brand-dark/20 uppercase tracking-[0.2em] font-bold italic">No messages in channel</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Show messages in chronological order (oldest first for chat)
  const chronological = [...items].reverse();

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card gradient-border-light p-8 h-full flex flex-col"
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] flex items-center gap-2">
          <MessageSquare size={14} className="text-brand-accent" />
          Secure Communications
        </h3>
        <div className="flex items-center gap-2 px-3 py-1 bg-white border border-brand-dark/5 rounded-full">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-[9px] mono font-bold uppercase tracking-widest opacity-40">E2E Encrypted</span>
        </div>
      </div>

      <div className="flex-1 max-h-[320px] overflow-y-auto custom-scroll space-y-3 pr-1">
        {chronological.map((msg) => {
          const isTeam = msg.senderType === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isTeam ? 'items-start' : 'items-end'}`}
            >
              <div className={`max-w-[85%] p-4 rounded-2xl ${
                isTeam
                  ? 'bg-white/60 border border-brand-dark/5 rounded-tl-md'
                  : 'bg-brand-dark text-brand-light rounded-tr-md'
              }`}>
                <p className={`text-[11px] leading-relaxed font-medium ${
                  isTeam ? 'text-brand-dark/70' : 'text-brand-light/90'
                }`}>
                  {msg.message}
                </p>
              </div>
              <div className={`flex items-center gap-2 mt-1.5 px-1 ${isTeam ? '' : 'flex-row-reverse'}`}>
                <span className="text-[8px] font-black text-brand-dark/20 uppercase tracking-widest">
                  {msg.senderName}
                </span>
                <span className="text-[8px] text-brand-dark/15 mono">
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-brand-dark/5">
        <div className="p-3 bg-brand-accent/5 border border-brand-accent/10 rounded-xl text-center">
          <p className="text-[9px] text-brand-accent uppercase tracking-[0.2em] font-black italic">
            {items.length} Messages in Secure Channel
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ClientMessages;
