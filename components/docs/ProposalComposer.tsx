/**
 * ProposalComposer — streamlined "paste → AI → share" flow.
 *
 * The original create form in ProposalsPanel is correct but spread across
 * three steps (fill form / pick service / hit Generate / hit Send). This
 * composer collapses it into one panel:
 *
 *   1. Big textarea: paste what the client asked for.
 *   2. Optional: client / lead picker (auto-resolves to a name).
 *   3. Optional: pick a service (auto-suggests by project type).
 *   4. Click "Generar propuesta" → creates row + runs AI in one go.
 *   5. Live preview of the generated content + pricing.
 *   6. "Copiar link" / "Marcar como enviada" buttons.
 *
 * The advanced fields (project_type / language / complexity / portfolio /
 * "start from existing") collapse into a "Más opciones" disclosure so the
 * 90% case is two clicks. Power users can still expand.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { generateProposalFromAI, getOutputId } from '../../lib/ai';
import { errorLogger } from '../../lib/errorLogger';

// Mirror types from ProposalsPanel — kept locally to avoid circular import.
type ProposalStatus = 'draft' | 'sent' | 'approved' | 'rejected';

interface ServicePricing {
  id: string;
  name: string;
  description?: string | null;
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

interface LeadLite { id: string; name: string; email?: string | null; company?: string | null; }
interface ClientLite { id: string; name: string; company?: string | null; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Available services (already filtered to is_active by parent). */
  services: ServicePricing[];
  /** Recent proposals — used for "start from existing" + win calibration. */
  proposals: Array<{
    id: string;
    title: string;
    status: ProposalStatus;
    pricing_total?: number | null;
    project_type?: string | null;
    complexity?: string | null;
    currency?: string | null;
    content?: string | null;
  }>;
  leads: LeadLite[];
  clients: ClientLite[];
  /** Called after the proposal is created + generated. Parent should
   *  refresh and select the new proposal in its list. */
  onCreated: (proposalId: string) => void;
}

const PROJECT_TYPES = ['web', 'branding', 'saas', 'ecommerce', 'automation', 'animation', 'content'];
const COMPLEXITIES = ['simple', 'standard', 'advanced', 'complex'] as const;

const detectLanguage = (text: string): 'en' | 'es' => {
  const spanishHints = /(\b(el|la|los|las|que|para|con|una|este|esta|cliente|propuesta|entregables|necesito|queremos)\b)/i;
  return spanishHints.test(text) ? 'es' : 'en';
};

// Heuristic: glance at the brief and guess a project_type so the user
// rarely has to expand "Más opciones". Falls back to 'web'.
const detectProjectType = (text: string): string => {
  const t = (text || '').toLowerCase();
  if (/\b(brand|marca|identity|identidad|logo)\b/.test(t)) return 'branding';
  if (/\b(ecommerce|e-commerce|tienda online|shop|shopify|woo)\b/.test(t)) return 'ecommerce';
  if (/\b(saas|app|application|aplicaci[oó]n|product|producto)\b/.test(t)) return 'saas';
  if (/\b(automation|automatizaci[oó]n|workflow|integration|integraci[oó]n|n8n|zapier)\b/.test(t)) return 'automation';
  if (/\b(animation|animaci[oó]n|motion|video)\b/.test(t)) return 'animation';
  if (/\b(content|contenido|blog|copy|copywriting)\b/.test(t)) return 'content';
  return 'web';
};

