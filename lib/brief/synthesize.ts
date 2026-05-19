/**
 * Brief synthesis — turns the per-category data dump into a short
 * narrative summary + a "what to do first" recommendation.
 *
 * Two parts of the response we care about:
 *   • headline   — 1 sentence, what's the shape of today
 *   • narrative  — 2-3 sentences synthesizing the structured data
 *   • next_step  — 1 concrete recommendation (only when the user
 *                  hasn't disabled top_recommendation)
 *   • per_card   — { [categoryId]: '1-line gloss' } so each card can
 *                  show a hint specific to its data
 *
 * Falls back gracefully: if Gemini fails or returns garbage, the UI
 * still renders the cards with raw data + a generic "Here's your
 * day" greeting.
 */
import { sendAdvisorChat } from '../ai';
import type { CategoryData } from './data-loaders';

export interface BriefSynthesis {
  headline: string;
  narrative: string;
  next_step: string | null;
  per_card: Record<string, string>;
}

const TONE_HINTS: Record<string, string> = {
  concise:  'Tone: concise + factual. Skip filler words. Lead with numbers.',
  warm:     'Tone: warm + supportive. Use the user\'s first name when natural.',
  direct:   'Tone: direct + assertive. Tell them what to do, don\'t hedge.',
  coaching: 'Tone: coaching. Ask one short question that helps them prioritize.',
};

export interface SynthesizeArgs {
  cards: CategoryData[];
  userName: string | null;
  tone: 'concise' | 'warm' | 'direct' | 'coaching';
  includeRecommendation: boolean;
  /** Optional: user's learned traits from agent_user_profiles, so the
   *  synthesis matches the style we've seen them respond to. */
  learnedTraits?: string | null;
  /** Optional: tenant strategy snapshot (top ICPs, active packages,
   *  guiding principles) so the AI's recommendation aligns with what
   *  the business is supposed to be focused on, not just what's
   *  loudest in today's data. */
  strategyContext?: string | null;
}

export async function synthesizeBrief(args: SynthesizeArgs): Promise<BriefSynthesis | null> {
  const greetingHour = new Date().getHours();
  const partOfDay = greetingHour < 12 ? 'morning' : greetingHour < 18 ? 'afternoon' : 'evening';
  // Compact per-card serialization the model reads as ground truth.
  // Bullets are TRUE statements (pulled from DB); the model is allowed
  // to summarize them but cannot invent new facts.
  const cardBlock = args.cards.map(c => {
    const hl = c.highlights.map(h => `${h.label}=${h.value}`).join(' · ');
    const bs = c.bullets.length > 0 ? c.bullets.map(b => `    • ${b}`).join('\n') : '    • (none)';
    return `[${c.id}] ${c.title}  (${c.status})  ${hl}\n${bs}`;
  }).join('\n\n');

  const prompt = [
    'You are generating a single-pass Daily Brief for an operator running a creative agency.',
    `Time: ${partOfDay}. Greeting candidate: "${args.userName ? `Hi ${args.userName}` : 'Hi'}".`,
    `${TONE_HINTS[args.tone] || TONE_HINTS.concise}`,
    args.learnedTraits ? `What we know about this user:\n${args.learnedTraits}` : '',
    args.strategyContext ? `Current strategy context:\n${args.strategyContext}` : '',
    '',
    'GROUND TRUTH — these cards are the ONLY facts. Do NOT invent counts, names, dates, or money.',
    cardBlock || '(no enabled cards have data)',
    '',
    'Output STRICT JSON with this shape:',
    '{',
    '  "headline":  "<one sentence — the shape of today>",',
    '  "narrative": "<2-3 sentences synthesizing the most important threads across cards>",',
    `  "next_step": ${args.includeRecommendation ? '"<ONE concrete action the user should do first>"' : 'null'},`,
    '  "per_card":  { "<category_id>": "<1 short line specific to this card>", ... }',
    '}',
    '',
    'Rules:',
    '  - Reference only categories whose ground-truth bullets are non-empty for per_card. Skip cards with no data.',
    '  - If everything is calm (no "attention" status), say so plainly in narrative.',
    '  - Don\'t restate the numbers verbatim — interpret them ("Christie is at risk", "behind on LinkedIn"). The UI shows the numbers separately.',
    '  - Output ONLY the JSON. No markdown fences, no preamble.',
  ].filter(Boolean).join('\n');

  try {
    const r = await sendAdvisorChat('', [], prompt);
    let raw = ((r as any)?.reply || '').trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const parsed = JSON.parse(raw);
    return {
      headline: String(parsed.headline || '').slice(0, 200),
      narrative: String(parsed.narrative || '').slice(0, 600),
      next_step: args.includeRecommendation
        ? (typeof parsed.next_step === 'string' && parsed.next_step.trim() ? parsed.next_step.trim().slice(0, 240) : null)
        : null,
      per_card: typeof parsed.per_card === 'object' && parsed.per_card != null ? parsed.per_card : {},
    };
  } catch {
    return null;
  }
}

/** Compose a small strategy-context string from the active ICPs +
 *  packages + positioning principles so the synthesis is biased
 *  toward the business' real priorities (not just whatever data is
 *  loudest today). */
export function buildStrategyContext(args: {
  icpNames: string[];
  packageNames: string[];
  positioningPrinciples: string[];
}): string | null {
  const bits: string[] = [];
  if (args.icpNames.length > 0) bits.push(`Active ICPs: ${args.icpNames.slice(0, 5).join(', ')}.`);
  if (args.packageNames.length > 0) bits.push(`Sellable packages: ${args.packageNames.slice(0, 4).join(', ')}.`);
  if (args.positioningPrinciples.length > 0) bits.push(`Guiding principles: ${args.positioningPrinciples.slice(0, 3).map(p => `"${p}"`).join('; ')}.`);
  if (bits.length === 0) return null;
  return bits.join(' ');
}
