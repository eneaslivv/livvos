/**
 * ProposalChatEditor — replaces the legacy 3-textarea center column in
 * the Documents → Proposals page.
 *
 * Layout (top → bottom inside the center column):
 *   1. Brief — collapsed line by default, click to expand into a textarea.
 *      The brief is the source of truth for what the AI should quote.
 *   2. Document preview — rendered with the same ProposalDocumentView
 *      the client sees on the public link, in studio (read-only, no
 *      accept). Empty state CTA points to the chat input below.
 *   3. AI chat — short conversation thread + textarea + send. Each
 *      message is treated as a refinement instruction; the AI gets
 *      the current proposal as context and emits an updated content +
 *      pricing_snapshot.document, persisted via onUpdate.
 *
 * The right-column Assignment / Pricing / Portfolio panel that the user
 * said they liked stays intact — this component owns ONLY the center.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../ui/Icons';
import { generateProposalFromAI, getOutputId } from '../../lib/ai';
import { ProposalDocumentView } from '../proposals/ProposalDocumentView';
import { buildProposalDocumentData } from '../proposals/buildProposalDocumentData';
import { errorLogger } from '../../lib/errorLogger';
import { ProposalTaskGenerator } from './ProposalTaskGenerator';

interface ServicePricing {
  id: string;
  name: string;
  pricing_model: 'hourly' | 'fixed' | 'service';
  hourly_rate?: number | null;
  fixed_price?: number | null;
  estimated_weeks?: number | null;
  simple_factor?: number | null;
  standard_factor?: number | null;
  advanced_factor?: number | null;
  complex_factor?: number | null;
  tech_stack?: string[] | null;
  deliverables?: string[] | null;
  is_active: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

interface Props {
  proposal: any;
  /** Live service catalog — passed into the AI prompt as price grounding. */
  services: ServicePricing[];
  /** Recent winning proposals — used to calibrate price brackets. */
  recentWins: Array<{
    title: string;
    pricing_total: number;
    project_type?: string | null;
    complexity?: string | null;
    currency?: string | null;
  }>;
  /** Save updates back to the proposal row. Same handleUpdate the
   *  parent uses for everything else. */
  onUpdate: (patch: Record<string, any>) => Promise<void> | void;
  /** Called when the AI returns a result, so the parent can wire its
   *  feedback bar. */
  onAIOutput?: (outputId: string | null) => void;
}

