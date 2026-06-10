import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icons } from './ui/Icons';
import { PageView, AppMode, NavParams } from '../types';
import { useProjects } from '../context/ProjectsContext';
import { useClients } from '../context/ClientsContext';
import { useTeam } from '../context/TeamContext';
import { useCalendar } from '../context/CalendarContext';
import './livv/LivvBundleDesign.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: PageView, params?: NavParams) => void;
  onSwitchMode: (mode: AppMode) => void;
  currentMode: AppMode;
}

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  category: string;
  icon: React.ReactNode;
  action: () => void;
}

const SECTIONS: { id: PageView; label: string; icon: React.ReactNode; mode: AppMode; keywords?: string }[] = [
  { id: 'home', label: 'Home', icon: <Icons.Home size={16} />, mode: 'os', keywords: 'dashboard inicio' },
  { id: 'projects', label: 'Projects', icon: <Icons.Briefcase size={16} />, mode: 'os', keywords: 'proyectos tareas' },
  { id: 'team_clients', label: 'Team & Clients', icon: <Icons.Users size={16} />, mode: 'os', keywords: 'equipo clientes team' },
  { id: 'calendar', label: 'Calendar', icon: <Icons.Calendar size={16} />, mode: 'os', keywords: 'calendario eventos events' },
  { id: 'activity', label: 'Activity', icon: <Icons.Activity size={16} />, mode: 'os', keywords: 'actividad historial' },
  { id: 'docs', label: 'Documents', icon: <Icons.Docs size={16} />, mode: 'os', keywords: 'documentos archivos files' },
  { id: 'sales_dashboard', label: 'Sales Overview', icon: <Icons.Chart size={16} />, mode: 'sales', keywords: 'ventas dashboard' },
  { id: 'sales_leads', label: 'Leads Inbox', icon: <Icons.Mail size={16} />, mode: 'sales', keywords: 'leads prospectos inbox' },
  { id: 'finance', label: 'Financial Center', icon: <Icons.DollarSign size={16} />, mode: 'sales', keywords: 'finanzas pagos invoices' },
  { id: 'sales_analytics', label: 'Analytics', icon: <Icons.TrendingUp size={16} />, mode: 'sales', keywords: 'analitica metricas' },
  { id: 'content_cms', label: 'Content CMS', icon: <Icons.Globe size={16} />, mode: 'os', keywords: 'contenido cms blog portfolio' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSwitchMode,
  currentMode,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { projects } = useProjects();
  const { clients } = useClients();
  const { members } = useTeam();
  const { events, tasks } = useCalendar();

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay for animation to start before focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const navigate = useCallback((page: PageView, params?: NavParams) => {
    // Switch mode if needed
    const sectionDef = SECTIONS.find(s => s.id === page);
    if (sectionDef && sectionDef.mode !== currentMode) {
      onSwitchMode(sectionDef.mode);
    }
    onNavigate(page, params);
    onClose();
  }, [currentMode, onSwitchMode, onNavigate, onClose]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();

    // Empty query: show sections + context switch
    if (!q) {
      const sectionResults: SearchResult[] = SECTIONS.map(s => ({
        id: `section-${s.id}`,
        label: s.label,
        sublabel: s.mode === 'os' ? 'Eneas OS' : 'Sales & Leads',
        category: 'Sections',
        icon: s.icon,
        action: () => navigate(s.id),
      }));

      const contextResults: SearchResult[] = [
        {
          id: 'ctx-os',
          label: 'Eneas OS',
          sublabel: currentMode === 'os' ? 'Active' : 'Switch to OS mode',
          category: 'Switch Context',
          icon: <Icons.Home size={16} />,
          action: () => { onSwitchMode('os'); onClose(); },
        },
        {
          id: 'ctx-sales',
          label: 'Sales & Leads',
          sublabel: currentMode === 'sales' ? 'Active' : 'Switch to Sales mode',
          category: 'Switch Context',
          icon: <Icons.Chart size={16} />,
          action: () => { onSwitchMode('sales'); onClose(); },
        },
      ];

      return [...sectionResults, ...contextResults];
    }

    // Filtered results
    const all: SearchResult[] = [];

    // Sections
    SECTIONS.forEach(s => {
      const haystack = `${s.label} ${s.keywords || ''}`.toLowerCase();
      if (haystack.includes(q)) {
        all.push({
          id: `section-${s.id}`,
          label: s.label,
          sublabel: s.mode === 'os' ? 'Eneas OS' : 'Sales & Leads',
          category: 'Sections',
          icon: s.icon,
          action: () => navigate(s.id),
        });
      }
    });

    // Projects
    const matchedProjects = (projects || [])
      .filter(p => {
        const haystack = `${p.title} ${p.description || ''} ${p.clientName || p.client || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 3);

    matchedProjects.forEach(p => {
      all.push({
        id: `project-${p.id}`,
        label: p.title,
        sublabel: [p.status, p.clientName || p.client].filter(Boolean).join(' · '),
        category: 'Projects',
        icon: <Icons.Briefcase size={16} />,
        action: () => navigate('projects', { projectId: p.id }),
      });
    });

    // Tasks — open ones first, completed last; jump into the task's
    // project (or Calendar when it has no project).
    const matchedTasks = (tasks || [])
      .filter(t => `${t.title} ${t.description || ''}`.toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.completed) - Number(!!b.completed))
      .slice(0, 4);

    matchedTasks.forEach(t => {
      const projectName = (projects || []).find(p => p.id === t.project_id)?.title;
      all.push({
        id: `task-${t.id}`,
        label: t.title,
        sublabel: [t.completed ? 'done' : (t.status || 'open'), projectName, t.due_date].filter(Boolean).join(' · '),
        category: 'Tasks',
        icon: <Icons.Check size={16} />,
        action: () => t.project_id
          ? navigate('projects', { projectId: t.project_id })
          : navigate('calendar'),
      });
    });

    // Clients
    const matchedClients = (clients || [])
      .filter(c => {
        const haystack = `${c.name} ${c.email || ''} ${c.company || ''} ${c.industry || ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 3);

    matchedClients.forEach(c => {
      all.push({
        id: `client-${c.id}`,
        label: c.name,
        sublabel: [c.company, c.email].filter(Boolean).join(' · '),
        category: 'Clients',
        icon: <Icons.User size={16} />,
        action: () => navigate('team_clients', { clientId: c.id }),
      });
    });

    // Team members
    const matchedMembers = (members || [])
      .filter(m => {
        const haystack = `${m.name || ''} ${m.email} ${m.role || ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 3);

    matchedMembers.forEach(m => {
      all.push({
        id: `member-${m.id}`,
        label: m.name || m.email,
        sublabel: [m.role, m.email].filter(Boolean).join(' · '),
        category: 'Team',
        icon: <Icons.Users size={16} />,
        action: () => navigate('team_clients'),
      });
    });

    // Calendar events
    const matchedEvents = (events || [])
      .filter(ev => {
        const haystack = `${ev.title} ${ev.description || ''} ${ev.type || ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 3);

    matchedEvents.forEach(ev => {
      all.push({
        id: `event-${ev.id}`,
        label: ev.title,
        sublabel: [ev.type, ev.start_date].filter(Boolean).join(' · '),
        category: 'Events',
        icon: <Icons.Calendar size={16} />,
        action: () => navigate('calendar'),
      });
    });

    // Context switch
    if ('eneas os system'.includes(q) || 'os'.includes(q)) {
      all.push({
        id: 'ctx-os',
        label: 'Eneas OS',
        sublabel: 'Switch context',
        category: 'Switch Context',
        icon: <Icons.Home size={16} />,
        action: () => { onSwitchMode('os'); onClose(); },
      });
    }
    if ('sales leads ventas'.includes(q) || 'sales'.includes(q)) {
      all.push({
        id: 'ctx-sales',
        label: 'Sales & Leads',
        sublabel: 'Switch context',
        category: 'Switch Context',
        icon: <Icons.Chart size={16} />,
        action: () => { onSwitchMode('sales'); onClose(); },
      });
    }

    return all;
  }, [query, projects, clients, members, events, tasks, currentMode, navigate, onSwitchMode, onClose]);

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      results[selectedIndex].action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [results, selectedIndex, onClose]);

  if (!isOpen) return null;

  // Group results by category for display
  const grouped: { category: string; items: (SearchResult & { flatIndex: number })[] }[] = [];
  let flatIndex = 0;
  results.forEach(r => {
    let group = grouped.find(g => g.category === r.category);
    if (!group) {
      group = { category: r.category, items: [] };
      grouped.push(group);
    }
    group.items.push({ ...r, flatIndex });
    flatIndex++;
  });

  return (
    <div className="cmdk-back" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="cmdk-input">
          <Icons.Search size={16} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find anything — tasks, projects, clients, pages…"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="cmdk-results">
          {results.length === 0 && query && (
            <div className="cmdk-empty">
              <Icons.Search size={20} />
              <span>No results for "{query}"</span>
              <span className="hint">Try searching by company, project, or client name</span>
            </div>
          )}

          {grouped.map(group => (
            <React.Fragment key={group.category}>
              <div className="cmdk-group">{group.category}</div>
              {group.items.map(item => (
                <div
                  key={item.id}
                  data-index={item.flatIndex}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(item.flatIndex)}
                  className={`cmdk-item ${selectedIndex === item.flatIndex ? 'sel' : ''}`}
                >
                  <span className="icon">{item.icon}</span>
                  <span className="label">{item.label}</span>
                  {item.sublabel && <span className="sub">{item.sublabel}</span>}
                  <span className="mod">{group.category}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Footer hints */}
        <div className="cmdk-foot">
          <span>
            <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
};
