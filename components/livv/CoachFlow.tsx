import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../ui/Icons';
import './LivvBundleDesign.css';

/**
 * CoachFlow — multi-step onboarding wizard shell.
 *
 * Source: livv-update bundle / livv-os-onboarding.jsx
 *
 * Renders a fullscreen modal with:
 *   - Top: progress dots + "Step X of Y" + Skip onboarding link
 *   - Left pane: step tag, editorial title (with .accent spans), description,
 *     "© Why this matters" callout (gold), and the step's custom form
 *   - Right pane: animated visual mockup that builds up as the user fills fields
 *   - Footer: Back / Continue + auto-save indicator
 *
 * Each flow definition contains an array of `steps`, where each step has:
 *   { title, desc, why, fields: ({data, set}) => JSX, canNext: (d) => bool }
 *
 * Submit a flow with `<CoachFlow flow={ICP_FLOW} onComplete={data => ...} onClose={...} />`.
 *
 * Keyboard: Cmd/Ctrl+Enter to advance.
 */

export interface CoachStep<T = any> {
  title: React.ReactNode;
  desc: React.ReactNode;
  why: string;
  fields: (ctx: { data: T; set: <K extends keyof T>(k: K, v: T[K]) => void }) => React.ReactNode;
  /** Returns true if the user can advance to the next step. */
  canNext: (data: T) => boolean;
}

export interface CoachFlowDef<T = any> {
  tag: string;
  steps: CoachStep<T>[];
  /** Renders alongside the form on the right pane — builds up per step. */
  visual?: (ctx: { data: T; step: number; total: number }) => React.ReactNode;
  /** Initial data for the form */
  initial?: Partial<T>;
}

interface CoachFlowProps<T = any> {
  flow: CoachFlowDef<T>;
  onComplete: (data: T) => void;
  onClose: () => void;
  /** When true, renders without the fullscreen overlay — sits inside
   *  whatever container the parent provides. Used for "setup mode" where
   *  the page chrome (tabs, breadcrumb) stays visible above the wizard. */
  inline?: boolean;
  /** Optional secondary CTA label for the bottom-left when inline (e.g. "Skip onboarding"). */
  skipLabel?: string;
}

export function CoachFlow<T extends Record<string, any> = Record<string, any>>({
  flow,
  onComplete,
  onClose,
  inline = false,
  skipLabel,
}: CoachFlowProps<T>) {
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<T>((flow.initial as T) || ({} as T));
  const [out, setOut] = useState(false);

  const step = flow.steps[idx];
  const total = flow.steps.length;

  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    setData(d => ({ ...d, [k]: v }));
  }, []);

  const advance = useCallback(() => {
    if (idx + 1 >= total) {
      onComplete(data);
      return;
    }
    setOut(true);
    setTimeout(() => {
      setIdx(i => i + 1);
      setOut(false);
    }, 220);
  }, [idx, total, data, onComplete]);

  const back = useCallback(() => {
    if (idx === 0) return;
    setOut(true);
    setTimeout(() => {
      setIdx(i => i - 1);
      setOut(false);
    }, 220);
  }, [idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && step?.canNext(data)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, data, advance, onClose]);

  if (!step) return null;

  const body = (
    <>
      <div className="coach-progress">
        <span className="coach-prog-label">
          Step <strong>{String(idx + 1).padStart(2, '0')}</strong> of {String(total).padStart(2, '0')}
        </span>
        <div className="coach-prog-dots">
          {flow.steps.map((_, i) => (
            <span
              key={i}
              className={`coach-dot ${i < idx ? 'done' : i === idx ? 'current' : ''}`}
            />
          ))}
        </div>
        <button className="coach-skip" onClick={onClose}>
          {skipLabel || 'Skip onboarding'}
        </button>
      </div>

      <div className="coach">
        <div className="coach-l">
          <div className={`coach-step ${out ? 'out' : ''}`}>
            <span className="coach-step-tag">
              <span className="n">{idx + 1}</span>
              {flow.tag}
              <span className="of">· {idx + 1}/{total}</span>
            </span>
            <h2 className="coach-title">{step.title}</h2>
            <p className="coach-desc">{step.desc}</p>
            <div className="coach-why">
              <span className="coach-why-ic"><Icons.Sparkles size={13} /></span>
              <div className="coach-why-body">
                <span className="coach-why-eyebrow">Why this matters</span>
                <span className="coach-why-text">{step.why}</span>
              </div>
            </div>
            {step.fields({ data, set })}
          </div>
          <div className="coach-foot">
            <button
              type="button"
              className="coach-btn"
              onClick={back}
              disabled={idx === 0}
            >
              <Icons.ChevronLeft size={13} />
              Back
            </button>
            <button
              type="button"
              className="coach-btn primary"
              onClick={advance}
              disabled={!step.canNext(data)}
            >
              {idx + 1 === total ? 'Finish & save' : 'Continue'}
              <Icons.ChevronRight size={13} />
              <span className="kbd">⌘↵</span>
            </button>
            <span className="coach-foot-meta">
              Auto-saved · {Math.max(1, total - idx - 1)} {total - idx - 1 === 1 ? 'step' : 'steps'} left
            </span>
          </div>
        </div>
        <div className="coach-r">
          {flow.visual ? flow.visual({ data, step: idx, total }) : null}
        </div>
      </div>
    </>
  );

  // Inline mode — render as a normal block inside the parent container.
  // The page chrome (tabs, breadcrumb) stays visible above.
  if (inline) {
    return (
      <div className="coach-shell coach-shell--inline">
        {body}
      </div>
    );
  }

  // Fullscreen overlay mode — original behavior.
  return createPortal(
    <div className="coach-shell">
      {body}
    </div>,
    document.body
  );
}