export const ProposalComposer: React.FC<Props> = ({
  isOpen, onClose, services, proposals, leads, clients, onCreated,
}) => {
  const { currentTenant } = useTenant();

  // ── Form state ───────────────────────────────────────────────────
  const [brief, setBrief] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [clientId, setClientId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced
  const [projectType, setProjectType] = useState('web');
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [complexity, setComplexity] = useState<typeof COMPLEXITIES[number]>('standard');
  const [cloneFromId, setCloneFromId] = useState('');

  // ── Generation lifecycle ─────────────────────────────────────────
  const [phase, setPhase] = useState<'idle' | 'creating' | 'generating' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdProposalId, setCreatedProposalId] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [previewCurrency, setPreviewCurrency] = useState<string>('USD');
  const [shareCopied, setShareCopied] = useState(false);

  // Reset everything when the panel opens fresh.
  useEffect(() => {
    if (!isOpen) return;
    setBrief('');
    setTitle('');
    setTitleTouched(false);
    setClientId('');
    setLeadId('');
    setServiceId('');
    setShowAdvanced(false);
    setProjectType('web');
    setLanguage('en');
    setComplexity('standard');
    setCloneFromId('');
    setPhase('idle');
    setErrorMsg(null);
    setCreatedProposalId(null);
    setCreatedToken(null);
    setPreviewSummary(null);
    setPreviewContent(null);
    setPreviewTotal(null);
    setPreviewCurrency('USD');
    setShareCopied(false);
  }, [isOpen]);

  // Auto-detect project type + language from the brief.
  useEffect(() => {
    if (!brief) return;
    if (!showAdvanced) {
      // Re-detect every time the brief changes WHEN the user hasn't
      // manually opened advanced (assume defaults are good).
      setProjectType(detectProjectType(brief));
      setLanguage(detectLanguage(brief));
    }
  }, [brief, showAdvanced]);

  // Auto-fill title from the first 60 chars of brief if user hasn't typed one.
  useEffect(() => {
    if (titleTouched) return;
    if (!brief) { setTitle(''); return; }
    const firstLine = brief.trim().split('\n')[0].slice(0, 80);
    const clientLabel = clients.find(c => c.id === clientId)?.name
      || leads.find(l => l.id === leadId)?.name;
    setTitle(clientLabel ? `${clientLabel} — ${firstLine}` : firstLine);
  }, [brief, clientId, leadId, titleTouched, clients, leads]);

  // Auto-suggest a service by project type when none is picked.
  const suggestedServiceId = useMemo(() => {
    if (serviceId) return serviceId;
    const match = services.find(s =>
      s.is_active && (
        s.name.toLowerCase().includes(projectType) ||
        (s.tech_stack || []).some(t => t.toLowerCase().includes(projectType))
      )
    );
    return match?.id || services.find(s => s.is_active)?.id || '';
  }, [serviceId, services, projectType]);

  const selectedService = services.find(s => s.id === (serviceId || suggestedServiceId)) || null;

  // ── Submit: create row, then run AI generator inline ────────────
  const handleGenerate = async () => {
    if (!brief.trim()) { setErrorMsg('Paste the client brief first.'); return; }
    if (!currentTenant?.id) { setErrorMsg('Tenant not ready.'); return; }
    setErrorMsg(null);
    setPhase('creating');

    const cloneSource = cloneFromId ? proposals.find(p => p.id === cloneFromId) : null;

    try {
      // 1. Insert the proposal row (status=draft so it's not visible to clients yet).
      const insertPayload = {
        tenant_id: currentTenant.id,
        title: title.trim() || `${projectType} proposal`,
        lead_id: leadId || null,
        client_id: clientId || null,
        status: 'draft' as ProposalStatus,
        project_type: projectType,
        language,
        complexity,
        brief_text: brief.trim(),
        currency: 'USD',
        content: cloneSource?.content || '',
        pricing_total: cloneSource?.pricing_total ?? null,
      };
      const { data: created, error: createErr } = await supabase
        .from('proposals')
        .insert(insertPayload)
        .select('id, public_token')
        .single();
      if (createErr) throw createErr;
      setCreatedProposalId(created.id);
      setCreatedToken(created.public_token);

      // 2. Build the AI prompt — same shape as ProposalsPanel.handleGenerate
      //    so the gemini system prompt produces the Livv-formatted quote.
      setPhase('generating');
      const svc = selectedService;
      const pricingModel = svc?.pricing_model || 'fixed';
      const basePrice = pricingModel === 'hourly'
        ? (svc?.hourly_rate || 0) * (svc?.estimated_weeks || 4) * 40
        : (svc?.fixed_price || 0);
      const factorMap: Record<string, number> = {
        simple: svc?.simple_factor || 0.8,
        standard: svc?.standard_factor || 1.0,
        advanced: svc?.advanced_factor || 1.3,
        complex: svc?.complex_factor || 1.6,
      };
      const factor = factorMap[complexity] ?? 1.0;
      const total = basePrice * factor;

      const catalogLines = services.filter(s => s.is_active).slice(0, 20).map(s => {
        const priceBit = s.pricing_model === 'hourly'
          ? `hourly @ USD ${s.hourly_rate}/h`
          : `fixed USD ${s.fixed_price}`;
        const stack = s.tech_stack?.length ? ` · stack: ${s.tech_stack.join(', ')}` : '';
        return `- ${s.name} (${priceBit}, ~${s.estimated_weeks || '?'} wks${stack})`;
      }).join('\n');

      const recentWins = proposals
        .filter(p => p.status === 'approved' && (p.pricing_total || 0) > 0)
        .slice(0, 5)
        .map(p => `- ${p.title} · ${p.project_type || 'web'} · ${p.complexity || 'standard'} · ${p.currency || 'USD'} ${p.pricing_total}`)
        .join('\n');

      const prompt = [
        `Project type: ${projectType}`,
        `Language: ${language}`,
        `Brief: ${brief.trim()}`,
        `Deliverables (selected service): ${(svc?.deliverables || []).join(', ')}`,
        `Tech stack (selected service): ${(svc?.tech_stack || []).join(', ')}`,
        `Timeline (weeks, selected service): ${svc?.estimated_weeks ?? 4}`,
        `Pricing model (selected service): ${pricingModel}`,
        `Base price (selected service): USD ${basePrice}`,
        `Complexity: ${complexity} (${factor}x)`,
        `Tone: confident`,
        '',
        catalogLines ? `=== SERVICE CATALOG ===\n${catalogLines}` : '',
        recentWins ? `\n=== RECENTLY CLOSED PROPOSALS ===\n${recentWins}` : '',
        '',
        'Output: a Livv-formatted quote. Default to the 2-tier (Simple + Premium) layout unless the brief explicitly asks for the 4-option full quote.',
      ].filter(Boolean).join('\n');

      let result: any = null;
      try {
        result = await generateProposalFromAI(prompt);
      } catch (genErr) {
        errorLogger.warn('proposal AI generate failed, using fallback', genErr);
      }

      // 3. Persist generated content + show preview.
      const finalTotal = result?.pricing_total ?? total;
      const updates: any = {
        pricing_snapshot: {
          ...(svc || {}),
          base_price: basePrice,
          complexity,
          complexity_factor: factor,
          ...(result?.document ? { document: result.document } : {}),
        },
        pricing_total: finalTotal,
        timeline: result?.timeline?.length
          ? { weeks: svc?.estimated_weeks ?? 4, items: result.timeline }
          : { weeks: svc?.estimated_weeks ?? 4, items: [] },
        content: result?.content || '',
        summary: result?.summary || '',
      };
      if (result) (updates as any).ai_output_id = getOutputId(result);

      const { error: updErr } = await supabase
        .from('proposals')
        .update(updates)
        .eq('id', created.id);
      if (updErr) throw updErr;

      setPreviewSummary(result?.summary || null);
      setPreviewContent(result?.content || "(The generator didn't return content. You can write it manually from the detail view.)");
      setPreviewTotal(finalTotal);
      setPreviewCurrency('USD');
      setPhase('done');
      onCreated(created.id);
    } catch (err: any) {
      errorLogger.error('proposal create+generate', err);
      setErrorMsg(err?.message || 'Error generating the proposal');
      setPhase('error');
    }
  };

  // ── Share ────────────────────────────────────────────────────────
  const publicUrl = createdToken
    ? `${window.location.origin}?proposal=${createdToken}`
    : null;

  const handleShare = async () => {
    if (!createdProposalId || !publicUrl) return;
    try {
      // Mark as enabled for public viewing + status='sent' (was draft).
      await supabase
        .from('proposals')
        .update({
          public_enabled: true,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', createdProposalId);
      await navigator.clipboard.writeText(publicUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || "Couldn't enable sharing");
    }
  };

  const isWorking = phase === 'creating' || phase === 'generating';

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width="3xl"
      title="New proposal"
      subtitle="Paste what the client asked for and the AI builds the quote in the template."
    >
      <div className="p-6 space-y-5">
        {/* Step 1: Brief */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
            Lo que pidió el cliente
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Paste the brief, email, transcribed audio, or any note you have. The more specific, the better the AI quotes."
            rows={8}
            disabled={phase === 'done' || isWorking}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
          />
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-[10px] text-zinc-400">
              {brief.length} chars · detected language <span className="font-mono">{language}</span> · type <span className="font-mono">{projectType}</span>
            </p>
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {showAdvanced ? 'Hide options' : 'More options'}
            </button>
          </div>
        </div>

        {/* Step 2: Title (auto-filled, editable) + Client/Lead */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
              placeholder="Auto-completa desde el brief"
              disabled={phase === 'done' || isWorking}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Client or lead (optional)
            </label>
            <select
              value={clientId ? `c:${clientId}` : leadId ? `l:${leadId}` : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('c:')) { setClientId(v.slice(2)); setLeadId(''); }
                else if (v.startsWith('l:')) { setLeadId(v.slice(2)); setClientId(''); }
                else { setClientId(''); setLeadId(''); }
              }}
              disabled={phase === 'done' || isWorking}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px] disabled:opacity-50"
            >
              <option value="">— not linked —</option>
              {clients.length > 0 && (
                <optgroup label="Clients">
                  {clients.map(c => (
                    <option key={c.id} value={`c:${c.id}`}>
                      {c.name}{c.company ? ` · ${c.company}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {leads.length > 0 && (
                <optgroup label="Leads">
                  {leads.map(l => (
                    <option key={l.id} value={`l:${l.id}`}>
                      {l.name}{l.company ? ` · ${l.company}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* Service picker — auto-suggests, user can override */}
        {services.length > 0 && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Service (base price)
              {!serviceId && suggestedServiceId && (
                <span className="ml-1.5 text-zinc-400 normal-case font-normal lowercase">
                  · suggested by project type
                </span>
              )}
            </label>
            <select
              value={serviceId || suggestedServiceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={phase === 'done' || isWorking}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px] disabled:opacity-50"
            >
              <option value="">— no service (AI quotes from scratch) —</option>
              {services.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.pricing_model === 'hourly' ? `USD ${s.hourly_rate}/h` : `USD ${s.fixed_price}`}
                </option>
              ))}
            </select>
            {selectedService && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Base: USD {selectedService.pricing_model === 'hourly'
                  ? (selectedService.hourly_rate || 0) * (selectedService.estimated_weeks || 4) * 40
                  : selectedService.fixed_price} · timeline {selectedService.estimated_weeks ?? 4} wks · complexity {complexity}
              </p>
            )}
          </div>
        )}

        {/* Advanced — collapsed by default */}
        {showAdvanced && (
          <div className="space-y-3 p-3 rounded-lg bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Advanced</div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                disabled={phase === 'done' || isWorking}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[12px]"
              >
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'es')}
                disabled={phase === 'done' || isWorking}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[12px]"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <select
                value={complexity}
                onChange={(e) => setComplexity(e.target.value as any)}
                disabled={phase === 'done' || isWorking}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[12px]"
              >
                {COMPLEXITIES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {proposals.filter(p => p.content).length > 0 && (
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                  Start from a previous proposal
                </label>
                <select
                  value={cloneFromId}
                  onChange={(e) => setCloneFromId(e.target.value)}
                  disabled={phase === 'done' || isWorking}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[12px]"
                >
                  <option value="">Blank</option>
                  {proposals.filter(p => p.content).slice(0, 25).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title}{p.pricing_total ? ` · USD ${p.pricing_total}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Generate / status */}
        {phase === 'idle' || phase === 'error' ? (
          <button
            onClick={handleGenerate}
            disabled={!brief.trim() || isWorking}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Icons.Sparkles size={14} />
            Generate proposal with AI
          </button>
        ) : isWorking ? (
          <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-[13px]">
            <Icons.RefreshCw size={14} className="animate-spin" />
            {phase === 'creating' ? 'Creating draft…' : 'Quoting with AI…'}
          </div>
        ) : null}

        {errorMsg && (
          <div className="text-[12px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-lg px-3 py-2">
            {errorMsg}
          </div>
        )}

        {/* Step 3: Preview + Share */}
        {phase === 'done' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                ✓ Proposal ready
              </div>
              {previewTotal !== null && previewTotal > 0 && (
                <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {previewCurrency} {previewTotal.toLocaleString()}
                </div>
              )}
            </div>

            {previewSummary && (
              <div className="text-[12px] text-zinc-700 dark:text-zinc-300 italic leading-relaxed">
                {previewSummary}
              </div>
            )}

            {previewContent && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3 max-h-[280px] overflow-y-auto">
                <pre className="text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono">
                  {previewContent.slice(0, 3000)}{previewContent.length > 3000 ? '…' : ''}
                </pre>
              </div>
            )}

            {/* Share row */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleShare}
                disabled={!publicUrl}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-colors ${
                  shareCopied
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                    : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90'
                } disabled:opacity-40`}
              >
                {shareCopied ? (
                  <>
                    <Icons.Check size={13} /> Link copied · marked as sent
                  </>
                ) : (
                  <>
                    <Icons.Send size={13} /> Share with client (copies link)
                  </>
                )}
              </button>
              {publicUrl && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-lg text-[12px] font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  <Icons.External size={11} /> Preview
                </a>
              )}
            </div>
            <p className="text-[10px] text-zinc-400">
              The link is public but not indexable. You can disable it later from the proposal detail view.
            </p>
          </div>
        )}
      </div>
    </SlidePanel>
  );
};
