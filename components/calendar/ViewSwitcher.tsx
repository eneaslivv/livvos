/**
 * ViewSwitcher — calendar Day/Week/Month/Board/List picker.
 *
 * Source design: handoff bundle inicio-web-dash-livv/view-switcher.html
 * (Livv Studio component, recreated faithfully in React+TS).
 *
 * Behavior:
 *   • Animated thumb glides between tabs with a custom soft easing
 *     and morphs its color into the active view's tone.
 *   • A conic-blur halo behind the thumb appears on hover (rotates).
 *   • Each tab is a small bespoke SVG illustration (sun/bars/grid/
 *     columns/rows) — desaturated when inactive, scaled + drop-
 *     shadowed when active.
 *   • Hovering a tab shows a dark tooltip with label + descriptor
 *     + keyboard shortcut chip.
 *   • Keyboard shortcuts: D / W / M / B / L (single letters, since
 *     Layout already binds 1/2/3 for global mode switching and we
 *     don't want to collide).
 *
 * Drop-in replacement for the previous ToggleGroup-based switcher.
 */
import React, { useEffect } from 'react';
import './ViewSwitcher.css';

export type CalendarView = 'day' | 'week' | 'month' | 'board' | 'list';

interface ViewDef {
  id: CalendarView;
  tone: string;
  label: string;
  sub: string;
  kbd: string;
}

// Per-view brand tones — these drive the active thumb's gradient,
// the hover halo's conic ring, and the inactive icon color.
const VIEW_DEFS: ViewDef[] = [
  { id: 'day',   tone: '#E8BC59', label: 'Day',   sub: 'Hour by hour', kbd: 'D' },
  { id: 'week',  tone: '#6DBEDC', label: 'Week',  sub: '7 columns',    kbd: 'W' },
  { id: 'month', tone: '#769268', label: 'Month', sub: 'Full grid',    kbd: 'M' },
  { id: 'board', tone: '#F1ADD8', label: 'Board', sub: 'By status',    kbd: 'B' },
  { id: 'list',  tone: '#5c1d18', label: 'List',  sub: 'Linear',       kbd: 'L' },
];

interface ViewIconProps {
  id: CalendarView;
  color: string;
  active: boolean;
}

/**
 * Per-view mini-illustration. When active, all fills swap to cream
 * (#FDFBF7) so they contrast against the dark colored thumb. When
 * inactive the SVG uses the view's tone in 3 alpha layers (full,
 * 60%, 33%) to give each icon depth instead of a flat silhouette.
 */
