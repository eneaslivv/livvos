// AuroraFab — floating launcher (bottom-right) that opens the AuroraDock.
//
// v2 (2026-05-22): rewriten "soft" tras feedback del user — antes competía
// con el AiAdvisor legacy en la misma esquina y se sentía estridente. Ahora:
//   • Tamaño 44px (en lugar de 56) — menos invasivo en la ventana
//   • Color neutro ink + ring gold sutil (en lugar de full color del agente)
//   • Sparkle interno mantiene el accent del agente activo (sutileza)
//   • Hover: ring expand suave + lift sutil (no scale dramático)
//   • Spring entrance + breath animation lenta
//   • Tooltip visible "Aurora" con el agente actual

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useAurora } from '../../context/AuroraContext';
import { auroraAgents, cssVarsForAgent } from '../../lib/aurora/tokens';
import { AuroraDock } from './AuroraDock';

/**
 * Detects when ANY modal/overlay is open so the floating FAB can step
 * aside instead of covering the modal's footer (e.g. the Cancel button).
 * Generic on purpose — no per-modal wiring: the shared Modal / SlidePanel
 * primitives lock body scroll (`body.style.overflow = 'hidden'`), and
 * every modal renders a full-screen `.fixed.inset-0` backdrop. Either
 * signal hides the FAB, so it works for every modal automatically.
 */
function useOverlayOpen(): boolean {
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const bodyLocked = document.body.style.overflow === 'hidden';
      // Only count interaction-blocking backdrops — a real modal captures
      // clicks, while decorative full-screen layers (e.g. LiveCursors) are
      // pointer-events:none and must NOT hide the FAB.
      const hasBackdrop = Array.from(document.querySelectorAll('.fixed.inset-0'))
        .some(el => window.getComputedStyle(el as HTMLElement).pointerEvents !== 'none');
      setOverlayOpen(bodyLocked || hasBackdrop);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    const obs = new MutationObserver(schedule);
    // Body attrs catch the scroll-lock; body childList catches portaled
    // modal backdrops (Modal/SlidePanel createPortal into <body>).
    obs.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return overlayOpen;
}

export const AuroraFab: React.FC = () => {
  const { open, setOpen, agent, mode } = useAurora();
  const overlayOpen = useOverlayOpen();
  const meta = auroraAgents[agent];
  const label = mode === 'unified' ? 'Livv Assistant' : meta.display_name;

  return (
    <>
      <AnimatePresence>
        {!open && !overlayOpen && (
          <motion.button
            key="fab"
            aria-label={`Abrir ${label}`}
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24 }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
            // Mobile: lifted above the BottomTabBar (h-16 + safe area) so it
            // never covers the Calendar/More tabs, and icon-only to stay out
            // of the way. Desktop keeps the labelled pill bottom-right.
            className="group fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] right-4 md:bottom-5 md:right-5 z-[60] inline-flex items-center gap-2 h-11 pl-3 pr-3 sm:pr-4 rounded-full bg-zinc-900/95 dark:bg-zinc-100/95 text-white dark:text-zinc-900 backdrop-blur-sm border border-white/10 dark:border-zinc-900/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35),0_2px_4px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4),0_4px_8px_rgba(0,0,0,0.12)] transition-shadow"
            style={cssVarsForAgent(agent)}
            title={`${label} · ${meta.tagline}`}
          >
            {/* Sparkle dot — gold accent del agente, breath animation */}
            <motion.span
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'var(--aurora-accent)' }}
            >
              <Sparkles size={13} strokeWidth={2.4} className="text-white" />
              {/* Glow halo — sutilísimo, accent del agent */}
              <span
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-50 transition-opacity blur-md"
                style={{ background: 'var(--aurora-accent)' }}
                aria-hidden
              />
            </motion.span>

            <span className="hidden sm:inline text-[12px] font-medium tracking-tight pr-0.5">
              Aurora
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && <AuroraDock />}
      </AnimatePresence>
    </>
  );
};
