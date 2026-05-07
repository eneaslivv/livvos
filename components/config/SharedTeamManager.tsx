/**
 * SharedTeamManager — UI for the parent agency's owners/admins to manage
 * which of their team members have access to each connected child agency.
 *
 * Two views (in one component):
 *   1. List of accepted child connections (from list_my_managed_connections)
 *   2. Per-connection modal showing every native team member with a toggle
 *      that calls share_team_member_with_tenant / unshare_team_member_from_tenant
 *
 * The RPCs handle authorization (only owner/admin of the parent), so the
 * frontend can stay simple. Optimistic updates so toggles feel instant.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Icons } from '../ui/Icons';

// ── Types mirroring the RPC return rows ───────────────────────────────────

interface ManagedConnection {
  connection_id: string;
  parent_tenant_id: string;
  child_tenant_id: string;
  child_name: string;
  child_logo_url: string | null;
  child_slug: string | null;
  shared_count: number;
  accepted_at: string | null;
}

interface ShareableMember {
  user_id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  has_access: boolean;
  role: string;
}

// ── Manager (top-level section component) ─────────────────────────────────

export const SharedTeamManager: React.FC = () => {
  const [connections, setConnections] = useState<ManagedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeChild, setActiveChild] = useState<ManagedConnection | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('list_my_managed_connections');
      if (error) throw error;
      setConnections((data as ManagedConnection[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Icons.Users size={18} className="text-zinc-500" />
            Shared team access
          </h2>
          <p className="text-[13px] text-zinc-500 mt-1 max-w-2xl">
            Pick which of your team members can access each connected agency. Sharing
            grants them read+write inside that workspace and shows the workspace in
            their tenant switcher.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">Couldn't load: {error}</p>
      ) : connections.length === 0 ? (
        <div className="mt-4 p-6 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 text-center text-sm text-zinc-500">
          No connected agencies yet. Once you accept a connection, you'll be able to
          manage shared team access here.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {connections.map(conn => (
            <li key={conn.connection_id} className="py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                {conn.child_logo_url ? (
                  <img src={conn.child_logo_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[11px] font-bold text-zinc-500">
                    {(conn.child_name || '?').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {conn.child_name}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {conn.shared_count > 0 ? (
                    <>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {conn.shared_count}
                      </span>
                      {' '}member{conn.shared_count === 1 ? '' : 's'} from your team have access
                    </>
                  ) : (
                    <span className="text-zinc-400">Only you have access</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveChild(conn)}
                className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 inline-flex items-center gap-1.5"
              >
                <Icons.Users size={12} /> Manage team
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeChild && (
        <SharedTeamModal
          conn={activeChild}
          onClose={() => setActiveChild(null)}
          onChanged={() => { void refresh(); }}
        />
      )}
    </section>
  );
};

// ── Per-connection modal ──────────────────────────────────────────────────

interface SharedTeamModalProps {
  conn: ManagedConnection;
  onClose: () => void;
  /** Called after a toggle so the parent list can refresh shared_count. */
  onChanged: () => void;
}

const SharedTeamModal: React.FC<SharedTeamModalProps> = ({ conn, onClose, onChanged }) => {
  const [members, setMembers] = useState<ShareableMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('list_shareable_team_members', {
        p_child_tenant_id: conn.child_tenant_id,
      });
      if (error) throw error;
      setMembers((data as ShareableMember[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [conn.child_tenant_id]);

  useEffect(() => { void load(); }, [load]);

  // Esc / backdrop close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggleAccess = useCallback(async (m: ShareableMember) => {
    setBusy(prev => new Set(prev).add(m.user_id));
    // Optimistic flip
    setMembers(prev => prev.map(x => x.user_id === m.user_id ? { ...x, has_access: !x.has_access } : x));
    try {
      const rpc = m.has_access
        ? 'unshare_team_member_from_tenant'
        : 'share_team_member_with_tenant';
      const args = m.has_access
        ? { p_user_id: m.user_id, p_tenant_id: conn.child_tenant_id }
        : { p_user_id: m.user_id, p_tenant_id: conn.child_tenant_id, p_role: 'member' };
      const { error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      onChanged();
    } catch (e) {
      // Revert on failure
      setMembers(prev => prev.map(x => x.user_id === m.user_id ? { ...x, has_access: m.has_access } : x));
      setError((e as Error).message);
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(m.user_id); return n; });
    }
  }, [conn.child_tenant_id, onChanged]);

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 fade-in duration-150 flex flex-col max-h-[80vh]">
          <header className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                {conn.child_logo_url ? (
                  <img src={conn.child_logo_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[11px] font-bold text-zinc-500">
                    {(conn.child_name || '?').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Manage shared team</div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">{conn.child_name}</h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <Icons.X size={16} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-zinc-400">
                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <p className="p-5 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            ) : members.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500 text-center">
                No team members in your agency yet. Invite teammates from the Team
                page first, then come back to share access.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {members.map(m => {
                  const isBusy = busy.has(m.user_id);
                  return (
                    <li key={m.user_id} className="px-5 py-3 flex items-center gap-3">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                          {((m.name || m.email || '?')[0] || '?').toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {m.name || m.email}
                        </div>
                        {m.name && (
                          <div className="text-[11px] text-zinc-400 truncate">{m.email}</div>
                        )}
                      </div>
                      {/* Toggle */}
                      <button
                        onClick={() => toggleAccess(m)}
                        disabled={isBusy}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                          m.has_access ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                        title={m.has_access ? 'Revoke access' : 'Grant access'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            m.has_access ? 'translate-x-6' : 'translate-x-1'
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
            Toggling on grants <span className="font-medium text-zinc-600 dark:text-zinc-300">member</span> role inside this connected workspace. They'll get a notification.
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
};
