import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import './bundle-slideover.css';

/**
 * ICP Detail slide-over — full bundle design.
 *
 * Source: livv-update / livv-os-pages.jsx :: ICPDetail
 *
 * 560px right-anchored slide-over with:
 *   - Header: avatar + name + status pill + sub-line (entry module / leads count)
 *   - 3-stat value strip (Impl ticket / Retainer / Active clients)
 *   - Tabs: Overview / Pains / Expansion / Playbook
 *   - Body content driven by selected tab
 *   - AI advisor block at the end of Overview
 *   - Action row footer (Edit / Convert to package)
 *
 * Saves edits to strategy_icps inline. Closes on Escape or overlay click.
 */

interface ICP {
  id: string;
  name: string;
  description?: string | null;
  pain_points: string[];
  entry_module: string | null;
  expansion_path: string[];
  market_geo: string[];
  ticket_implementation: number | null;
  ticket_retainer_monthly: number | null;
  status: 'active' | 'testing' | 'deprecated';
  vertical_playbook?: Record<string, any>;
  // Fields added by CoachFlow (may not exist on older rows)
  short_code?: string;
  color?: string;
  modules?: string[];
}

interface Props {
  icp: ICP;
  leadCount?: number;
  clientCount?: number;
  onClose: () => void;
  onSaved?: (icp: ICP) => void;
  onEdit?: () => void; // opens the legacy edit modal (full form)
}

const PALETTE = ['#C4A35A', '#6DBEDC', '#769268', '#F1ADD8', '#A855F7', '#5C1D18', '#8B5A2B'];

function hashColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(icp: ICP): string {
  if (icp.short_code && icp.short_code.length >= 2) return icp.short_code.toUpperCase();
  const parts = icp.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0] + (parts[2]?.[0] || '')).toUpperCase();
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `$${n.toLocaleString()}`;
}

type Tab = 'overview' | 'pains' | 'expansion' | 'playbook';

