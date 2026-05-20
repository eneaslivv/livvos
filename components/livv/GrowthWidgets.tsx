import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_ENTER } from '../../lib/ui/motion';
import './bundle-growth-widgets.css';

/**
 * Growth Dashboard widgets — bundle-faithful implementations of
 * ThisWeek, ActivityFeed, and WeeklySnapshot.
 * Source: livv-update / livv-os-growth.jsx
 *
 * These three sit in a 2-col + full-width row below the KPI strip
 * and phase track in GrowthDashboard.
 */

// Module color map — matches the bundle's MOD_COLOR
const MOD_COLOR: Record<string, string> = {
  Sales:    '#C4A35A',
  Content:  '#F1ADD8',
  Strategy: '#6DBEDC',
  Scaling:  '#A855F7',
  Delivery: '#769268',
  Finance:  '#769268',
  Brief:    '#5C1D18',
};

// ─────────────────────────────────────────────────────────────
// THIS WEEK — checkable priority list
// ─────────────────────────────────────────────────────────────
interface ThisWeekItem {
  id: string;
  title: string;
  mod: string;          // module name (Sales/Content/etc)
  when: string;         // display label
  hot?: boolean;        // urgent → red "when"
  taskId?: string;      // optional link to a real task
}

interface ThisWeekProps {
  items?: ThisWeekItem[];
  onItemClick?: (item: ThisWeekItem) => void;
  onViewAll?: () => void;
}

// Default fallback items — used when no live data passed
const DEFAULT_THIS_WEEK: ThisWeekItem[] = [
  { id: 'tw1', title: 'Build Mulberry proposal v2',     mod: 'Sales',    when: 'Today',  hot: true },
  { id: 'tw2', title: 'Sunnyside checkpoint review',     mod: 'Delivery', when: 'Today',  hot: true },
  { id: 'tw3', title: 'Publish "Cremona case study"',    mod: 'Content',  when: 'Wed' },
  { id: 'tw4', title: 'Approve Q3 hire — Senior strat.', mod: 'Scaling',  when: 'Thu' },
  { id: 'tw5', title: 'Cash flow recompute',              mod: 'Finance',  when: 'Fri' },
];

