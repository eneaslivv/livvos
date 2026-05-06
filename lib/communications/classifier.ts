/**
 * Communications classifier — frontend wrapper around the gemini edge fn.
 *
 * The actual prompt + AI call lives in supabase/functions/gemini/index.ts
 * under type: 'comm_classify'. This file just types the call and the
 * response, and adds a graceful fallback so a flaky AI call never blocks
 * the inbox from inserting a message.
 *
 * Used by:
 *   - frontend code that classifies on demand from the inbox
 *   - the gmail-sync / slack-events edge functions can call gemini
 *     directly with the same type='comm_classify' payload (no need to
 *     duplicate the prompt) — they bypass this wrapper because they're
 *     already server-side
 */

import { classifyCommMessage } from '../ai';
import type {
  AIClassification,
  ClassifierInput,
} from '../../types/communications';

/**
 * Classify a single inbox message. Returns null on failure so the caller
 * can decide whether to retry or just store the message un-classified.
 */
export async function classifyMessage(
  input: ClassifierInput,
): Promise<AIClassification | null> {
  try {
    const payload = JSON.stringify({
      platform: input.platform,
      from_name: input.from_name,
      from_email: input.from_email || null,
      subject: input.subject || null,
      // Cap body to 2000 chars for token efficiency. The prompt rules
      // tell the model that truncation is normal; full classification
      // accuracy doesn't need every paragraph.
      body: (input.body || '').slice(0, 2000),
      thread_context: (input.thread_context || []).slice(-5).map(t => ({
        from: t.from,
        body: (t.body || '').slice(0, 500),
        date: t.date,
      })),
      agency_name: input.agency_name,
    });

    return await classifyCommMessage<AIClassification>(payload);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[comm classifier] failed:', err);
    }
    return null;
  }
}

// Re-export for convenience so consumers don't need two import paths.
export type { AIClassification, ClassifierInput };
