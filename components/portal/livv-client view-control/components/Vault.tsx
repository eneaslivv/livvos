
import React, { useState } from 'react';
import { CredentialItem } from '../types';
import { motion } from 'framer-motion';
import { Lock, Copy, Check, Eye, EyeOff, ShieldCheck, Fingerprint } from 'lucide-react';

const Vault: React.FC<{ credentials?: CredentialItem[] }> = ({ credentials }) => {
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const items = credentials && credentials.length
    ? credentials
    : [
        { id: '1', service: 'AWS Master Instance', user: 'admin_livv_v2', pass: 'AMZ-LIVV-2024-XP' },
        { id: '2', service: 'Supabase Mainnet', user: 'db_architect_x', pass: 'p_secure_88!v2' },
      ];

  const togglePass = (id: string) => {
    setShowPass(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card gradient-border-light p-8 h-full flex flex-col"
    >
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xs font-black text-brand-dark/30 uppercase tracking-[0.3em] flex items-center gap-2">
          <Lock size={14} className="text-brand-accent" />
          The Vault
        </h3>
        <span className="flex items-center gap-2 text-[9px] px-3 py-1 bg-brand-accent/5 border border-brand-accent/10 text-brand-accent rounded-full mono font-black uppercase tracking-widest shadow-sm">
          <ShieldCheck size={11} />
          ZKP E2EE
        </span>
      </div>

      <div className="space-y-4 flex-1">
        {items.map(cred => (
          <div key={cred.id} className="p-5 bg-white border border-brand-dark/5 rounded-[1.25rem] group hover:border-brand-accent/20 transition-all duration-500 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                <p className="text-[10px] font-black text-brand-dark/80 uppercase tracking-widest">{cred.service}</p>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => togglePass(cred.id)} className="text-brand-dark/20 hover:text-brand-accent p-2 rounded-lg hover:bg-brand-accent/5 transition-all">
                  {showPass[cred.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button onClick={() => copyToClipboard(cred.pass, cred.id)} className="text-brand-dark/20 hover:text-brand-accent p-2 rounded-lg hover:bg-brand-accent/5 transition-all">
                  {copied === cred.id ? <Check size={16} className="text-brand-accent" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center opacity-40">
                <span className="text-[9px] uppercase text-brand-dark mono font-black tracking-widest">ID</span>
                <span className="text-[10px] text-brand-dark mono font-bold">{cred.user}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase text-brand-dark mono font-black tracking-widest opacity-40">Secret</span>
                <span className="text-xs text-brand-dark mono font-bold tracking-[0.2em]">
                  {showPass[cred.id] ? cred.pass : '••••••••••••'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-8 w-full py-4 bg-brand-dark text-brand-light hover:bg-brand-accent rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-brand-dark/10 group">
        <Fingerprint size={18} className="opacity-50 group-hover:opacity-100 transition-opacity" />
        Authenticate Access
      </button>
    </motion.div>
  );
};

export default Vault;