export const IcpDetailSlideOver: React.FC<Props> = ({
  icp, leadCount = 0, clientCount = 0, onClose, onSaved, onEdit,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const color = icp.color || hashColor(icp.name);

  // Modules (combine entry + expansion + extra)
  const modules = Array.from(new Set([
    ...(icp.entry_module ? [icp.entry_module] : []),
    ...(icp.expansion_path || []),
    ...(icp.modules || []),
  ]));

  // Default playbook (when icp.vertical_playbook is empty)
  const defaultPlaybook = [
    'W1 — Discovery + ICP definition for the client',
    'W2 — Positioning workshop + content axis',
    'W3 — Channel setup + 3-month cadence',
    'W4 — First publish + KPI baseline',
    'W5–W8 — Iterate weekly + monthly review',
  ];
  const playbook: string[] = Array.isArray(icp.vertical_playbook?.steps)
    ? icp.vertical_playbook!.steps
    : defaultPlaybook;

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Inline-edit a single field (status / etc)
  const patch = async (updates: Partial<ICP>) => {
    try {
      const { data, error } = await supabase
        .from('strategy_icps')
        .update(updates)
        .eq('id', icp.id)
        .select()
        .single();
      if (error) throw error;
      onSaved?.(data as any);
    } catch (err: any) {
      if (import.meta.env.DEV) console.warn('[ICP slide-over] patch failed', err);
    }
  };

  const sub = icp.entry_module
    ? `Entry module · ${icp.entry_module}${icp.expansion_path?.length ? ' → ' + icp.expansion_path[0] : ''}`
    : `${leadCount} leads · ${clientCount} active clients`;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bdl-so-overlay"
        onClick={onClose}
      />
      <motion.aside
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="bdl-so"
        style={{ ['--icp-color' as any]: color }}
      >
        {/* Header */}
        <header className="bdl-so-head">
          <div className="bdl-so-icp">{initials(icp)}</div>
          <div className="bdl-so-titleline">
            <div className="bdl-so-title">
              {icp.name}
              <span className="bdl-so-status"><span className="dot" />{icp.status}</span>
            </div>
            <div className="bdl-so-sub">
              <span>{sub}</span>
              {(icp.market_geo || []).length > 0 && (
                <>
                  <span className="sep">·</span>
                  <span>{icp.market_geo.join(', ')}</span>
                </>
              )}
            </div>
          </div>
          <div className="bdl-so-actions">
            {onEdit && (
              <button className="bdl-so-iconbtn" onClick={onEdit} title="Edit (full form)">
                <Icons.Edit size={14} />
              </button>
            )}
            <button className="bdl-so-iconbtn" onClick={onClose} title="Close (Esc)">
              <Icons.X size={14} />
            </button>
          </div>
        </header>

        {/* 3-stat value strip */}
        <div className="bdl-so-value">
          <div className="bdl-so-vbox">
            <div className="bdl-so-vlbl">Implementation</div>
            <div className="bdl-so-vval">
              {fmtMoney(icp.ticket_implementation)}
              {icp.ticket_implementation != null && <small>one-time</small>}
            </div>
          </div>
          <div className="bdl-so-vbox">
            <div className="bdl-so-vlbl">Retainer</div>
            <div className="bdl-so-vval">
              {fmtMoney(icp.ticket_retainer_monthly)}
              {icp.ticket_retainer_monthly != null && <small>/ mo</small>}
            </div>
          </div>
          <div className="bdl-so-vbox">
            <div className="bdl-so-vlbl">12-mo ARR</div>
            <div className="bdl-so-vval">
              {fmtMoney((icp.ticket_implementation || 0) + (icp.ticket_retainer_monthly || 0) * 12)}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="bdl-so-tabs">
          {([
            { id: 'overview' as const,  label: 'Overview' },
            { id: 'pains' as const,     label: 'Pain points', badge: icp.pain_points.length },
            { id: 'expansion' as const, label: 'Expansion',   badge: modules.length },
            { id: 'playbook' as const,  label: 'Playbook',    badge: playbook.length },
          ]).map(t => (
            <button
              key={t.id}
              className={`bdl-so-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && <span className="badge">{t.badge}</span>}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div className="bdl-so-body">
          {tab === 'overview' && (
            <>
              {/* Detail rows */}
              <div className="bdl-so-row">
                <span className="k"><Icons.Target size={12} />Status</span>
                <span className="v">
                  {(['active', 'testing', 'deprecated'] as const).map(s => (
                    <button
                      key={s}
                      className={`bdl-pill editable`}
                      style={{
                        background: icp.status === s ? color : undefined,
                        color: icp.status === s ? '#fff' : undefined,
                        borderColor: icp.status === s ? color : undefined,
                      }}
                      onClick={() => icp.status !== s && patch({ status: s })}
                    >
                      <span className="dot" style={{ background: icp.status === s ? '#fff' : color }} />
                      {s}
                    </button>
                  ))}
                </span>
              </div>

              <div className="bdl-so-row">
                <span className="k"><Icons.Edit size={12} />Description</span>
                <span className="v">
                  {icp.description || <span style={{ color: '#a1a1aa', fontStyle: 'italic' }}>No description</span>}
                </span>
              </div>

              <div className="bdl-so-row">
                <span className="k"><Icons.Briefcase size={12} />Entry module</span>
                <span className="v">
                  {icp.entry_module ? (
                    <span className="bdl-pill" style={{ background: `color-mix(in oklab, ${color} 12%, #fff)`, borderColor: `color-mix(in oklab, ${color} 30%, transparent)`, color: '#18181b', fontWeight: 500 }}>
                      <span className="dot" style={{ background: color }} />
                      {icp.entry_module}
                    </span>
                  ) : (
                    <span style={{ color: '#a1a1aa', fontStyle: 'italic' }}>Not defined</span>
                  )}
                </span>
              </div>

              {icp.market_geo && icp.market_geo.length > 0 && (
                <div className="bdl-so-row">
                  <span className="k"><Icons.Globe size={12} />Markets</span>
                  <span className="v">
                    {icp.market_geo.map(g => (
                      <span key={g} className="bdl-pill">{g}</span>
                    ))}
                  </span>
                </div>
              )}

              {/* AI advisor block */}
              <div className="bdl-so-ai">
                <div className="bdl-so-ai-ic">
                  <Icons.Sparkles size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="bdl-so-ai-eyebrow">AI advisor</span>
                  <div className="bdl-so-ai-text">
                    {icp.pain_points.length === 0
                      ? <>This ICP doesn't have pain points yet. Adding 3-5 specific pains will dramatically improve outreach drafts and content angles.</>
                      : icp.ticket_implementation == null && icp.ticket_retainer_monthly == null
                        ? <>This ICP is missing pricing. Set ticket values to compute 12-mo ARR and unlock package recommendations.</>
                        : <>This ICP is well-defined ({icp.pain_points.length} pains, pricing set). Ready to build packages and run outreach against it.</>
                    }
                  </div>
                  <div className="bdl-so-ai-cta">
                    {icp.pain_points.length === 0 && (
                      <button className="bdl-so-ai-btn" onClick={() => setTab('pains')}>
                        <Icons.Plus size={11} /> Add pain points
                      </button>
                    )}
                    {(icp.ticket_implementation == null || icp.ticket_retainer_monthly == null) && onEdit && (
                      <button className="bdl-so-ai-btn" onClick={onEdit}>
                        <Icons.DollarSign size={11} /> Set pricing
                      </button>
                    )}
                    <button className="bdl-so-ai-btn ghost">
                      <Icons.Briefcase size={11} /> Build package
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'pains' && (
            <>
              <p className="bdl-so-section">{icp.pain_points.length} pain points</p>
              {icp.pain_points.length === 0 ? (
                <div style={{
                  padding: 24, textAlign: 'center', color: '#a1a1aa',
                  border: '1px dashed rgba(214,209,199,0.7)', borderRadius: 11,
                  fontSize: 12.5, fontStyle: 'italic',
                }}>
                  No pain points yet. Edit the ICP to add them — they fuel outreach + content + AI drafts.
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  {icp.pain_points.map((p, i) => (
                    <li key={i} className="bdl-so-step">
                      <span className="bdl-so-step-num">{String(i + 1).padStart(2, '0')}</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'expansion' && (
            <>
              <p className="bdl-so-section">Module journey</p>
              {modules.length === 0 ? (
                <div style={{
                  padding: 24, textAlign: 'center', color: '#a1a1aa',
                  border: '1px dashed rgba(214,209,199,0.7)', borderRadius: 11,
                  fontSize: 12.5, fontStyle: 'italic',
                }}>
                  No expansion path defined. Set the entry module + expansion modules to unlock upsell recommendations.
                </div>
              ) : (
                <div className="bdl-so-modules">
                  {modules.map((m, i) => (
                    <React.Fragment key={m}>
                      <span
                        className="bdl-pill"
                        style={{
                          background: i === 0 ? `color-mix(in oklab, ${color} 12%, #fff)` : undefined,
                          borderColor: i === 0 ? `color-mix(in oklab, ${color} 30%, transparent)` : undefined,
                          color: i === 0 ? '#18181b' : undefined,
                          fontWeight: i === 0 ? 500 : 400,
                        }}
                      >
                        {i === 0 && <span className="dot" style={{ background: color }} />}
                        {m}
                      </span>
                      {i < modules.length - 1 && <span className="arrow">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              )}
              <p className="bdl-so-section" style={{ marginTop: 24 }}>Pricing per stage</p>
              <div className="bdl-so-row">
                <span className="k"><Icons.DollarSign size={12} />Implementation</span>
                <span className="v">{fmtMoney(icp.ticket_implementation)} one-time</span>
              </div>
              <div className="bdl-so-row">
                <span className="k"><Icons.RefreshCw size={12} />Retainer</span>
                <span className="v">{fmtMoney(icp.ticket_retainer_monthly)} / month</span>
              </div>
              <div className="bdl-so-row">
                <span className="k"><Icons.Chart size={12} />12-mo ARR</span>
                <span className="v" style={{ fontWeight: 500 }}>
                  {fmtMoney((icp.ticket_implementation || 0) + (icp.ticket_retainer_monthly || 0) * 12)}
                </span>
              </div>
            </>
          )}

          {tab === 'playbook' && (
            <>
              <p className="bdl-so-section">{playbook.length}-step deployment playbook</p>
              <p style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5, margin: '0 0 14px' }}>
                The default sequence the team follows when onboarding a client matching this ICP.
                Override with <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#3f3f46' }}>vertical_playbook.steps</code>.
              </p>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {playbook.map((step, i) => (
                  <li key={i} className="bdl-so-step">
                    <span className="bdl-so-step-num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {/* Footer actions — sticky at bottom of body */}
          <div className="bdl-so-action-row">
            {onEdit && (
              <button className="bdl-so-action" onClick={onEdit}>
                <Icons.Edit size={13} /> Edit ICP
              </button>
            )}
            <button className="bdl-so-action primary">
              <Icons.Briefcase size={13} /> Build package
            </button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>,
    document.body
  );
};
