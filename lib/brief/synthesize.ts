/**
 * Brief synthesis turns per-category data into an English daily operating
 * analysis. The AI is optional: the UI also has a deterministic fallback, so
 * the Brief screen must never get stuck without useful output.
 */
import { sendAdvisorChat } from '../ai';
import type { CategoryData } from './data-loaders';

export interface BriefSynthesis {
  /** The full conversational briefing, multi-paragraph, in English. */
  message: string;
  /** Single headline for the sticky bar / weekly focus. */
  headline: string;
  /** One concrete action to do first, null when disabled. */
  next_step: string | null;
}

const TONE_HINTS: Record<string, string> = {
  concise: 'Style: concise, direct, no filler. Lead with facts.',
  warm: 'Style: warm and human. Use the user name only when it feels natural.',
  direct: 'Style: direct and assertive. Say what needs to happen without hedging.',
  coaching: 'Style: coaching. Ask one short prioritization question when useful.',
};

const cleanBriefText = (value: unknown): string =>
  String(value ?? '')
    .replace(/ðŸ”¥|🔥/g, 'High priority:')
    .replace(/ðŸŽ¯|🎯/g, '')
    .replace(/âš |⚠/g, 'Risk:')
    .replace(/ðŸ“…|📅/g, '')
    .replace(/Â·/g, '·')
    .replace(/\s+/g, ' ')
    .trim();

export interface SynthesizeArgs {
  cards: CategoryData[];
  userName: string | null;
  tone: 'concise' | 'warm' | 'direct' | 'coaching';
  includeRecommendation: boolean;
  learnedTraits?: string | null;
  strategyContext?: string | null;
}

export async function synthesizeBrief(args: SynthesizeArgs): Promise<BriefSynthesis | null> {
  const now = new Date();
  const partOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

  const cardBlock = args.cards.map(c => {
    const highlights = c.highlights.map(h => `${h.label}=${h.value}`).join(' | ');
    const bullets = c.bullets.length > 0
      ? c.bullets.map(b => `    - ${cleanBriefText(b)}`).join('\n')
      : '    - (no data)';
    return `[${c.id}] ${c.title} (${c.status}) ${highlights}\n${bullets}`;
  }).join('\n\n');

  const prompt = [
    'You are the daily operating analyst for a creative studio / SaaS operator.',
    `Today is ${dayName}, ${partOfDay}. The user is ${args.userName || 'the operator'}.`,
    TONE_HINTS[args.tone] || TONE_HINTS.concise,
    args.learnedTraits ? `Known user preferences:\n${args.learnedTraits}` : '',
    args.strategyContext ? `Strategic context:\n${args.strategyContext}` : '',
    '',
    'REAL DATA. These are the ONLY facts. Do not invent data, names, dates, amounts, clients, or progress.',
    cardBlock || '(no data in enabled categories)',
    '',
    'Return JSON with this exact structure:',
    '{',
    '  "headline": "<short phrase summarizing the day, max 15 words>",',
    `  "next_step": ${args.includeRecommendation ? '"<ONE concrete action to do first>"' : 'null'},`,
    '  "message": "<full briefing, see instructions below>"',
    '}',
    '',
    'INSTRUCTIONS for "message":',
    '- Write in clear product-operator English.',
    '- No emojis. No exclamation marks.',
    '- Start with a 1-2 sentence executive summary of the overall operating state.',
    '- Then analyze by topic. Include ONLY topics with real data (status != empty).',
    '- For each topic, write one short paragraph with real analysis:',
    '    - what is happening using concrete numbers',
    '    - what it implies: risk, bottleneck, trend, or opportunity',
    '    - what the user should do if action is needed',
    '- Use line breaks between topics. Put each topic name in bold like **Today load**.',
    '- End with one line stating the main focus for the day.',
    '- Total length should be 120-300 words depending on available data.',
    '- Do not dump labels like "Overdue=3"; interpret the data.',
    '- If everything is quiet, say that in 2 sentences and stop.',
    '',
    'Output ONLY JSON. No markdown fences, no preamble.',
  ].filter(Boolean).join('\n');

  try {
    const r = await sendAdvisorChat('', [], prompt);
    let raw = ((r as any)?.reply || '').trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const parsed = JSON.parse(raw);
    const message = String(parsed.message || '').trim().slice(0, 3000);
    if (!message) return null;
    return {
      message,
      headline: String(parsed.headline || '').trim().slice(0, 120),
      next_step: args.includeRecommendation
        ? (typeof parsed.next_step === 'string' && parsed.next_step.trim() ? parsed.next_step.trim().slice(0, 240) : null)
        : null,
    };
  } catch {
    return null;
  }
}

export function buildStrategyContext(args: {
  icpNames: string[];
  packageNames: string[];
  positioningPrinciples: string[];
}): string | null {
  const bits: string[] = [];
  if (args.icpNames.length > 0) bits.push(`Active ICPs: ${args.icpNames.slice(0, 5).join(', ')}.`);
  if (args.packageNames.length > 0) bits.push(`Packages: ${args.packageNames.slice(0, 4).join(', ')}.`);
  if (args.positioningPrinciples.length > 0) {
    bits.push(`Positioning principles: ${args.positioningPrinciples.slice(0, 3).map(p => `"${p}"`).join('; ')}.`);
  }
  if (bits.length === 0) return null;
  return bits.join(' ');
}
