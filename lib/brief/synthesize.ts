/**
 * Brief synthesis — turns the per-category data into a conversational
 * daily analysis. Output is a single flowing message in Spanish that
 * reads like a quick chat from an advisor, organized by topic with
 * real analysis per section.
 *
 * The UI renders this as a single chat-style bubble — no cards, no
 * dashboard widgets.
 */
import { sendAdvisorChat } from '../ai';
import type { CategoryData } from './data-loaders';

export interface BriefSynthesis {
  /** The full conversational briefing — multi-paragraph, in Spanish. */
  message: string;
  /** Single headline for the sticky bar / weekly focus. */
  headline: string;
  /** One concrete action to do first — null when disabled. */
  next_step: string | null;
}

const TONE_HINTS: Record<string, string> = {
  concise:  'Estilo: conciso, directo, sin relleno. Liderá con hechos.',
  warm:     'Estilo: cálido, cercano. Usá el nombre del usuario cuando sea natural.',
  direct:   'Estilo: directo, asertivo. Decí lo que tiene que hacer sin rodeos.',
  coaching: 'Estilo: coaching. Hacé una pregunta corta que ayude a priorizar.',
};

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
  const greetingHour = now.getHours();
  const partOfDay = greetingHour < 12 ? 'mañana' : greetingHour < 18 ? 'tarde' : 'noche';
  const dayName = now.toLocaleDateString('es-AR', { weekday: 'long' });

  // Compact per-card serialization — ground truth for the model.
  const cardBlock = args.cards.map(c => {
    const hl = c.highlights.map(h => `${h.label}=${h.value}`).join(' · ');
    const bs = c.bullets.length > 0 ? c.bullets.map(b => `    • ${b}`).join('\n') : '    • (sin datos)';
    return `[${c.id}] ${c.title}  (${c.status})  ${hl}\n${bs}`;
  }).join('\n\n');

  const prompt = [
    'Sos el analista diario de un operador que maneja una agencia creativa.',
    `Hoy es ${dayName}, ${partOfDay}. El usuario se llama ${args.userName || 'el operador'}.`,
    TONE_HINTS[args.tone] || TONE_HINTS.concise,
    args.learnedTraits ? `Lo que sabemos del usuario:\n${args.learnedTraits}` : '',
    args.strategyContext ? `Contexto estratégico:\n${args.strategyContext}` : '',
    '',
    'DATOS REALES — estos son los ÚNICOS hechos. NO inventes datos, nombres, ni montos.',
    cardBlock || '(sin datos en las categorías habilitadas)',
    '',
    'Generá un JSON con esta estructura:',
    '{',
    '  "headline": "<una frase corta que resuma el estado del día — max 15 palabras>",',
    `  "next_step": ${args.includeRecommendation ? '"<UNA acción concreta para hacer primero>"' : 'null'},`,
    '  "message": "<el briefing completo — ver instrucciones abajo>"',
    '}',
    '',
    'INSTRUCCIONES para "message":',
    '- Escribí en español rioplatense, como si fuera un mensaje de WhatsApp profesional.',
    '- NO uses emojis. NO uses signos de exclamación.',
    '- Empezá con un saludo breve y un resumen ejecutivo de 1-2 oraciones sobre el estado general.',
    '- Después, un análisis por tópico. SOLO incluí tópicos que tengan datos reales (status != empty).',
    '- Para cada tópico, escribí un párrafo corto (2-4 oraciones) con análisis real:',
    '    - Qué está pasando en números concretos',
    '    - Qué implica (contexto, tendencia, riesgo)',
    '    - Qué debería hacer el usuario si hay algo accionable',
    '- Usá saltos de línea entre cada tópico. Antes de cada tópico poné el nombre en negrita con **Nombre**.',
    '- Terminá con una línea de cierre — lo que debería ser el foco principal del día.',
    '- El largo total debería ser 150-400 palabras, dependiendo de cuántos tópicos tienen datos.',
    '- NO repitas los números textualmente — interpretá ("estás atrasado en 3 checkpoints", no "OVERDUE=3").',
    '- Si todo está tranquilo, decilo en 2 oraciones y listo. No infles.',
    '',
    'Output SOLO el JSON. Sin markdown fences, sin preámbulo.',
  ].filter(Boolean).join('\n');

  try {
    const r = await sendAdvisorChat('', [], prompt);
    let raw = ((r as any)?.reply || '').trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const parsed = JSON.parse(raw);
    return {
      message: String(parsed.message || '').slice(0, 3000),
      headline: String(parsed.headline || '').slice(0, 120),
      next_step: args.includeRecommendation
        ? (typeof parsed.next_step === 'string' && parsed.next_step.trim() ? parsed.next_step.trim().slice(0, 240) : null)
        : null,
    };
  } catch {
    return null;
  }
}

/** Compose a small strategy-context string from the active ICPs +
 *  packages + positioning principles so the synthesis is biased
 *  toward the business' real priorities. */
export function buildStrategyContext(args: {
  icpNames: string[];
  packageNames: string[];
  positioningPrinciples: string[];
}): string | null {
  const bits: string[] = [];
  if (args.icpNames.length > 0) bits.push(`ICPs activos: ${args.icpNames.slice(0, 5).join(', ')}.`);
  if (args.packageNames.length > 0) bits.push(`Paquetes: ${args.packageNames.slice(0, 4).join(', ')}.`);
  if (args.positioningPrinciples.length > 0) bits.push(`Principios: ${args.positioningPrinciples.slice(0, 3).map(p => `"${p}"`).join('; ')}.`);
  if (bits.length === 0) return null;
  return bits.join(' ');
}
