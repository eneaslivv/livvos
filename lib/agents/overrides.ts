/**
 * Runtime overrides for agent routing hints + system prompts.
 *
 * The TypeScript files in lib/agents/agents/*-agent.ts ship hardcoded
 * defaults that work for every tenant. Once a tenant uses the system
 * long enough, the prompt-tuner can propose tweaks based on actual
 * conversation data. Approved tweaks land in the agent_overrides DB
 * table; this module fetches + caches them and merges them into the
 * agent definition at runtime.
 *
 * Composition rules:
 *   routing_hints  = (defaults ∪ overrideAdd) ∖ overrideRemove
 *   system_prompt  = defaults + '\n\n' + overridePromptSuffix
 *
 * Note: only the prompt_suffix is appended — we NEVER replace the
 * base prompt. Keeps the non-invention + action-protocol blocks
 * intact even if an override is buggy.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentDefinition } from './types';

export interface ActiveOverride {
  id: string;
  tenant_id: string;
  agent_id: string;
  routing_hints_add: string[];
  routing_hints_remove: string[];
  prompt_suffix: string | null;
}

// Cache active overrides per-tenant for 5 minutes. Overrides change
// rarely (admin approves one once a week, maybe) and the orchestrator
// runs on every chat turn — caching avoids hammering the DB.
const cache = new Map<string, { rows: ActiveOverride[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Drop the cache entry for one tenant — used after an approve/reject
 *  so the next turn picks up the change immediately. */
export function invalidateOverridesCache(tenantId: string): void {
  cache.delete(tenantId);
}

/** Returns the current active overrides for every agent in this
 *  tenant. Never throws — on error returns []. */
export async function fetchActiveOverrides(
  db: SupabaseClient,
  tenantId: string,
): Promise<ActiveOverride[]> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rows;
  }
  try {
    const { data } = await db.from('agent_overrides')
      .select('id, tenant_id, agent_id, routing_hints_add, routing_hints_remove, prompt_suffix')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    const rows = (data || []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      agent_id: r.agent_id,
      routing_hints_add: Array.isArray(r.routing_hints_add) ? r.routing_hints_add : [],
      routing_hints_remove: Array.isArray(r.routing_hints_remove) ? r.routing_hints_remove : [],
      prompt_suffix: r.prompt_suffix || null,
    })) as ActiveOverride[];
    cache.set(tenantId, { rows, fetchedAt: Date.now() });
    return rows;
  } catch {
    return [];
  }
}

/** Returns a Map<agentId, ActiveOverride> for easy lookup. */
export function overridesByAgent(rows: ActiveOverride[]): Map<string, ActiveOverride> {
  const m = new Map<string, ActiveOverride>();
  for (const r of rows) m.set(r.agent_id, r);
  return m;
}

/** Compose an agent's effective routingHints with overrides applied. */
export function effectiveRoutingHints(
  agent: AgentDefinition,
  override?: ActiveOverride,
): string[] {
  if (!override) return agent.routingHints;
  const remove = new Set(override.routing_hints_remove.map(h => h.toLowerCase()));
  const merged = [
    ...agent.routingHints.filter(h => !remove.has(h.toLowerCase())),
    ...override.routing_hints_add,
  ];
  // De-duplicate preserving order.
  const seen = new Set<string>();
  return merged.filter(h => {
    const k = h.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Compose an agent's effective systemPrompt with the override
 *  suffix appended. The suffix is wrapped in a "TENANT-SPECIFIC
 *  GUIDANCE" block so the model knows it's an override of the
 *  default behavior. */
export function effectiveSystemPrompt(
  agent: AgentDefinition,
  override?: ActiveOverride,
): string {
  if (!override || !override.prompt_suffix) return agent.systemPrompt;
  return [
    agent.systemPrompt,
    '',
    '── TENANT-SPECIFIC GUIDANCE (from learned overrides) ──',
    override.prompt_suffix,
  ].join('\n');
}
