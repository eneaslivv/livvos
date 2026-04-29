import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../ui/Icons';
import { useClients } from '../../context/ClientsContext';
import { useProjects } from '../../context/ProjectsContext';
import { PageView, NavParams } from '../../types';

type NewKind = 'client' | 'project' | 'task' | 'doc';

interface Props {
  expanded?: boolean;
  variant?: 'sidebar' | 'topbar';
  currentPage: PageView;
  currentClientId?: string;
  currentProjectId?: string;
  onNavigate: (page: PageView, params?: NavParams) => void;
  onOpenNewTask: () => void;
}

// Broadcast an event that the target page listens for to open its new-item panel
// with a pre-filled name. Projects / Clients / Docs pages wire a listener for this.
const dispatchOpenNew = (kind: NewKind, payload: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent(`open-new-${kind}`, { detail: payload }));
};

export const UnifiedNewPopover: React.FC<Props> = ({
  expanded = true,
  variant = 'sidebar',
  currentPage,
  currentClientId,
  currentProjectId,
  onNavigate,
  onOpenNewTask,
}) => {
  const isTopbar = variant === 'topbar';
  const { clients } = useClients();
  const { projects } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const contextClient = useMemo(
    () => (currentPage === 'clients' && currentClientId
      ? clients.find(c => c.id === currentClientId)
      : null),
    [currentPage, currentClientId, clients]
  );
  const contextProject = useMemo(
    () => (currentPage === 'projects' && currentProjectId
      ? projects.find(p => p.id === currentProjectId)
      : null),
    [currentPage, currentProjectId, projects]
  );

  // Default kind based on current page
  const primaryKind: NewKind = contextProject
    ? 'task'
    : contextClient
      ? 'project'
      : 'client';

  // ⌘N / Ctrl+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        const tag = (e.target as HTMLElement)?.tagName;
        const editable =
          tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
        if (editable) return;
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setName('');
    }
  }, [open]);

  const createItem = (kind: NewKind) => {
    const trimmed = name.trim();
    switch (kind) {
      case 'client':
        onNavigate('clients');
        dispatchOpenNew('client', { name: trimmed });
        break;
      case 'project': {
        const clientId = contextClient?.id ?? null;
        onNavigate('projects', clientId ? { clientId } : undefined);
        dispatchOpenNew('project', { name: trimmed, clientId });
        break;
      }
      case 'task':
        if (trimmed) {
          dispatchOpenNew('task', { name: trimmed, projectId: contextProject?.id ?? null });
        } else {
          onOpenNewTask();
        }
        break;
      case 'doc':
        onNavigate('docs');
        dispatchOpenNew('doc', { name: trimmed });
        break;
    }
    setOpen(false);
  };

  type Option = { kind: NewKind; label: string; icon: React.ReactNode; hint?: string };
  const options = useMemo<Option[]>(() => {
    const items: Option[] = [
      { kind: 'client', label: 'Client', icon: <Icons.Users size={14} /> },
      { kind: 'project', label: 'Project', icon: <Icons.Briefcase size={14} /> },
      { kind: 'task', label: 'Task', icon: <Icons.Check size={14} /> },
      { kind: 'doc', label: 'Doc', icon: <Icons.Docs size={14} /> },
    ];
    // Context-aware primary option
    if (primaryKind === 'project' && contextClient) {
      return [
        {
          kind: 'project',
          label: `New project in ${contextClient.name || contextClient.company || 'client'}`,
          icon: <Icons.Plus size={14} />,
          hint: 'Context',
        },
        ...items.filter(i => i.kind !== 'project'),
      ];
    }
    if (primaryKind === 'task' && contextProject) {
      return [
        {
          kind: 'task',
          label: `New task in ${contextProject.title}`,
          icon: <Icons.Plus size={14} />,
          hint: 'Context',
        },
        ...items.filter(i => i.kind !== 'task'),
      ];
    }
    return items;
  }, [primaryKind, contextClient, contextProject]);

  return (
    <div
      ref={rootRef}
      className={
        isTopbar
          ? 'relative shrink-0'
          : 'relative w-[calc(100%-24px)] mx-3 mb-2 shrink-0'
      }
    >
      <button
        onClick={() => setOpen(v => !v)}
        title={isTopbar || expanded ? undefined : 'New (⌘N)'}
        className={
          isTopbar
            ? 'flex items-center gap-1 px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-[11px] font-medium hover:opacity-90 transition-opacity'
            : `w-full flex items-center ${
                expanded ? 'justify-start px-3' : 'justify-center px-2'
              } py-2.5 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm active:scale-[0.98]`
        }
      >
        {isTopbar ? (
          <>
            <Icons.Plus size={11} strokeWidth={2.5} />
            <span>New</span>
            <span className="ml-0.5 text-[9px] font-mono text-white/60 dark:text-zinc-900/60">⌘N</span>
          </>
        ) : (
          <>
            <Icons.Plus size={18} strokeWidth={2.5} />
            {expanded && (
              <>
                <span className="ml-2 text-sm font-semibold">New</span>
                <span className="ml-auto text-[10px] font-mono opacity-60 border border-white/20 dark:border-zinc-900/20 rounded px-1 py-0.5">
                  ⌘N
                </span>
              </>
            )}
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 ${
            isTopbar
              ? 'right-0 w-64'
              : expanded
                ? 'left-0 right-0'
                : 'left-full ml-2 w-64'
          } top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl shadow-zinc-200/40 dark:shadow-black/60 overflow-hidden`}
        >
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createItem(options[0].kind);
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Name (⏎ to create)"
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10"
            />
          </div>
          <div className="py-1">
            {options.map((opt, idx) => (
              <button
                key={`${opt.kind}-${idx}`}
                onClick={() => createItem(opt.kind)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {opt.icon}
                </span>
                <span className="flex-1 text-[12px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {opt.label}
                </span>
                {opt.hint && (
                  <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-400">
                    {opt.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
