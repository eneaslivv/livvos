// ============================================================
// Quoting — browser API client.
// AI ops go through Supabase Edge Functions (supabase.functions.invoke
// attaches the user's JWT). Reads use the RLS-scoped browser client,
// so everything is automatically tenant-isolated.
// ============================================================

import { supabase } from '@/lib/supabase';

async function invoke<T = any>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || `${fn} failed`);
  if (data && (data as any).ok === false) throw new Error((data as any).error || `${fn} error`);
  return data as T;
}

export const quotingApi = {
  generateQuote: (body: { brief: string | object; market?: 'us' | 'latam'; isExistingClient?: boolean }) =>
    invoke('quoting-generate', body),
  generateOnboarding: (body: { proposalId: string; persist?: boolean }) =>
    invoke('onboarding-generate', body),
  previewSync: (body: { onboardingId: string; startDate?: string }) =>
    invoke('onboarding-sync', { ...body, dryRun: true }),
  syncToLean: (body: {
    onboardingId: string;
    mode?: 'create' | 'update';
    projectId?: string;
    startDate?: string;
    ownerMap?: Record<string, string>;
    force?: boolean;
  }) => invoke('onboarding-sync', { ...body, dryRun: false }),
};

// --- session / identity ---
export async function getQuotingSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, name, full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  return {
    userId: user.id,
    tenantId: profile?.tenant_id ?? null,
    name: profile?.full_name || profile?.name || user.email || 'You',
    avatarUrl: profile?.avatar_url ?? null,
  };
}

// --- reads (RLS handles tenant scoping) ---
export async function listProposals() {
  const { data } = await supabase
    .from('proposals')
    .select('id, title, status, project_type, summary, pricing_total, currency, created_at, updated_at, client_id')
    .order('updated_at', { ascending: false })
    .limit(60);
  return data || [];
}

export async function getProposal(id: string) {
  const { data } = await supabase.from('proposals').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function listServices() {
  const { data } = await supabase
    .from('service_pricing')
    .select('*')
    .eq('is_active', true)
    .order('fixed_price', { ascending: false });
  return data || [];
}

export async function pricingMemory() {
  const [projectsRes, proposalsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, title, status, budget_total, budget_paid, currency')
      .order('budget_total', { ascending: false })
      .limit(60),
    supabase
      .from('proposals')
      .select('id, title, status, pricing_total, pricing_snapshot, currency')
      .limit(120),
  ]);
  return { projects: projectsRes.data || [], proposals: proposalsRes.data || [] };
}

export async function listOnboardings() {
  const { data } = await supabase
    .from('project_onboardings')
    .select('id, proposal_id, client_id, project_id, status, approved_value, currency, plan, sync_result, synced_at, created_at')
    .order('created_at', { ascending: false })
    .limit(60);
  return data || [];
}

export async function getOnboarding(id: string) {
  const { data } = await supabase.from('project_onboardings').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function updateOnboardingPlan(id: string, plan: unknown) {
  const { data, error } = await supabase
    .from('project_onboardings')
    .update({ plan })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
