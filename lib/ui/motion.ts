/**
 * Shared motion presets — iOS-feel spring physics tuned to match
 * Apple's UIKit defaults. Centralized so every surface that animates
 * (Brief, AiAdvisor, future modals/sheets) gets the same feel without
 * each one inventing its own numbers.
 *
 * If something feels off — bouncier, snappier, slower — change one
 * value here and everywhere updates. Don't tweak per-component.
 *
 * Tuning notes:
 *   • Spring stiffness 300-400 + damping 25-28 = "critically damped"
 *     iOS feel. Snappy arrival, no overshoot.
 *   • TAP_SCALE 0.97 mirrors UIButton's default highlighted state.
 *   • SWIPE_THRESHOLD 80px is what Mail.app uses (calibrated for
 *     ~340px-wide cards in our right panel).
 */
import type { Transition } from 'framer-motion';

/** Quick taps, hover lift, dismissals. Highest stiffness. */
export const SPRING_TAP: Transition    = { type: 'spring', stiffness: 400, damping: 25 };

/** Element entering view (cards mounting, messages appearing). */
export const SPRING_ENTER: Transition  = { type: 'spring', stiffness: 320, damping: 26 };

/** Layout animations (re-orderings, list shrink/grow). Slightly softer. */
export const SPRING_LAYOUT: Transition = { type: 'spring', stiffness: 300, damping: 28 };

/** Scale applied during whileTap. iOS uses ~0.97 for buttons. */
export const TAP_SCALE = 0.97;

/** Distance (px) past which a horizontal swipe commits its action. */
export const SWIPE_THRESHOLD = 80;
/** Velocity (px/s) past which a quick flick commits even below the
 *  distance threshold. Lets a sharp flick fire the action without
 *  having to drag all the way to 80px. */
export const SWIPE_VELOCITY = 500;
