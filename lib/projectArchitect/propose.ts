/**
 * Propose pipeline — turns a natural-language brief into a reviewable
 * project structure with planned dates.
 *
 * Order of work:
 *   1. Read the matching blueprint(s) (the canonical pattern).
 *   2. Ask the model to classify and adapt the blueprint into a strict
 *      structured object. It decides structure, never dates.
 *   3. Validate the output. Re-prompt once on malformed output.
 *   4. Plan stage dates in code (the deterministic planner).
 *   5. Return an editable structure for the preview.
 *
 * If the model is unreachable or keeps returning malformed output, fall
 * back to applying the chosen blueprint as-is. That is not the code
 * inventing structure: the blueprint is the human-authored canonical
 * pattern, applied without adaptation, and the gap is flagged.
 */

import type { ExecutionContext } from '../agents/types';
import { get_blueprint, list_blueprints } from '../agents/skills/project-architect';
import { generateProjectStructureFromAI } from '../ai';
import { validateProposedStructure } from './schema';
import { planStageDates, type PlanOptions } from './datePlanner';
import type {
  Blueprint,
  EditableStructure,
  EditableStage,
  ProposedStructure,
  ProposedStage,
  ProjectType,
} from './types';

export interface ProposeInput {
  brief: string;
  /** A known type, or 'auto' to let the model classify from the brief. */
  type?: ProjectType | 'auto';
  hardDeadline?: string | null;
  /** ISO 'today' supplied by the client so planning stays deterministic. */
  startDate: string;
  ctx: ExecutionContext;
  planOptions?: Partial<Omit<PlanOptions, 'startDate' | 'hardDeadline'>>;
}

export interface ProposeOutput {
  ok: boolean;
  structure?: EditableStructure;
  /** True when the model failed and the blueprint was applied unadapted. */
  usedFallback: boolean;
  error?: string;
}

let keySeq = 0;
const mkKey = (prefix: string): string => `${prefix}_${keySeq++}`;

const KEYWORD_TYPES: Array<{ match: RegExp; type: ProjectType }> = [
  { match: /framer/i, type: 'web_framer' },
  { match: /webflow/i, type: 'web_webflow' },
  { match: /react native|expo/i, type: 'app_react_native' },
  { match: /flutter/i, type: 'app_flutter' },
  { match: /\bai\b|gpt|llm|machine learning|integration/i, type: 'ai_integration' },
];

const classifyByKeyword = (brief: string): ProjectType => {
  for (const { match, type } of KEYWORD_TYPES) if (match.test(brief)) return type;
  return 'own_product';
};

const firstLine = (brief: string): string => {
  const line = brief.split('\n').map((l) => l.trim()).find(Boolean) || '';
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
};

/** Apply a blueprint without adaptation. Used only when the model fails. */
const applyBlueprintVerbatim = (
  blueprint: Blueprint,
  brief: string,
  hardDeadline: string | null,
): ProposedStructure => {
  const stages: ProposedStage[] = (blueprint.stages || []).map((s, i) => ({
    name: s.name,
    order: s.order ?? i + 1,
    effort_weight: s.effort_weight ?? 0,
    tasks: (s.default_tasks || []).map((t) => ({
      title: t.title,
      estimate_hours: t.estimate_hours ?? 0,
      depends_on: t.depends_on ?? null,
    })),
  }));
  const missing_info = [
    'AI adaptation did not run, so the blueprint was applied as-is. Review tasks and estimates.',
  ];
  if (!hardDeadline) missing_info.push('No hard deadline was given.');
  return {
    project: {
      name: firstLine(brief) || `New ${blueprint.type} project`,
      client: null,
      type: blueprint.type,
      hard_deadline: hardDeadline,
    },
    stages,
    missing_info,
  };
};

const buildEditable = (
  structure: ProposedStructure,
  startDate: string,
  hardDeadline: string | null,
  planOptions?: ProposeInput['planOptions'],
): EditableStructure => {
  const plan = planStageDates(structure.stages, {
    startDate,
    hardDeadline,
    ...planOptions,
  });
  const stages: EditableStage[] = plan.stages.map((s) => ({
    _key: mkKey('stage'),
    name: s.name,
    order: s.order,
    effort_weight: s.effort_weight,
    planned_start: s.planned_start,
    planned_end: s.planned_end,
    working_days: s.working_days,
    tasks: s.tasks.map((t) => ({
      _key: mkKey('task'),
      title: t.title,
      estimate_hours: t.estimate_hours,
      depends_on: t.depends_on ?? null,
    })),
  }));
  return {
    project: { ...structure.project, start_date: startDate, hard_deadline: hardDeadline },
    stages,
    missing_info: structure.missing_info,
  };
};

/** Fetch the blueprint(s) the model should ground on. */
const loadBlueprints = async (
  input: ProposeInput,
): Promise<{ blueprints: Blueprint[]; error?: string }> => {
  if (input.type && input.type !== 'auto') {
    const res = await get_blueprint.run({ type: input.type }, input.ctx);
    if (!res.ok || !res.data) return { blueprints: [], error: res.reason || 'no_blueprint' };
    return { blueprints: [res.data as Blueprint] };
  }
  const res = await list_blueprints.run({}, input.ctx);
  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
    return { blueprints: [], error: res.reason || 'no_blueprints' };
  }
  return { blueprints: res.data as Blueprint[] };
};

export async function proposeStructure(input: ProposeInput): Promise<ProposeOutput> {
  const { blueprints, error } = await loadBlueprints(input);
  if (error || blueprints.length === 0) {
    return { ok: false, usedFallback: false, error: error || 'no_blueprint' };
  }

  const baseModelInput = {
    today: input.startDate,
    hard_deadline: input.hardDeadline ?? null,
    type: input.type && input.type !== 'auto' ? input.type : null,
    brief: input.brief,
    blueprints,
  };

  // First attempt, then one re-prompt with the validation errors appended.
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const modelInput =
      attempt === 0
        ? JSON.stringify(baseModelInput)
        : JSON.stringify({
            ...baseModelInput,
            fix_these_problems: lastErrors,
            reminder: 'Return ONLY the JSON object defined by the contract. No prose, no code fences.',
          });

    let raw: unknown;
    try {
      raw = await generateProjectStructureFromAI(modelInput);
    } catch (e) {
      // Model unreachable — stop retrying and fall back.
      if (import.meta.env.DEV) console.warn('[architect] model call failed:', e);
      break;
    }

    const validated = validateProposedStructure(raw);
    if (validated.ok) {
      return {
        ok: true,
        usedFallback: false,
        structure: buildEditable(validated.value, input.startDate, input.hardDeadline ?? null, input.planOptions),
      };
    }
    lastErrors = validated.errors;
    if (import.meta.env.DEV) console.warn('[architect] invalid structure, attempt', attempt + 1, validated.errors);
  }

  // Fallback: apply the right blueprint as-is.
  const chosenType = input.type && input.type !== 'auto' ? input.type : classifyByKeyword(input.brief);
  const chosen = blueprints.find((b) => b.type === chosenType) || blueprints[0];
  const structure = applyBlueprintVerbatim(chosen, input.brief, input.hardDeadline ?? null);
  return {
    ok: true,
    usedFallback: true,
    structure: buildEditable(structure, input.startDate, input.hardDeadline ?? null, input.planOptions),
  };
}
