/**
 * PlatformRoles — master-mode "Roles & Access" panel.
 *
 * Cross-tenant view of every role in the system with usage counts,
 * permission matrix, and the live cross-tenant breakdown of which
 * tenants have how many users in each role. Built for Eneas (the
 * platform owner) to answer questions like:
 *
 *   • What can each role actually do? (Plain-English summary)
 *   • How many tenants use each role and how many users hold it?
 *   • Where are users concentrated — agency by agency?
 *
 * The matrix toggles permissions for global system roles. Per-tenant
 * custom roles also appear here; editing their permissions is left to
 * the per-tenant Configuration → Roles tab to keep tenant boundaries
 * crisp (a custom role is always tenant-scoped today).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { usePlatformAdmin } from '../hooks/usePlatformAdmin';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface RoleOverview {
  role_id: string;
  role_name: string;
  description: string | null;
  is_system: boolean;
  user_count: number;
  tenant_count: number;
  permission_count: number;
}

interface PermissionRow {
  permission_id: string;
  module: string;
  action: string;
  description: string | null;
}

interface RolePermissionRow {
  role_id: string;
  permission_id: string;
  module: string;
  action: string;
}

interface UsersByRoleByTenant {
  tenant_id: string;
  tenant_name: string;
  role_name: string;
  user_count: number;
}

// Plain-English summaries so non-technical operators understand what
// each role actually means without parsing module:action checkboxes.
// Anything not listed falls back to a generic "Custom role" message.
const ROLE_DESCRIPTIONS: Record<string, { headline: string; details: string }> = {
  owner: {
    headline: 'Full control of the workspace',
    details: 'Sees and edits everything. Can invite, change roles, manage billing and tenant settings.',
  },
  admin: {
    headline: 'Day-to-day administrator',
    details: 'Same access as owner except cannot manage system-level settings or platform billing.',
  },
  manager: {
    headline: 'Operational team lead',
    details: 'Reads everything, creates and edits projects, tasks, clients, calendar entries. Cannot delete data or assign roles.',
  },
  sales: {
    headline: 'Sales / CRM specialist',
    details: 'Full access to leads, deals, communications inbox, sales analytics. No access to internal projects or finance.',
  },
  finance: {
    headline: 'Finance officer',
    details: 'Full access to invoices, expenses, budgets, P&L. Can view analytics. No access to internal team or sales.',
  },
  viewer: {
    headline: 'Read-only observer',
    details: 'Can browse projects, calendar, docs, dashboards. Cannot create, edit or delete anything.',
  },
  client: {
    headline: 'External client (portal)',
    details: 'Only sees their assigned projects via the client portal. Cannot access the internal workspace.',
  },
};

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────

export const PlatformRoles: React.FC = () => {
  const { isPlatformAdmin, isLoading: adminLoading } = usePlatformAdmin();

  const [roles, setRoles] = useState<RoleOverview[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermissionRow[]>([]);
  const [tenantUsage, setTenantUsage] = useState<UsersByRoleByTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Single-shot loader. Refreshes on demand via the header button. We
  // fire all 4 RPCs in parallel since they each read a different table
  // and don't depend on each other.
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes, rpRes, usageRes] = await Promise.all([
        supabase.rpc('platform_roles_overview'),
        supabase.rpc('platform_permissions_catalog'),
        supabase.rpc('platform_role_permissions'),
        supabase.rpc('platform_users_by_role_by_tenant'),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (permsRes.error) throw permsRes.error;
      if (rpRes.error) throw rpRes.error;
      if (usageRes.error) throw usageRes.error;

      setRoles((rolesRes.data as RoleOverview[]) || []);
      setPermissions((permsRes.data as PermissionRow[]) || []);
      setRolePerms((rpRes.data as RolePermissionRow[]) || []);
      setTenantUsage((usageRes.data as UsersByRoleByTenant[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) refresh();
  }, [isPlatformAdmin]);

  // Default-select the first system role so the matrix has something
  // to render the first time the page loads.
  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles.find(r => r.is_system)?.role_id || roles[0].role_id);
    }
  }, [roles, selectedRoleId]);

  // ──────────────────────────────────────────────────────────────────
  // Derivations
  // ──────────────────────────────────────────────────────────────────

  const selectedRole = roles.find(r => r.role_id === selectedRoleId) || null;

  // Permissions held by the selected role, indexed by id for O(1) checks.
  const selectedRolePermIds = useMemo(() => {
    const set = new Set<string>();
    for (const rp of rolePerms) {
      if (rp.role_id === selectedRoleId) set.add(rp.permission_id);
    }
    return set;
  }, [rolePerms, selectedRoleId]);

  // Group permissions by module so the matrix reads as 12 columns instead
  // of a flat 60-row list.
  const permsByModule = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const arr = map.get(p.module) || [];
      arr.push(p);
      map.set(p.module, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, rows]) => ({ module, rows: rows.sort((a, b) => a.action.localeCompare(b.action)) }));
  }, [permissions]);

  // Pivot tenantUsage into a per-tenant summary card grid.
  const tenantsWithUsage = useMemo(() => {
    const map = new Map<string, { tenant_id: string; tenant_name: string; roles: { role_name: string; user_count: number }[]; total: number }>();
    for (const row of tenantUsage) {
      const key = row.tenant_id;
      const entry = map.get(key) || { tenant_id: row.tenant_id, tenant_name: row.tenant_name, roles: [], total: 0 };
      entry.roles.push({ role_name: row.role_name, user_count: row.user_count });
      entry.total += row.user_count;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [tenantUsage]);

  // ──────────────────────────────────────────────────────────────────
  // Mutations
  // ──────────────────────────────────────────────────────────────────

  // Toggle a single (role, permission) pair. We update local state
  // optimistically so the UI feels instant; if the DB call fails we
  // rollback and surface the error. System roles still allow this
  // since the backend RLS already gates writes on platform_admin.
  const togglePermission = async (permissionId: string) => {
    if (!selectedRole) return;
    if (savingPermissions) return;
    const has = selectedRolePermIds.has(permissionId);
    setSavingPermissions(true);
    setError(null);

    // Optimistic update.
    const before = rolePerms;
    setRolePerms(prev => has
      ? prev.filter(rp => !(rp.role_id === selectedRole.role_id && rp.permission_id === permissionId))
      : [...prev, {
          role_id: selectedRole.role_id,
          permission_id: permissionId,
          module: permissions.find(p => p.permission_id === permissionId)?.module || '',
          action: permissions.find(p => p.permission_id === permissionId)?.action || '',
        }]);

    try {
      if (has) {
        const { error: e } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', selectedRole.role_id)
          .eq('permission_id', permissionId);
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('role_permissions')
          .insert({ role_id: selectedRole.role_id, permission_id: permissionId });
        if (e) throw e;
      }
      // Re-pull the role overview so user_count / permission_count refresh.
      const { data: ov } = await supabase.rpc('platform_roles_overview');
      if (ov) setRoles(ov as RoleOverview[]);
    } catch (err: any) {
      // Rollback.
      setRolePerms(before);
      setError(err?.message || 'Could not save permission change');
    } finally {
      setSavingPermissions(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
          <Icons.Shield size={24} className="text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Access Denied</h2>
        <p className="text-zinc-500 mt-2">Platform admin access required.</p>
      </div>
    );
  }

  const totalUsers = tenantsWithUsage.reduce((s, t) => s + t.total, 0);
  const customRoles = roles.filter(r => !r.is_system).length;

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            Master · Roles & Access
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
            Roles, permissions, and who can see what
          </h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Cross-tenant view of every role in LivvOS. Edit permissions for system roles,
            inspect custom roles created per-tenant, and see how users are distributed.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <Icons.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-700 dark:text-rose-300">
          <Icons.AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── KPI strip ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'System roles',     value: roles.filter(r => r.is_system).length, accent: 'text-zinc-900 dark:text-zinc-100' },
          { label: 'Custom roles',     value: customRoles,                            accent: 'text-violet-600 dark:text-violet-400' },
          { label: 'Permissions',      value: permissions.length,                     accent: 'text-blue-600 dark:text-blue-400' },
          { label: 'Users assigned',   value: totalUsers,                             accent: 'text-emerald-600 dark:text-emerald-400' },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.accent}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Two-column layout: roles list + matrix ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Roles list (left rail) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">All roles</h3>
            <span className="text-[10px] text-zinc-400">{roles.length}</span>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-[560px] overflow-y-auto">
            {roles.map(r => {
              const isSelected = selectedRoleId === r.role_id;
              const meta = ROLE_DESCRIPTIONS[r.role_name];
              return (
                <li key={r.role_id}>
                  <button
                    onClick={() => setSelectedRoleId(r.role_id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-zinc-50 dark:bg-zinc-800/50'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize truncate">
                        {r.role_name.replace('_', ' ')}
                      </span>
                      {r.is_system ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          system
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300">
                          custom
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 line-clamp-2">
                      {meta?.headline || r.description || 'Custom role created in a tenant'}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <Icons.Users size={10} /> {r.user_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icons.Briefcase size={10} /> {r.tenant_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icons.Check size={10} /> {r.permission_count}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
            {roles.length === 0 && !loading && (
              <li className="px-4 py-8 text-xs text-zinc-400 text-center">
                No roles defined yet.
              </li>
            )}
          </ul>
        </div>

        {/* Matrix (right) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          {selectedRole ? (
            <>
              {/* Role header */}
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                        {selectedRole.role_name.replace('_', ' ')}
                      </h3>
                      <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        selectedRole.is_system
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                          : 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300'
                      }`}>
                        {selectedRole.is_system ? 'System' : 'Custom'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xl">
                      {ROLE_DESCRIPTIONS[selectedRole.role_name]?.details
                        || selectedRole.description
                        || 'Custom role created in a tenant. Edit its permissions per-tenant from Configuration → Roles.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span><strong className="text-zinc-700 dark:text-zinc-300">{selectedRole.user_count}</strong> users</span>
                    <span><strong className="text-zinc-700 dark:text-zinc-300">{selectedRole.tenant_count}</strong> tenants</span>
                    <span><strong className="text-zinc-700 dark:text-zinc-300">{selectedRole.permission_count}</strong> permissions</span>
                  </div>
                </div>
              </div>

              {/* Permission matrix grouped by module */}
              <div className="p-4 max-h-[560px] overflow-y-auto">
                {permsByModule.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-8">
                    No permissions defined yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {permsByModule.map(({ module, rows }) => (
                      <div key={module}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                          {module}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {rows.map(p => {
                            const checked = selectedRolePermIds.has(p.permission_id);
                            return (
                              <button
                                key={p.permission_id}
                                onClick={() => togglePermission(p.permission_id)}
                                disabled={savingPermissions}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                                  checked
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                                } disabled:opacity-50 disabled:cursor-wait`}
                              >
                                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  checked
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-zinc-300 dark:border-zinc-700'
                                }`}>
                                  {checked && <Icons.Check size={10} strokeWidth={3} />}
                                </span>
                                <span className="font-medium capitalize truncate">{p.action.replace('_', ' ')}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-16 text-zinc-400 text-xs">
              {loading ? 'Loading roles…' : 'Pick a role on the left to view its permissions.'}
            </div>
          )}
        </div>
      </div>

      {/* ─── Cross-tenant usage breakdown ─── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Where users are concentrated</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Per-tenant breakdown of how many users hold which role. Helps spot agencies that
            need more admins, or tenants with skewed access distributions.
          </p>
        </div>
        {tenantsWithUsage.length === 0 ? (
          <div className="px-5 py-10 text-xs text-zinc-400 text-center">
            No tenant memberships yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {tenantsWithUsage.map(t => (
              <div key={t.tenant_id} className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {t.tenant_name}
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-500">{t.total} users</span>
                </div>
                <div className="space-y-1">
                  {t.roles
                    .sort((a, b) => b.user_count - a.user_count)
                    .map(r => (
                      <div key={r.role_name} className="flex items-center justify-between text-[11px]">
                        <span className="capitalize text-zinc-600 dark:text-zinc-400">
                          {r.role_name.replace('_', ' ')}
                        </span>
                        <span className="font-mono text-zinc-700 dark:text-zinc-300">{r.user_count}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
