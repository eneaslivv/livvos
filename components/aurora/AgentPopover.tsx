/**
 * AgentPopover — hover card que aparece sobre un chip del rail mostrando
 * el pitch marketinero del agente + ejemplos clickables.
 *
 * Diseño:
 *   - Aparece arriba/debajo del chip con el accent color del agente
 *   - Pitch en italics, tagline + domain en cabecera
 *   - 3-4 example prompts como botones — click setea el input del chat
 *   - Animación de entrada suave (180ms ease)
 *   - Hover-bridge para que no se cierre cuando el mouse pasa del chip al popover
 *
 * Posicionamiento: floating arriba del chip por default. Si no entra
 * (chip muy cerca del top de la pantalla), se ubica debajo.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentMeta } from '../../types/aurora';

interface AgentPopoverProps {
  agent: AgentMeta;
  anchorRef: React.RefObject<HTMLElement>;
  onExamplePick?: (prompt: string) => void;
  /** Forzar visibilidad — útil para testing. Default: hover. */
  open?: boolean;
  /** Lado preferido. Auto-flip si no entra. */
  prefer?: 'top' | 'bottom';
}

export const AgentPopover: React.FC<AgentPopoverProps> = ({
  agent,
  anchorRef,
  onExamplePick,
  open: forceOpen,
  prefer = 'top',
}) => {
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; placement: 'top' | 'bottom' } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const open = forceOpen ?? hovered;

  // Listen to hover on anchor — covers the chip element directly.
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const onEnter = () => setHovered(true);
    const onLeave = (e: MouseEvent) => {
      // Hover-bridge: si el cursor entra al popover, no cerramos.
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && popoverRef.current?.contains(relatedTarget)) return;
      // Pequeño delay para evitar flicker entre chip y popover si hay gap
      setTimeout(() => {
        if (!popoverRef.current?.matches(':hover')) setHovered(false);
      }, 80);
    };
    anchor.addEventListener('mouseenter', onEnter);
    anchor.addEventListener('mouseleave', onLeave);
    return () => {
      anchor.removeEventListener('mouseenter', onEnter);
      anchor.removeEventListener('mouseleave', onLeave);
    };
  }, [anchorRef]);

  // Reposition when shown
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const popW = 320; // matching min-w-[320px] below
    const popH = 220; // approximate; auto-grows
    const margin = 8;
    // Center horizontally on anchor
    let left = anchor.left + anchor.width / 2 - popW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));
    // Try preferred side, flip if doesn't fit
    let placement: 'top' | 'bottom' = prefer;
    let top: number;
    if (placement === 'top') {
      top = anchor.top - popH - margin;
      if (top < margin) { placement = 'bottom'; top = anchor.bottom + margin; }
    } else {
      top = anchor.bottom + margin;
      if (top + popH > window.innerHeight - margin) { placement = 'top'; top = anchor.top - popH - margin; }
    }
    setPosition({ left, top, placement });
  }, [open, anchorRef, prefer]);

  return (
    <AnimatePresence>
      {open && position && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.96, y: position.placement === 'top' ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: position.placement === 'top' ? 6 : -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            left: position.left,
            top: position.top,
            zIndex: 70,
            minWidth: 320,
            maxWidth: 340,
            ['--agent-accent' as any]: agent.accent_hex,
            ['--agent-soft' as any]: agent.accent_soft,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden"
        >
          {/* Header — accent ribbon + avatar + name */}
          <div
            className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-start gap-3"
            style={{
              background: `linear-gradient(135deg, color-mix(in oklab, ${agent.accent_hex} 8%, white) 0%, white 100%)`,
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: agent.accent_hex }}
            >
              <span className="font-bold text-white text-[12px] tracking-wider">
                {agent.display_name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {agent.display_name}
                </h4>
                {agent.group === 'livv_os' && (
                  <span className="text-[9px] font-mono uppercase tracking-[0.16em] px-1.5 py-0.5 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
                    livv OS
                  </span>
                )}
              </div>
              <div className="text-[11px] italic text-zinc-600 dark:text-zinc-300 mt-0.5 leading-snug">
                "{agent.tagline}"
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mt-1 leading-snug">
                {agent.domain}
              </div>
            </div>
          </div>

          {/* Pitch */}
          {agent.pitch && (
            <div className="px-4 py-3">
              <p className="text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed">
                {agent.pitch}
              </p>
            </div>
          )}

          {/* Example prompts */}
          {agent.example_prompts && agent.example_prompts.length > 0 && (
            <div className="px-4 pb-3">
              <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-zinc-400 mb-1.5">
                Probá preguntar
              </div>
              <div className="flex flex-col gap-1">
                {agent.example_prompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onExamplePick?.(prompt); setHovered(false); }}
                    className="text-left text-[11.5px] px-2 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
