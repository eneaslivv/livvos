/**
 * ShareProjectWithAgencyModal — connect a project with a partner agency
 * (a tenant on the other side of an accepted tenant_connections row) so
 * BOTH agencies' members can collaborate on this single project without
 * exposing any of the rest of either workspace.
 *
 * This is the per-project alternative to "Shared team access" (which
 * grants full-workspace access). The user explicitly clarified that
 * agency-wide sharing was too broad — collaboration should be opt-in
 * per-project.
 *
 * Wiring:
 *  - List partners via `list_shareable_agencies_for_project` (only
 *    tenants connected via accepted tenant_connections, in either
 *    direction).
 *  - Toggle on → `share_project_with_agency(project_id, target, 'edit')`
 *  - Toggle off → `unshare_project_from_agency(project_id, target)`
 *
 * The receiving agency's owner gets an in-app notification the moment
 * the share is created (handled inside the share RPC).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Icons } from '../ui/Icons';

interface ShareableAgency {
  tenant_id: string;
  tenant_name: string;
  logo_url: string | null;
  is_shared: boolean;
  share_id: string | null;
  access_level: 'view' | 'edit' | string;
}

interface Props {
  open: boolean;
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  /** Called after each toggle so the parent can refresh badges. */
  onChanged?: () => void;
}

export const ShareProjectWithAgencyModal: React.FC<Props> = ({ open, projectId, projectTitle, onClose, onChanged }) => {
  const [agencies, setAgencies] = useState<ShareableAgency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('list_shareable_agencies_for_project', {
        p_project_id: projectId,
      });
      if (error) throw error;
      setAgencies((data as ShareableAgency[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  // Esc closes modal.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const toggleAgency = useCallback(async (a: ShareableAgency) => {
    setBusy(prev => new Set(prev).add(a.tenant_id));
    setAgencies(prev => prev.map(x => x.tenant_id === a.tenant_id ? { ...x, is_shared: !x.is_shared } : x));
    try {
      if (a.is_shared) {
        const { error } = await supabase.rpc('unshare_project_from_agency', {
          p_project_id: projectId,
          p_target_tenant_id: a.tenant_id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('share_project_with_agency', {
          p_project_id: projectId,
          p_target_tenant_id: a.tenant_id,
          p_access_level: 'edit',
        });
        if (error) throw error;
      }
      onChanged?.();
    } catch (e) {
      // Revert
      setAgencies(prev => prev.map(x => x.tenant_id === a.tenant_id ? { ...x, is_shared: a.is_shared } : x));
      setError((e as Error).message);
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(a.tenant_id); return n; });
    }
  }, [projectId, onChanged]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 fade-in duration-150 flex flex-col max-h-[80vh]">
          {/* Header */}
          <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Connect with agency</div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate mt-0.5">{projectTitle}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <Icons.X size={16} />
            </button>
          </header>

          {/* Explainer */}
          <div className="px-5 pt-3 pb-2 text-[12px] text-zinc-500 dark:text-zinc-400 leading-snug">
            Pick partner agencies that should see and collaborate on{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">this project only</span>.
            They'll see its tasks and details, but nothing else from your workspace.
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-zinc-400">
                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            ) : agencies.length === 0 ? (
              <div className="p-5 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Icons.Briefcase size={16} className="text-zinc-400" />
                </div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No connected agencies</p>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-[280px] mx-auto">
                  Connect a partner agency from the workspace switcher first. Once
                  the connection is accepted, you'll be able to share specific
                  projects with them here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {agencies.map(a => {
                  const isBusy = busy.has(a.tenant_id);
                  return (
                    <li key={a.tenant_id} className="px-5 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                        {a.logo_url ? (
                          <img src={a.logo_url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[11px] font-bold text-zinc-500">
                            {a.tenant_name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {a.tenant_name}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {a.is_shared
                            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Connected — they can {a.access_level}</span>
                            : 'Connected partner · not sharing this project'}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleAgency(a)}
                        disabled={isBusy}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                          a.is_shared ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                        title={a.is_shared ? 'Disconnect this project' : 'Connect this project'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            a.is_shared ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400">
            Either agency can disconnect the project at any time. Disconnecting
            stops the sync but doesn't delete anything.
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
};
