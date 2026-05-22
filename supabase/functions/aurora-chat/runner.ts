// @ts-nocheck
// Aurora runner — drives the OpenAI tool-calling loop for a single turn.
//
// Loop:
//   1. Send messages + tools to OpenAI
//   2. If the model wants tools, execute them in parallel (RLS-scoped client)
//   3. Append tool results to messages
//   4. Loop back; on iteration MAX-1, force structured output (AgentResponse)
//
// Returns AgentResponse + cost telemetry.

import { AGENT_RESPONSE_SCHEMA } from './schema.ts';
import type { AgentDef, AgentResponseLite, ToolContext } from './types.ts';

const MAX_TOOL_LOOPS = 6;

// OpenAI gpt-4o pricing (input $2.50/M, output $10/M).
// gpt-4o-mini pricing (input $0.15/M, output $0.60/M).
function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  if (model.includes('mini')) {
    return (tokensIn * 0.15 + tokensOut * 0.60) / 1_000_000;
  }
  return (tokensIn * 2.50 + tokensOut * 10.0) / 1_000_000;
}

export interface RunResult extends AgentResponseLite {
  tokens_in: number;
  tokens_out: number;
  model: string;
  cost_usd: number;
  /** History of messages produced this turn (assistant + tool results). For persistence. */
  trace: any[];
}

export async function runAgent({
  openai,
  agentDef,
  userMessage,
  history,
  ctx,
}: {
  openai: any;
  agentDef: AgentDef;
  userMessage: string;
  history: any[];
  ctx: ToolContext;
}): Promise<RunResult> {
  const messages: any[] = [
    { role: 'system', content: agentDef.systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const trace: any[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const isLastLoop = i === MAX_TOOL_LOOPS - 1;

    const completion = await openai.chat.completions.create({
      model: agentDef.model,
      messages,
      tools: agentDef.tools.length > 0 ? agentDef.tools : undefined,
      tool_choice: agentDef.tools.length > 0 && !isLastLoop ? 'auto' : 'none',
      // Force structured JSON when the model has no more tool calls to make.
      // We do this on the last iteration unconditionally, and on any earlier
      // iteration where the model produced no tool calls (handled below by
      // re-issuing the request with tool_choice='none' if needed).
      response_format: isLastLoop
        ? {
            type: 'json_schema',
            json_schema: { name: 'AgentResponse', schema: AGENT_RESPONSE_SCHEMA, strict: true },
          }
        : undefined,
    });

    tokensIn  += completion.usage?.prompt_tokens     ?? 0;
    tokensOut += completion.usage?.completion_tokens ?? 0;

    const msg = completion.choices[0].message;
    messages.push(msg);
    trace.push(msg);

    // No tool calls → either we got the final JSON (if isLastLoop) or we need
    // one more pass to force JSON output.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      if (isLastLoop) {
        // Final JSON — parse + return
        return parseAndReturn(msg.content, tokensIn, tokensOut, agentDef.model, trace);
      }
      // Force one more pass with JSON schema enforcement
      const finalCompletion = await openai.chat.completions.create({
        model: agentDef.model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'AgentResponse', schema: AGENT_RESPONSE_SCHEMA, strict: true },
        },
      });
      tokensIn  += finalCompletion.usage?.prompt_tokens     ?? 0;
      tokensOut += finalCompletion.usage?.completion_tokens ?? 0;
      const finalMsg = finalCompletion.choices[0].message;
      trace.push(finalMsg);
      return parseAndReturn(finalMsg.content, tokensIn, tokensOut, agentDef.model, trace);
    }

    // Execute tools in parallel — OpenAI supports parallel function calling.
    const toolResults = await Promise.all(
      msg.tool_calls.map(async (tc: any) => {
        const fn = agentDef.toolHandlers[tc.function.name];
        if (!fn) {
          return { tool_call_id: tc.id, role: 'tool', content: JSON.stringify({ error: 'tool_not_found', name: tc.function.name }) };
        }
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          const result = await Promise.race([
            fn(args, ctx),
            new Promise((_, reject) => setTimeout(() => reject(new Error('tool_timeout_5s')), 5000)),
          ]);
          return { tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result ?? null) };
        } catch (e: any) {
          return { tool_call_id: tc.id, role: 'tool', content: JSON.stringify({ error: e?.message || 'tool_failed' }) };
        }
      }),
    );

    toolResults.forEach((r) => { messages.push(r); trace.push(r); });
  }

  // Shouldn't reach here — fallback
  return {
    text: 'Me trabé después de varios tool calls. Probá reformular.',
    canvas: null,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    model: agentDef.model,
    cost_usd: costUsd(agentDef.model, tokensIn, tokensOut),
    trace,
  };
}

function parseAndReturn(content: string, tokensIn: number, tokensOut: number, model: string, trace: any[]): RunResult {
  let parsed: any = { text: '', canvas: null };
  try {
    parsed = JSON.parse(content || '{}');
  } catch {
    parsed = { text: content || '(sin respuesta)', canvas: null };
  }
  return {
    text: parsed.text || '',
    canvas: parsed.canvas ?? null,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    model,
    cost_usd: costUsd(model, tokensIn, tokensOut),
    trace,
  };
}
