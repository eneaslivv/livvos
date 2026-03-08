import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { ColorPalette } from '../ui/ColorPalette';
import { Client } from '../../hooks/useClients';
import { TIMEZONE_OPTIONS, tzCity, tzNow } from '../../lib/timezone';

interface AssignedProject {
  id: string;
  title: string;
  status?: string;
  progress?: number;
}

interface AvailableProject {
  id: string;
  title: string;
  client_id?: string | null;
  status?: string;
  progress?: number;
}

interface ClientInfoTabProps {
  client: Client;
  editingField: string | null;
  editDraft: Record<string, string>;
  assignedProjects: AssignedProject[];
  availableProjects: AvailableProject[];
  showProjectDropdown: boolean;
  assigningProject: boolean;
  projectDropdownRef: React.RefObject<HTMLDivElement | null>;
  onEditField: (field: string) => void;
  onEditDraftChange: (draft: Record<string, string>) => void;
  onCancelEdit: () => void;
  onInlineEdit: (field: string) => Promise<boolean>;
  onAssignProject: (projectId: string) => void;
  onUnassignProject: (projectId: string) => void;
  onToggleProjectDropdown: () => void;
  onUpdateColor?: (color: string | null) => void;
  onUpdateTimezone?: (timezone: string | null) => void;
  onNavigateToProject?: (projectId: string) => void;
}

const inputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';

