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
  /** Per-skill description tweaks: { skill_id: new_description }.
   *  Applied at agent-prompt-build time to swap the TS-default
   *  description with a tenant-tuned one. */
  skill_overrides: Record<string, string>;
  /** Skill ids the tenant turned OFF — never auto-run, and the LLM is told
   *  not to use or propose them. */
  disabled_skills: string[];
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
      .select('id, tenant_id, agent_id, routing_hints_add, routing_hints_remove, prompt_suffix, skill_overrides, disabled_skills')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    const rows = (data || []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      agent_id: r.agent_id,
      routing_hints_add: Array.isArray(r.routing_hints_add) ? r.routing_hints_add : [],
      routing_hints_remove: Array.isArray(r.routing_hints_remove) ? r.routing_hints_remove : [],
      prompt_suffix: r.prompt_suffix || null,
      skill_overrides: (r.skill_overrides && typeof r.skill_overrides === 'object')
        ? r.skill_overrides as Record<string, string>
        : {},
      disabled_skills: Array.isArray(r.disabled_skills) ? r.disabled_skills : [],
    })) as ActiveOverride[];
    cache.set(tenantId, { rows, fetchedAt: Date.now() });
    return rows;
  } catch {
    return [];
  }
}

/** Resolve the effective description for a skill — falls back to the
 *  TS default if no override exists. Used at agent-prompt-build
 *  time when listing what each skill does. */
export function effectiveSkillDescription(
  skillId: string,
  defaultDescription: string,
  override?: ActiveOverride,
): string {
  const tweaked = override?.skill_overrides?.[skillId];
  return (tweaked && typeof tweaked === 'string') ? tweaked : defaultDescription;
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

/** Compose an agent's effective systemPrompt with override content
 *  appended. Two layers can be added:
 *    1. Skill description tweaks — surfaced as a "SKILL DESCRIPTIONS
 *       (TUNED)" block so the model uses the tenant-specific verbiage
 *       when reasoning about which skill applies.
 *    2. Free-form prompt_suffix — appended under "TENANT-SPECIFIC
 *       GUIDANCE". Higher in priority than defaults for ambiguous
 *       calls.
 *  Both layers are ADDITIVE — never replaces the base. */
export function effectiveSystemPrompt(
  agent: AgentDefinition,
  override?: ActiveOverride,
): string {
  if (!override) return agent.systemPrompt;
  const blocks: string[] = [agent.systemPrompt];
  // Skill description tweaks — only render the block when at least
  // one of the agent's skills has an override.
  const tweaks = override.skill_overrides || {};
  const tweakedSkills = agent.skills.filter(s => tweaks[s.id]);
  if (tweakedSkills.length > 0) {
    blocks.push('');
    blocks.push('── SKILL DESCRIPTIONS (TUNED for this tenant) ──');
    for (const s of tweakedSkills) {
      blocks.push(`• ${s.id}: ${tweaks[s.id]}`);
    }
  }
  if (override.prompt_suffix) {
    blocks.push('');
    blocks.push('── TENANT-SPECIFIC GUIDANCE (from learned overrides) ──');
    blocks.push(override.prompt_suffix);
  }
  if (override.disabled_skills && override.disabled_skills.length > 0) {
    blocks.push('');
    blocks.push('── DISABLED SKILLS (turned off for this tenant — do NOT use or propose these) ──');
    for (const id of override.disabled_skills) blocks.push(`• ${id}`);
  }
  return blocks.join('\n');
}
