/**
 * ContextMenu — floating menu rendered via portal, positioned at the
 * caller-supplied coordinates (typically the user's finger/cursor at
 * the moment of long-press / right-click).
 *
 * Visual: iOS-style — rounded card with backdrop blur, items with
 * icons, springs in from a slight scale-down, springs out on close.
 *
 * UX rules:
 *   • Clicking an item fires its onSelect AND closes the menu.
 *   • Clicking the overlay closes without firing anything.
 *   • Escape key closes.
 *   • If the menu would overflow the viewport, it's mirrored
 *     horizontally (right-aligned) and/or vertically (above the
 *     point instead of below). No need for complex layout math —
 *     a small CSS clamp handles it.
 *
 *   const [pos, setPos] = useState(null);
 *   <Card onContextMenu={(e) => { e.preventDefault(); setPos({x:e.clientX, y:e.clientY}); }} />
 *   {pos && <ContextMenu position={pos} onClose={() => setPos(null)} items={[...]} />}
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING_ENTER, SPRING_TAP } from '../../lib/ui/motion';

export interface ContextMenuItem {
  /** Icon node (typically <Icons.X size={13} />). */
  icon: React.ReactNode;
  label: string;
  /** Fired when the item is selected. The menu auto-closes after. */
  onSelect: () => void;
  /** Renders in rose tones — use for delete / discard. */
  destructive?: boolean;
  /** Disabled items don't fire onSelect and render muted. */
  disabled?: boolean;
}

interface ContextMenuProps {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  /** Header line shown above the items (e.g. the row's title).
   *  Optional — omit for menus that don't need an anchor. */
  header?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ position, items, onClose, header }) => {
  // Escape closes — common keyboard pattern.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Position math — clamp to viewport so the menu never lands off-screen.
  // Width 200 / approx-height (n items × 36 + 16 padding + optional header).
  const itemHeight = 36;
  const padding    = 14;
  const headerH    = header ? 28 : 0;
  const estHeight  = items.length * itemHeight + padding + headerH;
  const estWidth   = 200;
  const viewportW  = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH  = typeof window !== 'undefined' ? window.innerHeight : 768;
  // Anchor to the click point; flip when near right/bottom edges.
  const left = position.x + estWidth + 12 > viewportW
    ? Math.max(8, position.x - estWidth)
    : position.x + 4;
  const top  = position.y + estHeight + 12 > viewportH
    ? Math.max(8, position.y - estHeight)
    : position.y + 4;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onClick={onClose}
        // Catch any click outside the menu — closes without firing
        // any item. The menu itself stops propagation so clicks
        // inside don't bubble up here.
        className="fixed inset-0 z-[70] bg-zinc-900/5 dark:bg-black/15"
      >
        <motion.div
          role="menu"
          aria-label="Card actions"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
          transition={SPRING_ENTER}
          style={{ top, left }}
          className="absolute min-w-[200px] max-w-[260px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl border border-zinc-200/70 dark:border-zinc-800 shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden"
        >
          {header && (
            <div className="px-3 pt-2 pb-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 truncate border-b border-zinc-100 dark:border-zinc-800/60">
              {header}
            </div>
          )}
          <div className="py-1">
            {items.map((it, i) => (
              <motion.button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                whileTap={!it.disabled ? { scale: 0.97, transition: SPRING_TAP } : undefined}
                onClick={() => {
                  if (it.disabled) return;
                  it.onSelect();
                  onClose();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  it.destructive
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="shrink-0 w-4 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                  {it.icon}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};
