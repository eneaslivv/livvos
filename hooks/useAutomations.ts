/**
 * useAutomations — user-defined cross-module automations.
 * Same pattern as useBrands / usePartners.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import type { Automation, AutomationInsert, AutomationLog } from '../types';

interface UseAutomationsState {
  automations: Automation[];
  logs: AutomationLog[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsertAutomation: (data: AutomationInsert & { id?: string }) => Promise<Automation | null>;
  toggleAutomation: (id: string, nextStatus: 'active' | 'paused') => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
}

export const useAutomations = (): UseAutomationsState => {
  const { currentTenant } = useTenant();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [aRes, lRes] = await Promise.all([
        supabase.from('automations').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
        supabase.from('automation_logs').select('*').eq('tenant_id', currentTenant.id).order('triggered_at', { ascending: false }).limit(50),
      ]);
      setAutomations((aRes.data || []) as Automation[]);
      setLogs((lRes.data || []) as AutomationLog[]);
    } catch (e) {
      setError((e as Error).message || 'Could not load automations');
      errorLogger.warn('useAutomations load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!currentTenant?.id) return;
    const ch = supabase
      .channel(`automations-${currentTenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automations',     filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_logs', filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentTenant?.id, refresh]);

  const upsertAutomation = useCallback<UseAutomationsState['upsertAutomation']>(async (data) => {
    if (!currentTenant?.id) return null;
    const payload = { ...data, tenant_id: currentTenant.id } as any;
    const { data: row, error: e } = await supabase
      .from('automations')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (e) { errorLogger.warn('upsertAutomation failed', e); setError(e.message); return null; }
    return row as Automation;
  }, [currentTenant?.id]);

  const toggleAutomation = useCallback<UseAutomationsState['toggleAutomation']>(async (id, nextStatus) => {
    const { error: e } = await supabase.from('automations').update({ status: nextStatus }).eq('id', id);
    if (e) errorLogger.warn('toggleAutomation failed', e);
  }, []);

  const deleteAutomation = useCallback<UseAutomationsState['deleteAutomation']>(async (id) => {
    await supabase.from('automations').delete().eq('id', id);
  }, []);

  return useMemo(() => ({
    automations,
    logs,
    loading,
    error,
    refresh,
    upsertAutomation,
    toggleAutomation,
    deleteAutomation,
  }), [automations, logs, loading, error, refresh, upsertAutomation, toggleAutomation, deleteAutomation]);
};