export const ProposalChatEditor: React.FC<Props> = ({
  proposal, services, recentWins, onUpdate, onAIOutput,
}) => {
  const [briefExpanded, setBriefExpanded] = useState(!proposal.brief_text);
  const [briefDraft, setBriefDraft] = useState(proposal.brief_text || '');
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTaskGen, setShowTaskGen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // When switching proposals, reset local state.
  useEffect(() => {
    setBriefDraft(proposal.brief_text || '');
    setBriefExpanded(!proposal.brief_text);
    setChatLog([]);
    setError(null);
  }, [proposal.id]);

  // Keep the chat scrolled to bottom as new messages land.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatLog.length, busy]);

  const docData = useMemo(() => {
    try {
      return buildProposalDocumentData(proposal);
    } catch (err) {
      errorLogger.warn('proposal doc build failed', err);
      return null;
    }
  }, [proposal]);

  const hasContent = !!(proposal.content && proposal.content.trim().length > 20);

  const saveBrief = async () => {
    const trimmed = briefDraft.trim();
    if (trimmed === (proposal.brief_text || '').trim()) {
      setBriefExpanded(false);
      return;
    }
    await onUpdate({ brief_text: trimmed });
    setBriefExpanded(false);
  };

  // Build the same prompt the composer uses (catalog grounding + recent
  // wins + brief), but PREPEND a refine instruction when the user is
  // iterating on an existing draft.
  const buildPrompt = (instruction?: string): string => {
    const projectType = proposal.project_type || 'web';
    const language = proposal.language || 'en';
    const complexity = proposal.complexity || 'standard';

    const catalogLines = services.filter(s => s.is_active).slice(0, 20).map(s => {
      const priceBit = s.pricing_model === 'hourly'
        ? `hourly @ USD ${s.hourly_rate}/h`
        : `fixed USD ${s.fixed_price}`;
      const stack = s.tech_stack?.length ? ` · stack: ${s.tech_stack.join(', ')}` : '';
      return `- ${s.name} (${priceBit}, ~${s.estimated_weeks || '?'} wks${stack})`;
    }).join('\n');

    const winsLines = recentWins.slice(0, 5).map(p =>
      `- ${p.title} · ${p.project_type || 'web'} · ${p.complexity || 'standard'} · ${p.currency || 'USD'} ${p.pricing_total}`
    ).join('\n');

    const isRefine = !!instruction && hasContent;
    const refineHeader = isRefine
      ? [
          '=== REFINE EXISTING PROPOSAL ===',
          `User instruction: "${instruction}"`,
          '',
          'Apply ONLY this change. Keep everything else (sections, structure, tone) consistent with the existing draft below. Re-emit the FULL updated content + pricing — never partial patches.',
          '',
          '=== EXISTING DRAFT ===',
          (proposal.content || '').slice(0, 3000),
          proposal.pricing_snapshot?.document
            ? `\n=== EXISTING PRICING DOCUMENT ===\n${JSON.stringify(proposal.pricing_snapshot.document).slice(0, 2000)}`
            : '',
          '',
        ].filter(Boolean).join('\n')
      : '';

    const lines = [
      refineHeader,
      `Project type: ${projectType}`,
      `Language: ${language}`,
      `Complexity: ${complexity}`,
      `Brief: ${proposal.brief_text || ''}`,
      `Tone: confident`,
      '',
      catalogLines ? `=== SERVICE CATALOG (the user's configured rates) ===\n${catalogLines}` : '',
      winsLines ? `\n=== RECENTLY CLOSED PROPOSALS ===\n${winsLines}` : '',
      '',
      isRefine
        ? 'Output: an UPDATED Livv-formatted quote reflecting the instruction.'
        : 'Output: a Livv-formatted quote following the system prompt. Default to the 2-tier (Simple + Premium) layout unless the brief asks for the 4-option full quote.',
    ].filter(Boolean);

    return lines.join('\n');
  };

  const runAI = async (userInstruction?: string) => {
    if (busy) return;
    setError(null);

    if (userInstruction) {
      setChatLog(prev => [...prev, {
        id: `${Date.now()}-u`,
        role: 'user',
        text: userInstruction,
        ts: Date.now(),
      }]);
    }
    setBusy(true);
    try {
      const prompt = buildPrompt(userInstruction);
      const result = await generateProposalFromAI(prompt);
      onAIOutput?.(getOutputId(result));

      // Persist content + pricing_snapshot.document + summary + timeline.
      const patch: Record<string, any> = {};
      if (result?.content) patch.content = result.content;
      if (result?.summary) patch.summary = result.summary;
      if (result?.document) {
        patch.pricing_snapshot = {
          ...(proposal.pricing_snapshot || {}),
          document: result.document,
        };
      }
      if (Array.isArray(result?.timeline) && result.timeline.length > 0) {
        patch.timeline = {
          weeks: result.timeline.length,
          items: result.timeline,
        };
      }
      // Total: prefer AI's pricing_total; fall back to summing tier amounts.
      if (typeof (result as any)?.pricing_total === 'number') {
        patch.pricing_total = (result as any).pricing_total;
      } else if (Array.isArray(result?.document?.tiers) && result.document.tiers.length > 0) {
        const featured = result.document.tiers.find((t: any) => t.featured) || result.document.tiers[0];
        if (featured?.amount) patch.pricing_total = featured.amount;
      }
      if (Object.keys(patch).length > 0) {
        await onUpdate(patch);
      }

      const reply = userInstruction
        ? '✓ Applied. Check the preview above.'
        : (result?.summary || '✓ Done — proposal generated.');
      setChatLog(prev => [...prev, {
        id: `${Date.now()}-a`,
        role: 'assistant',
        text: reply,
        ts: Date.now(),
      }]);
    } catch (err: any) {
      const msg = err?.message || 'No pude generar — probá de nuevo.';
      setError(msg);
      setChatLog(prev => [...prev, {
        id: `${Date.now()}-a`,
        role: 'assistant',
        text: `⚠ ${msg}`,
        ts: Date.now(),
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── BRIEF (collapsible) ─────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <button
          type="button"
          onClick={() => setBriefExpanded(v => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Icons.Docs size={12} className="text-zinc-400 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 shrink-0">
              Client brief
            </span>
            {!briefExpanded && proposal.brief_text && (
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                {proposal.brief_text.slice(0, 100)}{proposal.brief_text.length > 100 ? '…' : ''}
              </span>
            )}
          </div>
          <Icons.ChevronDown
            size={12}
            className={`text-zinc-400 transition-transform ${briefExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        {briefExpanded && (
          <div className="border-t border-zinc-100 dark:border-zinc-800/60 p-3 space-y-2">
            <textarea
              value={briefDraft}
              onChange={(e) => setBriefDraft(e.target.value)}
              placeholder="Paste what the client asked for — email, transcribed audio, loose note. The more specific, the better the AI quotes."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <div className="flex items-center justify-end gap-2">
              {proposal.brief_text && briefDraft !== proposal.brief_text && (
                <button
                  onClick={() => { setBriefDraft(proposal.brief_text || ''); setBriefExpanded(false); }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={saveBrief}
                className="text-[11px] font-medium px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90"
              >
                Save brief
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── DOCUMENT PREVIEW ───────────────────────────────────── */}
      {hasContent && docData ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 inline-flex items-center gap-1.5">
              <Icons.Eye size={11} /> Document preview
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTaskGen(true)}
                disabled={busy}
                title="Turn this proposal into phases + tasks + subtasks inside a project"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-100/70 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 disabled:opacity-40"
              >
                <Icons.Layers size={11} /> Generate project tasks
              </button>
              <span className="text-[10px] text-zinc-400 hidden sm:inline">how the client will see it</span>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <ProposalDocumentView data={docData} hideAccept readOnly />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-6 text-center space-y-3">
          <div className="inline-flex p-2.5 rounded-full bg-amber-50 dark:bg-amber-500/10">
            <Icons.Sparkles size={16} className="text-amber-500" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {proposal.brief_text ? 'Ready to generate' : 'Paste the client brief above'}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {proposal.brief_text
                ? 'The AI will use your service catalog and recent wins to quote.'
                : 'After pasting it, you can ask the AI to build the proposal or iterate via chat.'}
            </p>
          </div>
          {proposal.brief_text && (
            <button
              onClick={() => runAI()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {busy ? (
                <><Icons.RefreshCw size={11} className="animate-spin" /> Generating…</>
              ) : (
                <><Icons.Sparkles size={11} /> Generate with AI</>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── CHAT ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-1.5">
          <Icons.Message size={11} className="text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Chat con IA
          </span>
          {chatLog.length > 0 && (
            <span className="text-[10px] tabular-nums text-zinc-400 ml-1">· {chatLog.length}</span>
          )}
        </div>

        {/* Thread (only renders when there's history). */}
        {chatLog.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto p-3 space-y-2">
            {chatLog.map(m => (
              <div
                key={m.id}
                className={`text-[12px] leading-snug px-3 py-1.5 rounded-lg ${
                  m.role === 'user'
                    ? 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-200 ml-8'
                    : 'bg-amber-50/60 dark:bg-amber-500/10 text-zinc-700 dark:text-zinc-200 mr-8'
                }`}
              >
                {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Input. Suggestions chips when empty + no thread. */}
        <div className="p-3 space-y-2">
          {chatLog.length === 0 && hasContent && (
            <div className="flex flex-wrap gap-1.5">
              {[
                'Make it more formal',
                'Lower the Simple tier by 20%',
                'Add a CMS option',
                'Add a monthly maintenance addon',
                'More performance-focused',
              ].map(suggest => (
                <button
                  key={suggest}
                  onClick={() => runAI(suggest)}
                  disabled={busy}
                  className="text-[10.5px] px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 disabled:opacity-40"
                >
                  {suggest}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (chatInput.trim()) {
                    const v = chatInput.trim();
                    setChatInput('');
                    runAI(v);
                  }
                }
              }}
              placeholder={hasContent
                ? "Ask for a change: 'raise the Premium price', 'add a support section', 'more casual'…"
                : "Paste a brief above and hit Generate."}
              rows={2}
              disabled={busy || !proposal.brief_text}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[12.5px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 resize-none"
            />
            <button
              onClick={() => {
                if (!chatInput.trim()) return;
                const v = chatInput.trim();
                setChatInput('');
                runAI(v);
              }}
              disabled={busy || !chatInput.trim() || !proposal.brief_text}
              className="shrink-0 inline-flex items-center justify-center px-3 h-10 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Icons.RefreshCw size={12} className="animate-spin" /> : <Icons.Send size={12} />}
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <p className="text-[10px] text-zinc-400">
            ⌘+Enter to send · The AI uses your service catalog and recent wins to quote.
          </p>
        </div>
      </div>

      {/* Modal: turn this proposal into a project plan. Lives at the
          end so it portals above everything else. */}
      <ProposalTaskGenerator
        isOpen={showTaskGen}
        onClose={() => setShowTaskGen(false)}
        proposal={proposal}
      />
    </div>
  );
};
