import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { useClients } from '../../context/ClientsContext';
import { useProjects } from '../../context/ProjectsContext';
import { colorToBg } from '../ui/ColorPalette';
import { PageView, NavParams } from '../../types';

interface Props {
  active: boolean;
  expanded: boolean;
  currentPage: PageView;
  currentClientId?: string;
  currentProjectId?: string;
  onNavigate: (page: PageView, params?: NavParams) => void;
}

type StarItem = { kind: 'client' | 'project'; id: string };
const STAR_KEY = 'eneas-os:starred-clients-tree';
const TREE_OPEN_KEY = 'eneas-os:sidebar-clients-tree-open';
const CLIENT_EXPANDED_KEY = 'eneas-os:sidebar-clients-expanded-set';

const loadStars = (): StarItem[] => {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    return raw ? (JSON.parse(raw) as StarItem[]) : [];
  } catch { return []; }
};
const saveStars = (items: StarItem[]) => {
  try { localStorage.setItem(STAR_KEY, JSON.stringify(items)); } catch { /* ignore quota */ }
};

export const ClientsSidebarTree: React.FC<Props> = ({
  active,
  expanded,
  currentPage,
  currentClientId,
  currentProjectId,
  onNavigate,
}) => {
  const { clients } = useClients();
  const { projects } = useProjects();
  const [stars, setStars] = useState<StarItem[]>(() => loadStars());
  const [treeOpen, setTreeOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(TREE_OPEN_KEY) === 'true'; } catch { return false; }
  });
  const [expandedClients, setExpandedClients] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(CLIENT_EXPANDED_KEY);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  useEffect(() => {
    try { localStorage.setItem(TREE_OPEN_KEY, String(treeOpen)); } catch { /* noop */ }
  }, [treeOpen]);

  useEffect(() => {
    try { localStorage.setItem(CLIENT_EXPANDED_KEY, JSON.stringify([...expandedClients])); } catch { /* noop */ }
  }, [expandedClients]);

  // Listen for external "pin from page" requests so Client/Project detail views
  // can add a star without the user opening the sidebar tree.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as StarItem | undefined;
      if (!detail) return;
      setStars(prev => {
        if (prev.some(s => s.kind === detail.kind && s.id === detail.id)) return prev;
        const next = [...prev, detail];
        saveStars(next);
        return next;
      });
    };
    window.addEventListener('sidebar-star-add', handler);
    return () => window.removeEventListener('sidebar-star-add', handler);
  }, []);

  const toggleStar = (kind: StarItem['kind'], id: string) => {
    setStars(prev => {
      const exists = prev.some(s => s.kind === kind && s.id === id);
      const next = exists
        ? prev.filter(s => !(s.kind === kind && s.id === id))
        : [...prev, { kind, id }];
      saveStars(next);
      return next;
    });
  };

  const toggleClientExpanded = (id: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isStarred = (kind: StarItem['kind'], id: string) =>
    stars.some(s => s.kind === kind && s.id === id);

  const projectsByClient = useMemo(() => {
    const map = new Map<string, typeof projects>();
    const orphans: typeof projects = [];
    for (const p of projects) {
      if (p.client_id) {
        const arr = map.get(p.client_id) ?? [];
        arr.push(p);
        map.set(p.client_id, arr);
      } else {
        orphans.push(p);
      }
    }
    return { map, orphans };
  }, [projects]);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const an = (a.name || a.company || '').toLowerCase();
      const bn = (b.name || b.company || '').toLowerCase();
      return an.localeCompare(bn);
    });
  }, [clients]);

  const starredEntries = useMemo(() => {
    return stars
      .map(s => {
        if (s.kind === 'client') {
          const c = clients.find(x => x.id === s.id);
          return c ? {
            kind: 'client' as const,
            id: c.id,
            label: c.name || c.company || 'Client',
            color: c.color || '#71717a',
            avatarUrl: c.avatar_url || null,
            icon: c.icon || null,
          } : null;
        }
        const p = projects.find(x => x.id === s.id);
        return p ? {
          kind: 'project' as const,
          id: p.id,
          label: p.title,
          color: p.color || '#3b82f6',
          avatarUrl: null,
          icon: p.icon || null,
        } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [stars, clients, projects]);

  const goToClient = (id: string) => onNavigate('clients', { clientId: id });
  const goToProject = (id: string) => onNavigate('projects', { projectId: id });

  return (
    <div className="w-full shrink-0">
      {/* ── Main "Clients" button + tree toggle ── */}
      <div className="relative w-[calc(100%-16px)] mx-2">
        <div
          className={`relative flex items-center rounded-md transition-colors duration-150 group/item ${
            active
              ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-50 font-medium'
              : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100'
          } ${!expanded ? 'justify-center' : ''}`}
        >
          <button
            onClick={() => onNavigate('clients')}
            title={!expanded ? 'Clients' : undefined}
            className={`flex items-center flex-1 min-w-0 px-2.5 py-1.5 ${!expanded ? 'justify-center' : ''}`}
          >
            <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0">
              <Icons.Briefcase size={17} strokeWidth={2} />
            </div>
            {expanded && (
              <span className="ml-2.5 text-[13px] text-left">Clients</span>
            )}
            {!expanded && (
              <div className="absolute left-full ml-3 px-2 py-1 bg-zinc-900 dark:bg-zinc-800 text-white text-[11px] font-medium rounded-md opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all pointer-events-none whitespace-nowrap z-50 shadow-lg">
                Clients
              </div>
            )}
          </button>
          {expanded && (
            <button
              onClick={(e) => { e.stopPropagation(); setTreeOpen(v => !v); }}
              className="p-1 mr-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-700/40 transition-colors duration-150"
              title={treeOpen ? 'Hide all' : 'Show all clients & projects'}
            >
              <Icons.ChevronDown
                size={13}
                className={`transition-transform duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${treeOpen ? 'rotate-0' : '-rotate-90'}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* ── Pinned shortcuts (always visible when sidebar expanded) ── */}
      {expanded && starredEntries.length > 0 && (
        <div className="mt-0.5 w-[calc(100%-16px)] mx-2 pl-3 border-l border-zinc-100 dark:border-zinc-800/60 space-y-0">

          {starredEntries.map(item => {
            const isActive = item.kind === 'client'
              ? (currentPage === 'clients' && currentClientId === item.id)
              : (currentPage === 'projects' && currentProjectId === item.id);
            return (
              <TreeRow
                key={`star-${item.kind}-${item.id}`}
                label={item.label}
                color={item.color}
                avatarUrl={item.avatarUrl}
                icon={item.icon}
                active={isActive}
                starred
                onClick={() => item.kind === 'client' ? goToClient(item.id) : goToProject(item.id)}
                onToggleStar={() => toggleStar(item.kind, item.id)}
              />
            );
          })}
        </div>
      )}

      {/* ── Collapsed sidebar: show pinned as dots with tooltips ── */}
      {!expanded && starredEntries.length > 0 && (
        <div className="mt-1 w-[calc(100%-24px)] mx-3 space-y-0.5">
          {starredEntries.map(item => {
            const isActive = item.kind === 'client'
              ? (currentPage === 'clients' && currentClientId === item.id)
              : (currentPage === 'projects' && currentProjectId === item.id);
            return (
              <button
                key={`collapsed-star-${item.kind}-${item.id}`}
                onClick={() => item.kind === 'client' ? goToClient(item.id) : goToProject(item.id)}
                title={item.label}
                className={`group/cpin relative w-full flex items-center justify-center py-1.5 rounded-xl transition-colors ${
                  isActive ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                {item.avatarUrl ? (
                  <img
                    src={item.avatarUrl}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : item.icon ? (
                  <span className="text-[13px] leading-none">{item.icon}</span>
                ) : (
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                )}
                <div className="absolute left-full ml-4 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-medium rounded-lg opacity-0 -translate-x-2 group-hover/cpin:opacity-100 group-hover/cpin:translate-x-0 transition-all pointer-events-none whitespace-nowrap z-50 shadow-xl border border-zinc-800 dark:border-zinc-700">
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty-state hint when nothing is pinned and tree is closed ── */}
      {expanded && !treeOpen && starredEntries.length === 0 && (
        <button
          onClick={() => setTreeOpen(true)}
          className="mt-0.5 w-[calc(100%-16px)] mx-2 px-2.5 py-1 text-[11px] text-left text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
        >
          View all clients & projects
        </button>
      )}

      {/* ── Inline full tree (animated open/close via grid-rows trick) ── */}
      {expanded && (
        <div
          className={`grid transition-[grid-template-rows,opacity,margin] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
            treeOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 mt-0'
          }`}
          aria-hidden={!treeOpen}
        >
          <div className="overflow-hidden min-h-0">
            <div className="sidebar-thin-scroll w-[calc(100%-16px)] mx-2 max-h-[60vh] overflow-y-auto overscroll-contain pr-1 space-y-0">
              {sortedClients.length === 0 && projectsByClient.orphans.length === 0 && (
                <p className="px-3 py-3 text-[11px] text-zinc-400 italic">
                  No clients or projects yet.
                </p>
              )}
              {sortedClients.map(client => {
                const clientProjects = projectsByClient.map.get(client.id) ?? [];
                const isClientOpen = expandedClients.has(client.id);
                const isActive = currentPage === 'clients' && currentClientId === client.id;
                const clientLabel = client.name || client.company || 'Client';
                const clientColor = client.color || '#71717a';
                return (
                  <div key={client.id} className="space-y-0.5">
                    <TreeRow
                      label={clientLabel}
                      color={clientColor}
                      avatarUrl={client.avatar_url || null}
                      icon={client.icon || null}
                      active={isActive}
                      starred={isStarred('client', client.id)}
                      childrenCount={clientProjects.length}
                      childrenOpen={isClientOpen}
                      onToggleChildren={() => toggleClientExpanded(client.id)}
                      onClick={() => goToClient(client.id)}
                      onToggleStar={() => toggleStar('client', client.id)}
                    />
                    {clientProjects.length > 0 && (
                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
                          isClientOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                        aria-hidden={!isClientOpen}
                      >
                        <div className="overflow-hidden min-h-0">
                          <div className="ml-3 pl-2 border-l border-zinc-100 dark:border-zinc-800/60 space-y-0.5 pt-0.5">
                            {clientProjects.map(p => (
                              <TreeRow
                                key={p.id}
                                label={p.title}
                                color={p.color || '#3b82f6'}
                                avatarUrl={null}
                                icon={p.icon || null}
                                active={currentPage === 'projects' && currentProjectId === p.id}
                                starred={isStarred('project', p.id)}
                                onClick={() => goToProject(p.id)}
                                onToggleStar={() => toggleStar('project', p.id)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {projectsByClient.orphans.length > 0 && (
                <div className="pt-1.5 space-y-0">
                  <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                    Internal
                  </div>
                  {projectsByClient.orphans.map(p => (
                    <TreeRow
                      key={p.id}
                      label={p.title}
                      color={p.color || '#3b82f6'}
                      avatarUrl={null}
                      icon={p.icon || null}
                      active={currentPage === 'projects' && currentProjectId === p.id}
                      starred={isStarred('project', p.id)}
                      onClick={() => goToProject(p.id)}
                      onToggleStar={() => toggleStar('project', p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Unified tree row ── */
const TreeRow: React.FC<{
  label: string;
  color: string;
  avatarUrl?: string | null;
  icon?: string | null;
  active: boolean;
  starred: boolean;
  childrenCount?: number;
  childrenOpen?: boolean;
  onToggleChildren?: () => void;
  onClick: () => void;
  onToggleStar: () => void;
}> = ({ label, color, avatarUrl, icon, active, starred, childrenCount, childrenOpen, onToggleChildren, onClick, onToggleStar }) => {
  const hasToggle = !!onToggleChildren;
  return (
    <div className={`group/row relative flex items-center rounded-md transition-colors duration-150 ${
      active ? 'bg-zinc-100 dark:bg-zinc-800/80' : 'hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60'
    }`}>
      {hasToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleChildren?.(); }}
          className={`shrink-0 p-0.5 ml-0.5 rounded transition-colors duration-150 ${
            childrenCount
              ? 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              : 'opacity-0 pointer-events-none'
          }`}
          aria-label="Toggle projects"
        >
          <Icons.ChevronRight
            size={10}
            className={`transition-transform duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${childrenOpen ? 'rotate-90' : ''}`}
          />
        </button>
      )}
      <button
        onClick={onClick}
        className={`flex items-center flex-1 min-w-0 py-1 ${hasToggle ? 'pl-0.5 pr-2' : 'px-2'}`}
      >
        {/* Visual: mirrors the project list in the middle column of /projects.
            Avatar > emoji-on-tinted-bg > tinted-bg-with-color-dot. Bigger
            footprint (18px) so emoji icons render at a readable size. */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-[18px] h-[18px] rounded-md object-cover shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : icon ? (
          <span
            className="w-[18px] h-[18px] rounded-md flex items-center justify-center text-[13px] leading-none shrink-0"
            style={{ backgroundColor: colorToBg(color, 0.14) }}
          >
            {icon}
          </span>
        ) : (
          <span
            className="w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: colorToBg(color, 0.14) }}
          >
            <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: color }} />
          </span>
        )}
        <span className={`ml-2 text-[12px] truncate text-left ${
          active ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'
        }`}>
          {label}
        </span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
        title={starred ? 'Unpin' : 'Pin'}
        className={`shrink-0 p-0.5 mr-1 rounded transition-all duration-150 ${
          starred
            ? 'opacity-100 text-amber-500 hover:text-amber-600'
            : 'opacity-0 group-hover/row:opacity-100 text-zinc-400 hover:text-amber-500'
        }`}
      >
        <Icons.Star size={10} strokeWidth={starred ? 2.5 : 2} fill={starred ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
};
