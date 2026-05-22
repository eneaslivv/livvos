// AuroraFab — floating button (bottom-right) that opens the AuroraDock.
// Color cycles to whichever agent is currently active.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useAurora } from '../../context/AuroraContext';
import { auroraAgents, cssVarsForAgent } from '../../lib/aurora/tokens';
import { AuroraDock } from './AuroraDock';

export const AuroraFab: React.FC = () => {
  const { open, setOpen, agent, mode } = useAurora();
  const meta = auroraAgents[agent];
  const label = mode === 'unified' ? 'Livv Assistant' : meta.display_name;

  return (
    <>
      {!open && (
        <button
          aria-label={`Abrir ${label}`}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-105 transition-transform"
          style={{ ...cssVarsForAgent(agent), background: 'var(--aurora-accent)' }}
          title={`${label} · ${meta.tagline}`}
        >
          <motion.span
            animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-5 h-5 flex items-center justify-center"
          >
            <Sparkles size={20} strokeWidth={2.4} />
          </motion.span>
        </button>
      )}
      <AnimatePresence>
        {open && <AuroraDock />}
      </AnimatePresence>
    </>
  );
};
