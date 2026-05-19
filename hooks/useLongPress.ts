/**
 * useLongPress — fire a callback when the user holds a press for N ms
 * (touch) OR right-clicks (mouse). Returns event handler props you
 * spread onto the target element.
 *
 *   const longPress = useLongPress((pos) => openMenu(pos));
 *   <div {...longPress}>...</div>
 *
 * Design choices:
 *   • Touch: custom 500ms timer + 5px movement threshold. If the
 *     user starts dragging (any direction), cancel the timer so a
 *     swipe gesture wins instead of opening a menu.
 *   • Mouse: piggy-back on the standard contextmenu event so
 *     right-click works out of the box. preventDefault stops the
 *     browser's native menu from appearing.
 *   • The callback receives the trigger coordinates so the consumer
 *     can position a context menu at the user's finger / cursor.
 *   • On iOS, the browser fires its own callout (Copy / Share)
 *     after ~500ms. To suppress it, the consumer should add CSS:
 *       -webkit-touch-callout: none; user-select: none;
 *     on the target element.
 */

import { useCallback, useRef } from 'react';

export interface LongPressPosition {
  clientX: number;
  clientY: number;
}

interface LongPressOptions {
  /** Hold duration (ms) before the callback fires on touch. Default 500. */
  delay?: number;
  /** Movement threshold (px). Any move beyond this cancels the timer. Default 5. */
  threshold?: number;
}

export function useLongPress<E extends Element = HTMLElement>(
  callback: (pos: LongPressPosition) => void,
  options: LongPressOptions = {},
) {
  const { delay = 500, threshold = 5 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  // Mouse right-click — fires on desktop browsers. preventDefault
  // stops the browser's native context menu.
  const onContextMenu = useCallback((e: React.MouseEvent<E>) => {
    e.preventDefault();
    e.stopPropagation();
    callback({ clientX: e.clientX, clientY: e.clientY });
  }, [callback]);

  // Touch long-press — start a timer on pointerdown, cancel on move
  // beyond threshold, up, leave, or cancel.
  const onPointerDown = useCallback((e: React.PointerEvent<E>) => {
    // Only touch — mouse uses contextmenu above. Pen also gets long-press
    // (treat it like touch since stylus users tend to expect press-and-hold
    // gestures).
    if (e.pointerType === 'mouse') return;
    startRef.current = { x: e.clientX, y: e.clientY };
    const x = e.clientX;
    const y = e.clientY;
    timerRef.current = window.setTimeout(() => {
      callback({ clientX: x, clientY: y });
      timerRef.current = null;
      startRef.current = null;
    }, delay);
  }, [callback, delay]);

  const onPointerMove = useCallback((e: React.PointerEvent<E>) => {
    if (!startRef.current || timerRef.current === null) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > threshold) clearTimer();
  }, [clearTimer, threshold]);

  return {
    onContextMenu,
    onPointerDown,
    onPointerMove,
    onPointerUp: clearTimer,
    onPointerLeave: clearTimer,
    onPointerCancel: clearTimer,
  };
}
