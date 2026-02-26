
import React, { useState } from 'react';
import { CredentialItem } from '../types';
import { motion } from 'framer-motion';
import { KeyRound, Copy, Check, Eye, EyeOff } from 'lucide-react';

const Vault: React.FC<{ credentials?: CredentialItem[] }> = ({ credentials }) => {
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const items = credentials && credentials.length
    ? credentials
    : [
        { id: '1', service: 'Panel de Admin', user: 'admin@livv.com', pass: 'secure-pass-2026' },
        { id: '2', service: 'Base de Datos', user: 'db_admin', pass: 'p_secure_88!v2' },
      ];

  const toggle = (id: string) => setShowPass(p => ({ ...p, [id]: !p[id] }));
  const copy = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white rounded-2xl border border-zinc-200/60 p-6 md:p-8 h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <KeyRound size={13} className="text-zinc-300" />
          Accesos
        </h3>
      </div>

      <div className="space-y-2.5 flex-1">
        {items.map(c => (
          <div key={c.id} className="p-3.5 bg-zinc-50/80 border border-zinc-100 rounded-xl hover:border-zinc-200 transition-all group">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[12px] font-semibold text-zinc-600">{c.service}</p>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => toggle(c.id)} className="p-1.5 text-zinc-300 hover:text-zinc-500 rounded-md hover:bg-white transition-all">
                  {showPass[c.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button onClick={() => copy(c.pass || '', c.id)} className="p-1.5 text-zinc-300 hover:text-zinc-500 rounded-md hover:bg-white transition-all">
                  {copied === c.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-300">Usuario</span>
                <span className="text-zinc-500 font-mono font-medium">{c.user || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-300">Contraseña</span>
                <span className="text-zinc-500 font-mono font-medium tracking-wider">
                  {showPass[c.id] ? c.pass : '••••••••'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default Vault;
