/**
 * useCrossTenantTasks — hook that fetches every open task assigned to or
 * owned by the current user, across ALL the workspaces they're a member
 * of. Backed by the SECURITY DEFINER RPC `list_my_cross_tenant_tasks`,
 * which handles the cross-tenant SELECT in a single round-trip.
 *
 * Auto-refreshes when:
 *  - The user changes (auth event)
 *  - The current tenant changes (so the "active tenant" badge stays in
 *    sync with what's currently rendered as today's view)
 *  - A subscriber elsewhere triggers `refresh()`
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useTenant } from '../context/TenantContext';

export interface CrossTenantTask {
  task_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | string;
  due_date: string | null;
  start_date: string | null;
  assignee_id: string | null;
  owner_id: string | null;
  project_id: string | null;
  project_title: string | null;
  is_overdue: boolean;
  created_at: string;
}

interface UseCrossTenantTasksReturn {
  tasks: CrossTenantTask[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCrossTenantTasks(): UseCrossTenantTasksReturn {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [tasks, setTasks] = useState<CrossTenantTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) { setTasks([]); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('list_my_cross_tenant_tasks');
      if (error) throw error;
      setTasks((data as CrossTenantTask[]) || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh, currentTenant?.id]);

  return { tasks, loading, error, refresh };
}
