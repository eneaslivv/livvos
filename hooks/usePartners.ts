/**
 * usePartners — partners + widgets list for the current tenant.
 * Same shape as useBrands: load on tenant change, realtime updates,
 * CRUD helpers, memoized return.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import type { Partner, PartnerInsert, PartnerWidget, PartnerWidgetConfig, PartnerWidgetType } from '../types';

interface UsePartnersState {
  partners: Partner[];
  widgets: PartnerWidget[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsertPartner: (data: PartnerInsert & { id?: string }) => Promise<Partner | null>;
  deletePartner: (id: string) => Promise<void>;
  addWidget: (partnerId: string, type: PartnerWidgetType, config?: PartnerWidgetConfig) => Promise<PartnerWidget | null>;
  updateWidget: (id: string, patch: Partial<PartnerWidget>) => Promise<void>;
  removeWidget: (id: string) => Promise<void>;
}

// Random uppercase-alphanumeric referral code generator. Avoids
// ambiguous chars (0/O, 1/I) so codes are tellable in print/voice.
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateReferralCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) out += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  return out;
}

export const usePartners = (): UsePartnersState & { generateReferralCode: (len?: number) => string } => {
  const { currentTenant } = useTenant();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [widgets, setWidgets] = useState<PartnerWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [pRes, wRes] = await Promise.all([
        supabase.from('partners').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
        supabase.from('partner_widgets').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
      ]);
      setPartners((pRes.data || []) as Partner[]);
      setWidgets((wRes.data || []) as PartnerWidget[]);
    } catch (e) {
      const msg = (e as Error).message || 'Could not load partners';
      setError(msg);
      errorLogger.warn('usePartners load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime — partner + widget changes propagate across tabs.
  useEffect(() => {
    if (!currentTenant?.id) return;
    const ch = supabase
      .channel(`partners-${currentTenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partners',        filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_widgets', filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentTenant?.id, refresh]);

  const upsertPartner = useCallback<UsePartnersState['upsertPartner']>(async (data) => {
    if (!currentTenant?.id) return null;
    const payload = { ...data, tenant_id: currentTenant.id } as any;
    const { data: row, error: e } = await supabase
      .from('partners')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (e) {
      errorLogger.warn('upsertPartner failed', e);
      setError(e.message);
      return null;
    }
    return row as Partner;
  }, [currentTenant?.id]);

  const deletePartner = useCallback<UsePartnersState['deletePartner']>(async (id) => {
    const { error: e } = await supabase.from('partners').delete().eq('id', id);
    if (e) {
      errorLogger.warn('deletePartner failed', e);
      setError(e.message);
    }
  }, []);

  const addWidget = useCallback<UsePartnersState['addWidget']>(async (partnerId, type, config) => {
    if (!currentTenant?.id) return null;
    const { data: row, error: e } = await supabase
      .from('partner_widgets')
      .insert({ partner_id: partnerId, tenant_id: currentTenant.id, type, config: config || {}, status: 'active' })
      .select('*')
      .single();
    if (e) { errorLogger.warn('addWidget failed', e); return null; }
    return row as PartnerWidget;
  }, [currentTenant?.id]);

  const updateWidget = useCallback<UsePartnersState['updateWidget']>(async (id, patch) => {
    const { error: e } = await supabase.from('partner_widgets').update(patch).eq('id', id);
    if (e) errorLogger.warn('updateWidget failed', e);
  }, []);

  const removeWidget = useCallback<UsePartnersState['removeWidget']>(async (id) => {
    await supabase.from('partner_widgets').delete().eq('id', id);
  }, []);

  return useMemo(() => ({
    partners,
    widgets,
    loading,
    error,
    refresh,
    upsertPartner,
    deletePartner,
    addWidget,
    updateWidget,
    removeWidget,
    generateReferralCode,
  }), [partners, widgets, loading, error, refresh, upsertPartner, deletePartner, addWidget, updateWidget, removeWidget]);
};
