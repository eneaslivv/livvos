/**
 * useContentStrategy — read/upsert the per-tenant content_strategy row.
 *
 * One row per tenant. We lazy-create on first edit (no row exists for
 * tenants that haven't opened the brain panel yet).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';

export interface StrategyObjective {
  id: string;
  text: string;
  /** Anchored Monday of the week this objective belongs to, or null if it's evergreen. */
  week_start: string | null;
  done: boolean;
  created_at: string;
  created_by?: string | null;
}

export interface StrategyDoc {
  id: string;
  name: string;
  url: string;
  /** 'upload' = uploaded to storage, 'link' = external URL, 'doc' = internal doc. */
  kind: 'upload' | 'link' | 'doc';
  added_at: string;
  added_by?: string | null;
}

export interface StrategyAISuggestionItem {
  id: string;
  title: string;
  body: string;
  suggested_date?: string | null;
  format?: string | null;
  hook?: string | null;
}

export interface ContentStrategy {
  id: string;
  tenant_id: string;
  summary: string | null;
  pinned_notes: string | null;
  objectives: StrategyObjective[];
  documents: StrategyDoc[];
  ai_suggestions: { generated_at?: string; items?: StrategyAISuggestionItem[] };
  created_at: string;
  updated_at: string;
}

const empty = (tenantId: string): ContentStrategy => ({
  id: '',
  tenant_id: tenantId,
  summary: null,
  pinned_notes: null,
  objectives: [],
  documents: [],
  ai_suggestions: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export function useContentStrategy() {
  const { currentTenant } = useTenant();
  const [strategy, setStrategy] = useState<ContentStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const tenantIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_strategy')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .maybeSingle();
      if (error) throw error;
      setStrategy(data ? (data as ContentStrategy) : empty(currentTenant.id));
    } catch (err) {
      errorLogger.warn('content_strategy refresh failed', err);
      setStrategy(empty(currentTenant.id));
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  // Initial load + tenant switch.
  useEffect(() => {
    if (!currentTenant?.id) return;
    if (tenantIdRef.current === currentTenant.id) return;
    tenantIdRef.current = currentTenant.id;
    refresh();
  }, [currentTenant?.id, refresh]);

  // Upsert — applies a partial patch and writes back. Local state is
  // updated optimistically; failures roll back.
  const update = useCallback(async (patch: Partial<Omit<ContentStrategy, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>) => {
    if (!currentTenant?.id) return;
    const prev = strategy;
    const next: ContentStrategy = { ...(prev || empty(currentTenant.id)), ...patch, updated_at: new Date().toISOString() };
    setStrategy(next);
    try {
      const { data, error } = await supabase
        .from('content_strategy')
        .upsert({
          tenant_id: currentTenant.id,
          summary: next.summary,
          pinned_notes: next.pinned_notes,
          objectives: next.objectives,
          documents: next.documents,
          ai_suggestions: next.ai_suggestions,
        }, { onConflict: 'tenant_id' })
        .select()
        .single();
      if (error) throw error;
      setStrategy(data as ContentStrategy);
    } catch (err) {
      errorLogger.error('content_strategy upsert failed', err);
      if (prev) setStrategy(prev);
      throw err;
    }
  }, [currentTenant?.id, strategy]);

  // Convenience helpers
  const addObjective = useCallback(async (text: string, weekStart: string | null = null) => {
    if (!text.trim()) return;
    const list = strategy?.objectives || [];
    const item: StrategyObjective = {
      id: crypto.randomUUID(),
      text: text.trim(),
      week_start: weekStart,
      done: false,
      created_at: new Date().toISOString(),
    };
    await update({ objectives: [...list, item] });
  }, [strategy?.objectives, update]);

  const updateObjective = useCallback(async (id: string, patch: Partial<StrategyObjective>) => {
    const list = (strategy?.objectives || []).map(o => o.id === id ? { ...o, ...patch } : o);
    await update({ objectives: list });
  }, [strategy?.objectives, update]);

  const deleteObjective = useCallback(async (id: string) => {
    const list = (strategy?.objectives || []).filter(o => o.id !== id);
    await update({ objectives: list });
  }, [strategy?.objectives, update]);

  const addDocument = useCallback(async (doc: Omit<StrategyDoc, 'id' | 'added_at'>) => {
    const list = strategy?.documents || [];
    const item: StrategyDoc = {
      id: crypto.randomUUID(),
      added_at: new Date().toISOString(),
      ...doc,
    };
    await update({ documents: [...list, item] });
  }, [strategy?.documents, update]);

  const deleteDocument = useCallback(async (id: string) => {
    const list = (strategy?.documents || []).filter(d => d.id !== id);
    await update({ documents: list });
  }, [strategy?.documents, update]);

  return {
    strategy,
    loading,
    refresh,
    update,
    addObjective,
    updateObjective,
    deleteObjective,
    addDocument,
    deleteDocument,
  };
}
