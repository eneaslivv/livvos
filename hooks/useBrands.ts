/**
 * useBrands — single-tenant brand kits list with CRUD + moodboard +
 * references. Follows the same pattern as useClients / useTeam / etc:
 *
 *   • Loads on tenant change
 *   • Subscribes to realtime so other tabs see updates instantly
 *   • Exposes upsert / delete / addMoodboardItem / addReference
 *
 * Brand training (compiling the brand_prompt) is NOT in this hook —
 * it lives in `lib/ai.ts` as `trainBrandStyle()` and writes back to
 * the brand row, which then comes back via realtime.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import type { Brand, BrandInsert, BrandMoodboardItem, BrandReference } from '../types';

interface UseBrandsState {
  brands: Brand[];
  moodboard: BrandMoodboardItem[];
  references: BrandReference[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsertBrand: (data: BrandInsert & { id?: string }) => Promise<Brand | null>;
  deleteBrand: (id: string) => Promise<void>;
  addMoodboardItem: (brandId: string, item: Omit<BrandMoodboardItem, 'id' | 'brand_id' | 'tenant_id' | 'created_at'>) => Promise<BrandMoodboardItem | null>;
  removeMoodboardItem: (id: string) => Promise<void>;
  addReference: (brandId: string, ref: Omit<BrandReference, 'id' | 'brand_id' | 'tenant_id' | 'created_at'>) => Promise<BrandReference | null>;
  removeReference: (id: string) => Promise<void>;
}

export const useBrands = (): UseBrandsState => {
  const { currentTenant } = useTenant();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [moodboard, setMoodboard] = useState<BrandMoodboardItem[]>([]);
  const [references, setReferences] = useState<BrandReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Three queries in parallel — server is fast on these small tables.
      const [brandsRes, moodRes, refsRes] = await Promise.all([
        supabase
          .from('brands')
          .select('*')
          .eq('tenant_id', currentTenant.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('brand_moodboard')
          .select('*')
          .eq('tenant_id', currentTenant.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('brand_references')
          .select('*')
          .eq('tenant_id', currentTenant.id)
          .order('created_at', { ascending: false }),
      ]);
      setBrands((brandsRes.data || []) as Brand[]);
      setMoodboard((moodRes.data || []) as BrandMoodboardItem[]);
      setReferences((refsRes.data || []) as BrandReference[]);
    } catch (e) {
      const msg = (e as Error).message || 'Could not load brands';
      setError(msg);
      errorLogger.warn('useBrands load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Realtime — keep brands list in sync across tabs ─────────────
  useEffect(() => {
    if (!currentTenant?.id) return;
    const channel = supabase
      .channel(`brands-${currentTenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands', filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_moodboard', filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_references', filter: `tenant_id=eq.${currentTenant.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentTenant?.id, refresh]);

  // ── Mutations ───────────────────────────────────────────────────
  const upsertBrand = useCallback<UseBrandsState['upsertBrand']>(async (data) => {
    if (!currentTenant?.id) return null;
    const payload = { ...data, tenant_id: currentTenant.id } as any;
    const { data: row, error: e } = await supabase
      .from('brands')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (e) {
      errorLogger.warn('upsertBrand failed', e);
      setError(e.message);
      return null;
    }
    return row as Brand;
  }, [currentTenant?.id]);

  const deleteBrand = useCallback<UseBrandsState['deleteBrand']>(async (id) => {
    const { error: e } = await supabase.from('brands').delete().eq('id', id);
    if (e) {
      errorLogger.warn('deleteBrand failed', e);
      setError(e.message);
    }
  }, []);

  const addMoodboardItem = useCallback<UseBrandsState['addMoodboardItem']>(async (brandId, item) => {
    if (!currentTenant?.id) return null;
    const { data: row, error: e } = await supabase
      .from('brand_moodboard')
      .insert({ ...item, brand_id: brandId, tenant_id: currentTenant.id })
      .select('*')
      .single();
    if (e) { errorLogger.warn('addMoodboardItem failed', e); return null; }
    return row as BrandMoodboardItem;
  }, [currentTenant?.id]);

  const removeMoodboardItem = useCallback<UseBrandsState['removeMoodboardItem']>(async (id) => {
    await supabase.from('brand_moodboard').delete().eq('id', id);
  }, []);

  const addReference = useCallback<UseBrandsState['addReference']>(async (brandId, ref) => {
    if (!currentTenant?.id) return null;
    const { data: row, error: e } = await supabase
      .from('brand_references')
      .insert({ ...ref, brand_id: brandId, tenant_id: currentTenant.id })
      .select('*')
      .single();
    if (e) { errorLogger.warn('addReference failed', e); return null; }
    return row as BrandReference;
  }, [currentTenant?.id]);

  const removeReference = useCallback<UseBrandsState['removeReference']>(async (id) => {
    await supabase.from('brand_references').delete().eq('id', id);
  }, []);

  // Stable identity for downstream memo hooks.
  return useMemo<UseBrandsState>(() => ({
    brands,
    moodboard,
    references,
    loading,
    error,
    refresh,
    upsertBrand,
    deleteBrand,
    addMoodboardItem,
    removeMoodboardItem,
    addReference,
    removeReference,
  }), [brands, moodboard, references, loading, error, refresh, upsertBrand, deleteBrand, addMoodboardItem, removeMoodboardItem, addReference, removeReference]);
};