export const ThisWeekCard: React.FC<ThisWeekProps> = ({ items, onItemClick, onViewAll }) => {
  const list = items && items.length > 0 ? items : DEFAULT_THIS_WEEK;
  const [done, setDone] = useState<Record<string, boolean>>({});
  return (
    <section className="bdg-w-card">
      <header className="bdg-w-card-head">
        <span className="bdg-w-card-title">
          <span className="ic"><Icons.Check size={11} /></span>
          This week
          <span className="count">{list.length}</span>
        </span>
        {onViewAll && (
          <button type="button" className="bdg-w-card-action" onClick={onViewAll}>
            View all →
          </button>
        )}
      </header>
      <div className="bdg-w-card-body">
        {list.map((t, idx) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            className="bdg-w-tw-item"
            style={{ ['--mod-c' as any]: MOD_COLOR[t.mod] || '#71717a' }}
            onClick={() => onItemClick?.(t)}
          >
            <button
              type="button"
              className={`bdg-w-tw-check ${done[t.id] ? 'done' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setDone(p => ({ ...p, [t.id]: !p[t.id] }));
              }}
              aria-label={done[t.id] ? 'Mark undone' : 'Mark done'}
            >
              {done[t.id] && <Icons.Check size={9} strokeWidth={3} />}
            </button>
            <div className="bdg-w-tw-body">
              <div className={`bdg-w-tw-title ${done[t.id] ? 'done' : ''}`}>{t.title}</div>
              <div className="bdg-w-tw-meta">
                <span className="bdg-w-tw-mod">{t.mod}</span>
                <span className={`bdg-w-tw-when ${t.hot ? 'hot' : ''}`}>{t.when}</span>
              </div>
            </div>
            <span className="bdg-w-tw-arrow"><Icons.ChevronRight size={12} /></span>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────
// ACTIVITY FEED — recent cross-module activity
// ─────────────────────────────────────────────────────────────
interface ActivityFeedItem {
  who: string;
  what: string;
  mod: string;
  icon: keyof typeof Icons;
  when: string;
}

interface ActivityFeedProps {
  items?: ActivityFeedItem[];
  onOpenFeed?: () => void;
}

const DEFAULT_ACTIVITY: ActivityFeedItem[] = [
  { who: 'Eneas',  what: 'shipped pricing page v2',          mod: 'Content',  icon: 'Check',   when: '12m ago' },
  { who: 'Lucía',  what: 'completed Sunnyside checkpoint',   mod: 'Delivery', icon: 'CheckCircle', when: '1h ago' },
  { who: 'Agent',  what: 'flagged 3 stale leads — proposed follow-ups', mod: 'Sales', icon: 'Sparkles', when: '2h ago' },
  { who: 'Mateo',  what: 'published "Why agencies miss cadence"', mod: 'Content', icon: 'Edit', when: '3h ago' },
  { who: 'System', what: 'auto-created project for Cremona Capital won', mod: 'Sales', icon: 'Briefcase', when: 'Yesterday' },
];

export const ActivityFeedCard: React.FC<ActivityFeedProps> = ({ items, onOpenFeed }) => {
  const list = items && items.length > 0 ? items : DEFAULT_ACTIVITY;
  return (
    <section className="bdg-w-card">
      <header className="bdg-w-card-head">
        <span className="bdg-w-card-title">
          <span className="ic"><Icons.Activity size={11} /></span>
          Activity
        </span>
        {onOpenFeed && (
          <button type="button" className="bdg-w-card-action" onClick={onOpenFeed}>
            Open feed →
          </button>
        )}
      </header>
      <div className="bdg-w-card-body">
        {list.map((a, i) => {
          const IconCmp = (Icons as any)[a.icon] || Icons.Activity;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_ENTER, delay: i * 0.03 }}
              className="bdg-w-af-item"
              style={{ ['--mod-c' as any]: MOD_COLOR[a.mod] || '#71717a' }}
            >
              <span className="bdg-w-af-icon">
                <IconCmp size={11} />
              </span>
              <div className="bdg-w-af-body">
                <div className="bdg-w-af-text">
                  <strong>{a.who}</strong> {a.what}
                </div>
                <div className="bdg-w-af-meta">
                  <span className="bdg-w-af-mod">{a.mod}</span>
                  <span>·</span>
                  <span>{a.when}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────
// WEEKLY SNAPSHOT — 3-cell editorial card (Metrics / Highlights / Blockers)
// ─────────────────────────────────────────────────────────────
interface SnapMetric {
  l: string;          // label
  v: string;          // current value
  p: string;          // previous value
  d: string;          // delta display
  dir: 'up' | 'down' | 'flat';
}

interface SnapshotProps {
  weekLabel?: string;        // "Week 21 · May 19 – 25"
  metrics?: SnapMetric[];
  highlights?: string[];     // each is a sentence; strong-prefix part auto-detected before "."
  blockers?: string[];
  onAddHighlight?: () => void;
  onAddBlocker?: () => void;
  onAiSummary?: () => void;
}

const DEFAULT_METRICS: SnapMetric[] = [
  { l: 'MRR closed',         v: '$11.2K', p: '$8.6K', d: '+30%', dir: 'up' },
  { l: 'Content published',  v: '8',       p: '6',     d: '+33%', dir: 'up' },
  { l: 'Outreach sent',      v: '24',      p: '31',    d: '−22%', dir: 'down' },
  { l: 'Deals closed (won)', v: '2',       p: '1',     d: '+1',  dir: 'up' },
  { l: 'Cycle time avg',     v: '19d',     p: '23d',   d: '−4d', dir: 'up' },
];

const DEFAULT_HIGHLIGHTS = [
  'Cremona Capital signed. Referral via Iris at Sable Loft — case study #4 in 9 months.',
  'Content engine compliance hit 80% for the first time. LinkedIn cadence stable for 3 weeks.',
];

const DEFAULT_BLOCKERS = [
  'Founder bandwidth on proposals. 3 sat for >5 days this week. Need templating + delegate to Lucía.',
  'YouTube cadence behind 4 weeks. Decision: pause or systemize?',
];

// Split a note like "Cremona signed. Rest of context" into <strong>before "."</strong> + " " + rest.
function splitNote(s: string): [string, string] {
  const dot = s.indexOf('.');
  if (dot === -1) return [s, ''];
  return [s.slice(0, dot + 1), s.slice(dot + 1).trim()];
}

function thisWeekLabel(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const weekNum = Math.ceil((days + start.getDay() + 1) / 7);
  const weekStart = new Date(now);
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  weekStart.setDate(now.getDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Week ${weekNum} · ${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

export const WeeklySnapshotCard: React.FC<SnapshotProps> = ({
  weekLabel,
  metrics,
  highlights,
  blockers,
  onAddHighlight,
  onAddBlocker,
  onAiSummary,
}) => {
  const label = weekLabel || thisWeekLabel();
  const m = metrics && metrics.length > 0 ? metrics : DEFAULT_METRICS;
  const h = highlights && highlights.length > 0 ? highlights : DEFAULT_HIGHLIGHTS;
  const b = blockers && blockers.length > 0 ? blockers : DEFAULT_BLOCKERS;
  return (
    <section className="bdg-w-snap">
      <header className="bdg-w-snap-head">
        <span className="bdg-w-snap-pulse" />
        <span className="bdg-w-snap-title">Weekly snapshot</span>
        <span className="bdg-w-snap-week">{label}</span>
        {onAiSummary && (
          <button type="button" className="bdg-w-snap-ai-btn" onClick={onAiSummary}>
            <Icons.Sparkles size={11} />
            AI summary
          </button>
        )}
      </header>
      <div className="bdg-w-snap-grid">
        {/* Cell 1 — Metrics */}
        <div className="bdg-w-snap-cell">
          <div className="bdg-w-snap-cell-title">
            <span>Metrics</span>
            <span className="micro">vs last week</span>
          </div>
          {m.map((row, i) => (
            <div className="bdg-w-snap-metric" key={i}>
              <span className="l">{row.l}</span>
              <span className="v">{row.v}</span>
              <span className="p">{row.p}</span>
              <span className={`d ${row.dir}`}>{row.d}</span>
            </div>
          ))}
        </div>

        {/* Cell 2 — Highlights */}
        <div className="bdg-w-snap-cell">
          <div className="bdg-w-snap-cell-title">Highlights</div>
          {h.map((note, i) => {
            const [strong, rest] = splitNote(note);
            return (
              <div className="bdg-w-snap-note" key={i}>
                <strong>{strong}</strong>
                {rest && ` ${rest}`}
              </div>
            );
          })}
          {onAddHighlight && (
            <button type="button" className="bdg-w-snap-note-edit" onClick={onAddHighlight}>
              + Add highlight
            </button>
          )}
        </div>

        {/* Cell 3 — Blockers */}
        <div className="bdg-w-snap-cell">
          <div className="bdg-w-snap-cell-title">Blockers</div>
          {b.map((note, i) => {
            const [strong, rest] = splitNote(note);
            return (
              <div className="bdg-w-snap-note" key={i}>
                <strong>{strong}</strong>
                {rest && ` ${rest}`}
              </div>
            );
          })}
          {onAddBlocker && (
            <button type="button" className="bdg-w-snap-note-edit" onClick={onAddBlocker}>
              + Add blocker
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
