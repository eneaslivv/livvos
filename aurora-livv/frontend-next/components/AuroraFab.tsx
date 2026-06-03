'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuroraDock } from './AuroraDock';
import type { AgentSlug } from '@/lib/tokens';
import { agents, cssVarsForAgent } from '@/lib/tokens';

export function AuroraFab() {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<AgentSlug>('solara');
  const [seed, setSeed] = useState<{ text: string; agent: AgentSlug } | null>(null);

  useEffect(() => {
    function onSend(e: any) {
      const detail = (e as CustomEvent).detail;
      setAgent(detail.agent);
      setSeed({ text: detail.text, agent: detail.agent });
      setOpen(true);
    }
    window.addEventListener('aurora-send', onSend as any);
    return () => window.removeEventListener('aurora-send', onSend as any);
  }, []);

  return (
    <>
      {!open && (
        <button
          className="aurora-fab"
          style={cssVarsForAgent(agent)}
          onClick={() => setOpen(true)}
          aria-label={`Abrir ${agents[agent].display_name}`}
        >
          <span className="orb" />
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 55 }}
          >
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
              <AuroraDock
                agent={agent}
                onChangeAgent={setAgent}
                onClose={() => setOpen(false)}
                seed={seed}
                onConsumeSeed={() => setSeed(null)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
