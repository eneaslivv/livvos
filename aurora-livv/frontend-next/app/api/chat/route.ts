import { NextRequest, NextResponse } from 'next/server';
import { respond as mockRespond } from '@/lib/mock-backend';
import type { AgentSlug } from '@/lib/tokens';

/**
 * /api/chat
 *   POST { agent, message, tenant_id?, user_id?, session_id? }
 *   → { agent, text, canvas, request_id }
 *
 * Modes:
 *   - AURORA_MODE=mock (default): keyword-canned responses, no LLM cost.
 *   - AURORA_MODE=live: would call Anthropic SDK with the agent's system
 *     prompt loaded from /agents/{slug}.md. Skeleton below; wire when ready.
 */

export const dynamic = 'force-dynamic';
const MODE = process.env.AURORA_MODE || 'mock';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agent: AgentSlug = body?.agent ?? 'atlas';
  const message: string = body?.message ?? '';
  const request_id = crypto.randomUUID();

  if (MODE === 'mock') {
    const result = mockRespond(agent, message);
    return NextResponse.json({ ...result, request_id });
  }

  // -------- live skeleton ---------------------------------------------
  // (Not used while AURORA_MODE=mock.)
  // const apiKey = process.env.ANTHROPIC_API_KEY;
  // const systemPrompt = await loadAgentPrompt(agent); // reads ../agents/{agent}.md
  // const r = await fetch('https://api.anthropic.com/v1/messages', {
  //   method: 'POST',
  //   headers: {
  //     'x-api-key': apiKey!,
  //     'anthropic-version': '2023-06-01',
  //     'content-type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     model: agent === 'atlas' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
  //     max_tokens: 1024,
  //     system: systemPrompt,
  //     messages: [{ role: 'user', content: message }],
  //   }),
  // });
  // const data = await r.json();
  // return NextResponse.json(parseAgentResponse(data, agent, request_id));

  return NextResponse.json({
    agent,
    text: 'Modo live no está wireado todavía. Configurá ANTHROPIC_API_KEY y AURORA_MODE=live.',
    canvas: null,
    request_id,
  });
}
