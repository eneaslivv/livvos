/**
 * BundlePreview — full preview of the livv-update design bundle.
 *
 * Renders each bundle screen as a sandboxed iframe pointing to its
 * static HTML file in /public/livv-bundle/. This gives us 100% visual
 * fidelity (Inter Light editorial, gold pulses, frosted slide-overs,
 * all the modals/wizards/animations) without any CSS or JS collision
 * with the rest of the app.
 *
 * The bundle uses React 18 + Babel-standalone in-browser to compile
 * the JSX files, so we just point an iframe at the .html files and
 * the bundle boots itself.
 *
 * This page is the "preview workspace" — the user toggles in to see
 * everything, and we wire each screen to real data in subsequent
 * passes once we decide what should replace what.
 *
 * Sidebar tabs map to the bundle's pages:
 *   - LIVV OS         → /livv-bundle/livv-os.html (whole app shell)
 *   - Activity        → /livv-bundle/livv-activity.html
 *   - Brief           → /livv-bundle/livv-brief.html
 *   - Documents       → /livv-bundle/livv-documents.html
 *   - Calendar        → /livv-bundle/calendar.html
 *   - AI Advisor      → /livv-bundle/ai-advisor.html
 *   - View Switcher   → /livv-bundle/view-switcher.html
 *
 * The "LIVV OS" entry is the full bundle app — once loaded, the
 * user can click the bundle's internal sidebar (Strategy / Content /
 * Scaling / Growth / Toolkit / Agent / Partners) and navigate the
 * entire mocked app, see every modal, every wizard, every detail
 * slide-over the bundle ships.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';

interface BundleScreen {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  src: string;
  module: string;
}

const SCREENS: BundleScreen[] = [
  {
    id: 'os',
    label: 'LIVV OS · full app',
    description: 'The complete bundle — Strategy, Content, Scaling, Growth, Toolkit, Agent, Partners, all detail panels, all wizards.',
    icon: <Icons.Home size={14} />,
    src: '/livv-bundle/livv-os.html',
    module: 'Bundle',
  },
  {
    id: 'brief',
    label: 'Brief',
    description: 'Daily brief with date strip, aphorism, zone cards, inbox feed, AI quick chips, slide-over message detail.',
    icon: <Icons.Sparkles size={14} />,
    src: '/livv-bundle/livv-brief.html',
    module: 'OS',
  },
  {
    id: 'activity',
    label: 'Activity',
    description: '2-col with KPIs + Team leaderboard + tabs + composer + feed + community sidebar (announcements, presence, threads, clients, pinned).',
    icon: <Icons.Activity size={14} />,
    src: '/livv-bundle/livv-activity.html',
    module: 'OS',
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Drive-style file manager with KPI strip, folder + doc cards, notebook preview, Proposals / Blog / Passwords / Shared tabs.',
    icon: <Icons.Docs size={14} />,
    src: '/livv-bundle/livv-documents.html',
    module: 'OS',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Editorial calendar with day/week/month views, event tags, quick-create modal.',
    icon: <Icons.Calendar size={14} />,
    src: '/livv-bundle/calendar.html',
    module: 'OS',
  },
  {
    id: 'ai-advisor',
    label: 'AI Advisor',
    description: 'Floating AI panel with conic-halo avatar, topics rail, expense card, structured action proposals.',
    icon: <Icons.Star size={14} />,
    src: '/livv-bundle/ai-advisor.html',
    module: 'Agent',
  },
  {
    id: 'view-switcher',
    label: 'View Switcher',
    description: 'Calendar view switcher (Day/Week/Month/Board/List) — interaction pattern.',
    icon: <Icons.Grid size={14} />,
    src: '/livv-bundle/view-switcher.html',
    module: 'OS',
  },
];

interface BundlePreviewProps {
  /** Optional: which screen to start on (e.g. when launching from a deep link) */
  initialScreen?: string;
}

export const BundlePreview: React.FC<BundlePreviewProps> = ({ initialScreen = 'os' }) => {
  const [activeId, setActiveId] = useState(initialScreen);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const active = SCREENS.find(s => s.id === activeId) || SCREENS[0];

  // Reset load state when switching screens
  useEffect(() => {
    setLoaded(false);
  }, [activeId]);

  // Allow Cmd+Shift+B to toggle the sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setCollapsed(c => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex bg-zinc-50 dark:bg-zinc-950" style={{ top: 0, left: 0 }}>
      {/* Left rail — bundle screen list */}
      <aside
        className={`flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-12' : 'w-72'} bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col`}
      >
        {/* Rail header */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center text-[11px] font-bold tracking-tight flex-shrink-0 shadow-sm">L</div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">Bundle preview</div>
              <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">v1 · static mockup</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="ml-auto p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title={collapsed ? 'Expand sidebar (Ctrl+Shift+B)' : 'Collapse sidebar (Ctrl+Shift+B)'}
          >
            {collapsed ? <Icons.ChevronRight size={14} /> : <Icons.ChevronLeft size={14} />}
          </button>
        </div>

        {/* Rail body — screen list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {!collapsed && (
            <div className="px-2 pt-1 pb-2 text-[9.5px] font-mono uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
              Bundle screens
            </div>
          )}
          {SCREENS.map(s => {
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
                title={collapsed ? s.label : undefined}
              >
                <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? 'bg-white/15 dark:bg-zinc-900/15'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                }`}>
                  {s.icon}
                </span>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold flex items-center gap-1.5">
                      {s.label}
                    </div>
                    <div className={`text-[10.5px] mt-0.5 line-clamp-2 leading-snug ${
                      isActive ? 'text-white/70 dark:text-zinc-900/70' : 'text-zinc-500 dark:text-zinc-400'
                    }`}>
                      {s.description}
                    </div>
                    <span className={`mt-1 inline-block text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-white/15 dark:bg-zinc-900/15 text-white dark:text-zinc-900'
                        : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    }`}>
                      {s.module}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Rail footer — guidance */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-500/5">
            <div className="text-[10.5px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
              ⓘ How this works
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Each screen is the bundle's static design served from <code className="font-mono bg-amber-100/40 dark:bg-amber-500/15 px-1 py-0.5 rounded text-[10px]">/livv-bundle/</code>. Open "LIVV OS · full app" to navigate every screen + modal in the bundle. Wiring to real data happens later.
            </p>
          </div>
        )}
      </aside>

      {/* Main — iframe canvas */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar with breadcrumb + url + open-in-new-tab */}
        <header className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Bundle <span className="text-zinc-300 dark:text-zinc-600">/</span> {active.module} <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-900 dark:text-zinc-100 font-semibold normal-case tracking-normal">{active.label}</span>
          </span>
          <span className="ml-auto inline-flex items-center gap-2">
            {!loaded && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                <span className="w-3 h-3 rounded-full border-2 border-amber-300 border-t-amber-600 animate-spin" />
                Loading bundle…
              </span>
            )}
            <button
              onClick={() => iframeRef.current?.contentWindow?.location.reload()}
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Reload bundle"
            >
              <Icons.RefreshCw size={13} />
            </button>
            <a
              href={active.src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              title="Open in new tab"
            >
              <Icons.External size={11} />
              <span>Open</span>
            </a>
          </span>
        </header>

        {/* Iframe canvas */}
        <div className="flex-1 relative bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
          <iframe
            ref={iframeRef}
            key={activeId}
            src={active.src}
            title={active.label}
            className="absolute inset-0 w-full h-full border-0"
            onLoad={() => setLoaded(true)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      </main>
    </div>
  );
};