const ViewIcon: React.FC<ViewIconProps> = ({ id, color, active }) => {
  const c = active ? '#FDFBF7' : color;
  const cFaint = active ? 'rgba(253,251,247,0.35)' : `${color}55`;
  const cMid   = active ? 'rgba(253,251,247,0.65)' : `${color}99`;

  switch (id) {
    case 'day':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" fill={c} />
          <circle cx="12" cy="12" r="2.2" fill={active ? '#FFE7A6' : '#FFEAB0'} opacity={active ? 1 : 0.6} />
          <g stroke={c} strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7" />
          </g>
        </svg>
      );
    case 'week':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3"  y="14" width="2.6" height="6"  rx="1" fill={cFaint} />
          <rect x="7"  y="10" width="2.6" height="10" rx="1" fill={cMid} />
          <rect x="11" y="5"  width="2.6" height="15" rx="1" fill={c} />
          <rect x="15" y="9"  width="2.6" height="11" rx="1" fill={cMid} />
          <rect x="19" y="13" width="2.6" height="7"  rx="1" fill={cFaint} />
        </svg>
      );
    case 'month':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2.5" fill={cFaint} stroke={c} strokeWidth="1.4" />
          <path d="M3 10h18" stroke={c} strokeWidth="1.4" />
          <rect x="6"    y="12.5" width="3" height="2.5" rx="0.6" fill={cMid} />
          <rect x="10.5" y="12.5" width="3" height="2.5" rx="0.6" fill={c} />
          <rect x="15"   y="12.5" width="3" height="2.5" rx="0.6" fill={cMid} />
          <rect x="6"    y="16.5" width="3" height="2.5" rx="0.6" fill={cFaint} />
          <rect x="10.5" y="16.5" width="3" height="2.5" rx="0.6" fill={cMid} />
          <rect x="15"   y="16.5" width="3" height="2.5" rx="0.6" fill={cFaint} />
          <circle cx="7.5"  cy="3.5" r="1" fill={c} />
          <circle cx="16.5" cy="3.5" r="1" fill={c} />
        </svg>
      );
    case 'board':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3"  y="4" width="5" height="16" rx="1.2" fill={cFaint} />
          <rect x="3"  y="4" width="5" height="6"  rx="1.2" fill={c} />
          <rect x="10" y="4" width="5" height="16" rx="1.2" fill={cFaint} />
          <rect x="10" y="4" width="5" height="10" rx="1.2" fill={cMid} />
          <rect x="17" y="4" width="4" height="16" rx="1.2" fill={cFaint} />
          <rect x="17" y="4" width="4" height="3"  rx="1.2" fill={c} />
        </svg>
      );
    case 'list':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" fill={cFaint} />
          <circle cx="6.5" cy="9"    r="1.4" fill={c} />
          <circle cx="6.5" cy="14"   r="1.4" fill={cMid} />
          <circle cx="6.5" cy="18.5" r="0.9" fill={cMid} opacity="0.7" />
          <path d="M10 9h9M10 14h7M10 18.5h5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
};

interface ViewSwitcherProps {
  value: CalendarView;
  onChange: (v: CalendarView) => void;
}

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ value, onChange }) => {
  const idx = Math.max(0, VIEW_DEFS.findIndex(v => v.id === value));
  const active = VIEW_DEFS[idx];

  // Single-letter keyboard shortcuts. Guard against typing contexts
  // and modifier-key chords so we don't hijack copy/paste/Cmd-shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const def = VIEW_DEFS.find(v => v.kbd.toLowerCase() === k);
      if (def && def.id !== value) {
        e.preventDefault();
        onChange(def.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, value]);

  // Dynamic positioning — left + width are calc()s so adding/removing
  // views in VIEW_DEFS doesn't require touching CSS. The 3px / 6px
  // accounts for the container's padding.
  const thumbStyle: React.CSSProperties = {
    left: `calc(3px + ${idx} * (100% - 6px) / ${VIEW_DEFS.length})`,
    width: `calc((100% - 6px) / ${VIEW_DEFS.length})`,
    background: `linear-gradient(135deg, ${active.tone}, color-mix(in oklab, ${active.tone} 70%, #2C0405))`,
  };
  const ringStyle: React.CSSProperties = {
    left: `calc(3px + ${idx} * (100% - 6px) / ${VIEW_DEFS.length})`,
    width: `calc((100% - 6px) / ${VIEW_DEFS.length})`,
  };

  return (
    <div
      className="vsw"
      role="tablist"
      aria-label="Calendar view"
      style={{ ['--vsw-tone' as any]: active.tone }}
    >
      <div className="vsw-thumb" style={thumbStyle} />
      <div className="vsw-thumb-ring" aria-hidden style={ringStyle} />
      {VIEW_DEFS.map(v => {
        const isActive = v.id === value;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${v.label} view`}
            className={`vsw-tab${isActive ? ' active' : ''}`}
            onClick={() => onChange(v.id)}
            style={{ ['--tone' as any]: v.tone }}
          >
            <span className="vsw-icon">
              <ViewIcon id={v.id} color={v.tone} active={isActive} />
            </span>
            <span className="vsw-tooltip" role="tooltip">
              <span className="vsw-tt-label">{v.label}</span>
              <span className="vsw-tt-sub">{v.sub}</span>
              <kbd className="vsw-tt-kbd">{v.kbd}</kbd>
            </span>
          </button>
        );
      })}
    </div>
  );
};
