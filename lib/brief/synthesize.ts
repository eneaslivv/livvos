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
  /** Learned topic weights (agent domain → 0..1). Orders the brief by what
   *  the user actually works on most. */
  topicWeights?: Record<string, number>;
  /** One-line hint about the user's typical active hours (learned from usage). */
  activeHoursHint?: string | null;
}

export async function synthesizeBrief(args: SynthesizeArgs): Promise<BriefSynthesis | null> {
  const now = new Date();
  const partOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Order the briefing by what the user actually works on most (learned topic
  // weights), so the most-relevant topics lead instead of a fixed order.
  const CARD_DOMAIN: Record<string, string> = {
    today_load: 'tasks', upcoming: 'calendar', cashflow: 'finance',
    pipeline: 'clients', inbox: 'inbox', content: 'content', team_kpis: 'team', strategy: 'strategy',
  };
  const tw = args.topicWeights || {};
  const weightOf = (id: string) => tw[CARD_DOMAIN[id] || id] || 0;
  const cards = [...args.cards].sort((a, b) => weightOf(b.id) - weightOf(a.id));
  const topDomains = Object.entries(tw).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
  const priorityLine = topDomains.length
    ? `The user works most on: ${topDomains.join(', ')}. Lead the briefing with those topics, then cover the rest.`
    : '';

  const cardBlock = cards.map(c => {
    const highlights = c.highlights.map(h => `${h.label}=${h.value}`).join(' | ');
    const bullets = c.bullets.length > 0
      ? c.bullets.map(b => `    - ${cleanBriefText(b)}`).join('\n')
      : '    - (no data)';
    return `[${c.id}] ${c.title} (${c.status}) ${highlights}\n${bullets}`;
  }).join('\n\n');

  const prompt = [
    'You are the daily right hand for a creative studio / SaaS operator — a trusted chief of staff who talks to them, not a dashboard that reports at them.',
    'Read the day for them and guide them through it the way a person would: what the day feels like, what to start with, and what to keep an eye on. You still organize the whole operation (tasks, projects, money, inbox, calendar), but you say it in plain, flowing language.',
    `Today is ${dayName}, ${partOfDay}. The user is ${args.userName || 'the operator'}.`,
    TONE_HINTS[args.tone] || TONE_HINTS.concise,
    args.learnedTraits ? `Known user preferences:\n${args.learnedTraits}` : '',
    priorityLine,
    args.activeHoursHint || '',
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
    'INSTRUCTIONS for "message" — talk to the user, do not file a report:',
    '- Write in warm, plain English, the way a sharp colleague would walk you through the morning. Short paragraphs. No emojis, no exclamation marks, no bold headings, no numbered or bulleted lists.',
    '- Open with one or two sentences on how the day looks and where the real pressure is.',
    '- Then guide them through what to do first in flowing prose. Name the specific items (a task, an invoice, a project, a waiting reply) and weave the order in naturally with phrases like "start with", "then", "and keep an eye on". Pull anything overdue or at risk to the front.',
    '- Mention a topic only if it genuinely has something worth saying; let the quiet ones stay quiet. Never run through topics just to be complete.',
    '- Interpret the data, never echo raw labels like "Overdue=3". Turn the numbers into meaning.',
    '- Close with one sentence: the single thing to start with right now.',
    '- Keep it tight and human: 90-180 words. If the day is genuinely calm, say so in a sentence or two and still name the one thing worth doing to get ahead.',
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