export const ClientInfoTab: React.FC<ClientInfoTabProps> = ({
  client,
  editingField,
  editDraft,
  assignedProjects,
  availableProjects,
  showProjectDropdown,
  assigningProject,
  projectDropdownRef,
  onEditField,
  onEditDraftChange,
  onCancelEdit,
  onInlineEdit,
  onAssignProject,
  onUnassignProject,
  onToggleProjectDropdown,
  onUpdateColor,
  onUpdateTimezone,
  onNavigateToProject,
}) => {
  const [savedField, setSavedField] = useState<string | null>(null);
  const [tzOpen, setTzOpen] = useState(false);
  const [tzSearch, setTzSearch] = useState('');
  const tzRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const EditableField = ({ field, label, value, type = 'text', placeholder = '' }: { field: string; label: string; value: string | undefined; type?: string; placeholder?: string }) => {
    const isEditing = editingField === field;
    const justSaved = savedField === field;
    return (
      <div className="group">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              type={type}
              value={editDraft[field] || ''}
              onChange={e => onEditDraftChange({ ...editDraft, [field]: e.target.value })}
              className="flex-1 px-2.5 py-1.5 bg-white dark:bg-zinc-800 border-2 border-indigo-400 dark:border-indigo-500 rounded-lg text-sm outline-none ring-2 ring-indigo-100 dark:ring-indigo-900/30"
              autoFocus
              onKeyDown={async e => {
                if (e.key === 'Enter') { const ok = await onInlineEdit(field); if (ok) { setSavedField(field); setTimeout(() => setSavedField(null), 1500); } }
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <button
              onClick={async () => { const ok = await onInlineEdit(field); if (ok) { setSavedField(field); setTimeout(() => setSavedField(null), 1500); } }}
              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
              title="Save"
            >
              <Icons.Check size={14} />
            </button>
            <button
              onClick={onCancelEdit}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Cancel"
            >
              <Icons.X size={14} />
            </button>
          </div>
        ) : (
          <div
            onClick={() => { onEditField(field); onEditDraftChange({ ...editDraft, [field]: value || '' }); }}
            className="flex items-center gap-1.5 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 -my-1 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800/60 group/edit"
          >
            {justSaved ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <Icons.CheckCircle size={14} /> Saved
              </span>
            ) : (
              <>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate flex-1">
                  {value || <span className="text-zinc-300 dark:text-zinc-600 italic">{placeholder || 'Add...'}</span>}
                </p>
                <Icons.Edit size={12} className="text-zinc-300 opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const unlinked = availableProjects.filter(p => !p.client_id || p.client_id !== client.id)
    .filter(p => !assignedProjects.some(ap => ap.id === p.id));

  return (
    <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mb-6">
        <EditableField field="email" label="Email" value={client.email} type="email" placeholder="email@example.com" />
        <EditableField field="phone" label="Phone" value={client.phone} placeholder="+1 555..." />
        <EditableField field="company" label="Company" value={client.company} />
        <EditableField field="industry" label="Industry" value={client.industry} />
        <EditableField field="address" label="Address" value={client.address} />
        {/* Timezone selector */}
        {onUpdateTimezone && (
          <div className="group" ref={tzRef}>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Timezone</p>
            <div
              onClick={() => setTzOpen(!tzOpen)}
              className="flex items-center gap-1.5 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 -my-1 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800/60 group/edit relative"
            >
              {client.timezone ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Icons.Globe size={13} className="text-blue-500 shrink-0" />
                  <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{tzCity(client.timezone)}</span>
                  <span className="text-[10px] text-zinc-400 font-mono shrink-0">{tzNow(client.timezone)}</span>
                </div>
              ) : (
                <span className="text-sm text-zinc-300 dark:text-zinc-600 italic">Set timezone...</span>
              )}
              <Icons.ChevronDown size={12} className="text-zinc-300 opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
            </div>
            {tzOpen && (
              <div className="absolute z-30 mt-1 w-72 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 max-h-64 overflow-hidden">
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
                  <input
                    type="text"
                    value={tzSearch}
                    onChange={e => setTzSearch(e.target.value)}
                    placeholder="Search timezone..."
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:border-blue-400"
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto max-h-[200px] py-1">
                  {client.timezone && (
                    <button
                      onClick={() => { onUpdateTimezone(null); setTzOpen(false); setTzSearch(''); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <Icons.X size={12} /> Clear timezone
                    </button>
                  )}
                  {TIMEZONE_OPTIONS.map(group => {
                    const filtered = group.zones.filter(z =>
                      z.label.toLowerCase().includes(tzSearch.toLowerCase()) ||
                      z.value.toLowerCase().includes(tzSearch.toLowerCase())
                    );
                    if (filtered.length === 0) return null;
                    return (
                      <div key={group.group}>
                        <p className="px-3 pt-2 pb-1 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">{group.group}</p>
                        {filtered.map(z => (
                          <button
                            key={z.value}
                            onClick={() => { onUpdateTimezone(z.value); setTzOpen(false); setTzSearch(''); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors ${
                              client.timezone === z.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : 'text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <Icons.Globe size={11} className="shrink-0 text-zinc-400" />
                            <span className="truncate flex-1 text-left">{z.label}</span>
                            <span className="text-[10px] text-zinc-400 font-mono shrink-0">{tzNow(z.value)}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {onUpdateColor && (
        <div className="mb-6">
          <ColorPalette
            label="Color"
            value={client.color}
            onChange={onUpdateColor}
            allowClear
          />
        </div>
      )}

      {client.notes && (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-6">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Notes</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{client.notes}</p>
        </div>
      )}

      {/* Projects assignment */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Linked projects</p>
          {assignedProjects.length > 0 && (
            <span className="text-[10px] font-semibold text-zinc-400">{assignedProjects.length}</span>
          )}
        </div>

        {/* Linked projects list */}
        <AnimatePresence>
          {assignedProjects.length > 0 && (
            <div className="space-y-2 mb-3">
              {assignedProjects.map((proj, idx) => (
                <motion.div
                  key={proj.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className="group flex items-center justify-between p-3 bg-white dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/40 rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onNavigateToProject?.(proj.id)}
                    title="Go to project"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <Icons.Briefcase size={15} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{proj.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          proj.status === 'Active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : proj.status === 'Pending' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                        }`}>
                          {proj.status || 'Active'}
                        </span>
                        {typeof proj.progress === 'number' && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${proj.progress}%` }} />
                            </div>
                            <span className="text-[10px] text-zinc-400 font-medium">{proj.progress}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onUnassignProject(proj.id)}
                    className="p-1.5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all shrink-0"
                    title="Unlink"
                  >
                    <Icons.X size={13} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Assign new project - custom dropdown */}
        {availableProjects.length === 0 ? (
          <p className="text-[11px] text-zinc-400 italic">No projects found. Create a project first.</p>
        ) : unlinked.length === 0 ? (
          <p className="text-[11px] text-zinc-400 italic mt-1">All projects are linked.</p>
        ) : (
          <div className="relative" ref={projectDropdownRef}>
            <button
              onClick={onToggleProjectDropdown}
              disabled={assigningProject}
              className="w-full flex items-center gap-2 p-2.5 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl text-zinc-400 dark:text-zinc-500 hover:border-emerald-400 hover:text-emerald-500 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition-all text-[12px] font-medium disabled:opacity-40"
            >
              {assigningProject ? (
                <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <Icons.Plus size={14} className="shrink-0" />
              )}
              <span>Link a project...</span>
            </button>

            {showProjectDropdown && (
              <div className="absolute z-20 mt-1.5 w-full bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 max-h-52 overflow-y-auto py-1">
                {unlinked.filter(p => !p.client_id).length > 0 && (
                  <>
                    <p className="px-3 pt-1.5 pb-1 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Available</p>
                    {unlinked.filter(p => !p.client_id).map(p => (
                      <button
                        key={p.id}
                        onClick={() => onAssignProject(p.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-left transition-colors"
                      >
                        <Icons.Briefcase size={13} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200 truncate flex-1">{p.title}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                          p.status === 'Active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : p.status === 'Pending' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                        }`}>{p.status || 'Active'}</span>
                      </button>
                    ))}
                  </>
                )}
                {unlinked.filter(p => p.client_id).length > 0 && (
                  <>
                    {unlinked.filter(p => !p.client_id).length > 0 && (
                      <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />
                    )}
                    <p className="px-3 pt-1.5 pb-1 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">From other clients</p>
                    {unlinked.filter(p => p.client_id).map(p => (
                      <button
                        key={p.id}
                        onClick={() => onAssignProject(p.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-left transition-colors"
                      >
                        <Icons.Briefcase size={13} className="text-zinc-300 dark:text-zinc-600 shrink-0" />
                        <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 truncate flex-1">{p.title}</span>
                        <span className="text-[9px] font-medium text-amber-500 shrink-0">other client</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
