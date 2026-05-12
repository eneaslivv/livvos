import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';
import { appUrl } from '../../lib/appUrl';
import { Icons } from '../ui/Icons';
import { Client } from '../../context/ClientsContext';
import { useTenant } from '../../context/TenantContext';
import { generateProposalFromAI, getOutputId } from '../../lib/ai';
import { AIFeedbackBar } from '../ai/AIFeedbackBar';
import { ProposalDocumentView } from '../proposals/ProposalDocumentView';
import { ProposalComposer } from './ProposalComposer';
import { ProposalChatEditor } from './ProposalChatEditor';
import { buildProposalDocumentData } from '../proposals/buildProposalDocumentData';

type ProposalStatus = 'draft' | 'sent' | 'approved' | 'rejected';

interface Proposal {
  id: string;
  tenant_id: string;
  lead_id?: string | null;
  client_id?: string | null;
  title: string;
  summary?: string | null;
  status: ProposalStatus;
  content?: string | null;
  pricing_snapshot?: any;
  timeline?: any;
  currency?: string | null;
  project_type?: string | null;
  language?: string | null;
  brief_text?: string | null;
  portfolio_ids?: string[] | null;
  complexity?: string | null;
  complexity_factor?: number | null;
  pricing_total?: number | null;
  consent_text?: string | null;
  public_token?: string | null;
  public_enabled?: boolean;
  sent_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProposalComment {
  id: string;
  proposal_id: string;
  is_client: boolean;
  comment: string;
  created_at: string;
}

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
  complexity?: string | null;
  tech_stack?: string[] | null;
  deliverables?: string[] | null;
  is_active: boolean;
}

interface ProposalTemplate {
  id: string;
  tenant_id?: string | null;
  project_type: string;
  language: string;
  sections: string[];
  tone?: string | null;
  consent_text?: string | null;
}

interface PortfolioItem {
  id: string;
  title: string;
  url: string;
  cover_url?: string | null;
  project_type?: string | null;
  tags?: string[] | null;
}

interface LeadLite {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
}

const defaultTemplate = (proposal: Proposal, pricing?: ServicePricing | null) => {
  const title = proposal.title || 'Proposal';
  const tech = pricing?.tech_stack?.length ? pricing.tech_stack.join(', ') : 'Custom stack';
  const deliverables = pricing?.deliverables?.length ? pricing.deliverables.join(', ') : 'Scope to be refined';
  const weeks = pricing?.estimated_weeks ?? 4;
  return `# ${title}\n\n## Overview\nThis proposal outlines scope, timeline, and pricing for the requested project.\n\n## Deliverables\n- ${deliverables}\n\n## Technology\n${tech}\n\n## Timeline\nEstimated ${weeks} weeks with weekly milestones.\n\n## Pricing\nPricing based on ${pricing?.pricing_model ?? 'fixed'} model.\n\n## Next Steps\nConfirm the proposal, share feedback, and we will schedule kickoff.`;
};

const buildTimeline = (pricing?: ServicePricing | null) => {
  const weeks = pricing?.estimated_weeks ?? 4;
  const items = Array.from({ length: weeks }).map((_, index) => ({
    week: index + 1,
    title: `Week ${index + 1}`,
    detail: index === 0 ? 'Discovery & alignment' : index === weeks - 1 ? 'QA & launch' : 'Design & build'
  }));
  return { weeks, items };
};

const PROJECT_TYPES = [
  'web',
  'branding',
  'saas',
  'ecommerce',
  'automation',
  'animation',
  'content'
];

const COMPLEXITIES = ['simple', 'standard', 'advanced', 'complex'];

const detectLanguage = (text: string) => {
  const spanishHints = /(\b(el|la|los|las|que|para|con|una|este|esta|cliente|propuesta|entregables)\b)/i;
  return spanishHints.test(text) ? 'es' : 'en';
};

export const ProposalsPanel: React.FC = () => {
  const { currentTenant } = useTenant();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServicePricing[]>([]);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<ProposalComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // The new streamlined composer ("paste brief → AI → share"). The old
  // inline form (showCreate / handleCreate) stays for power users who
  // want full manual control over each field — they can reach it via
  // the "Más opciones" link on the empty state.
  const [showComposer, setShowComposer] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createLeadId, setCreateLeadId] = useState<string>('');
  const [createClientId, setCreateClientId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>([]);
  const [createBrief, setCreateBrief] = useState('');
  const [createProjectType, setCreateProjectType] = useState('web');
  const [createLanguage, setCreateLanguage] = useState<'en' | 'es'>('en');
  const [createComplexity, setCreateComplexity] = useState('standard');
  // "Start from existing proposal" — when set, handleCreate copies the
  // chosen proposal's content / pricing / service / portfolio into the
  // new draft so the user can iterate from a prior shape instead of a
  // blank page. This is the "ya configurado a un precio lógico" the
  // user asked for: each new proposal carries forward the heuristics
  // we already settled on.
  const [createCloneFromId, setCreateCloneFromId] = useState<string>('');
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [lastAIOutputId, setLastAIOutputId] = useState<string | null>(null);
  // Preview modal — opens the same client-facing Livv design that the
  // public token URL serves, but with `hideAccept` so the studio user
  // can review their proposal without an active "Accept" form.
  const [previewing, setPreviewing] = useState(false);

  // ─── Custom templates manager ────────────────────────────────────
  // The proposal_templates table holds the per-tenant template catalog
  // (project_type + language + sections + tone + consent_text). Until
  // now there was no UI to manage them — they were seeded from a SQL
  // INSERT and never touched again. This adds inline CRUD so the user
  // can shape templates that match how THEY pitch (sections like
  // 'Discovery', 'Scope', 'Investment', 'Next steps', etc).
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplProjectType, setTplProjectType] = useState('web');
  const [tplLanguage, setTplLanguage] = useState<'en' | 'es'>('en');
  const [tplSections, setTplSections] = useState('Overview, Scope, Timeline, Investment, Next steps');
  const [tplTone, setTplTone] = useState('confident');
  const [tplConsent, setTplConsent] = useState('');

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTplProjectType('web');
    setTplLanguage('en');
    setTplSections('Overview, Scope, Timeline, Investment, Next steps');
    setTplTone('confident');
    setTplConsent('');
  };

  const startEditTemplate = (t: ProposalTemplate) => {
    setEditingTemplateId(t.id);
    setTplProjectType(t.project_type);
    setTplLanguage((t.language as 'en' | 'es') || 'en');
    setTplSections((t.sections || []).join(', '));
    setTplTone(t.tone || 'confident');
    setTplConsent(t.consent_text || '');
  };

  const handleSaveTemplate = async () => {
    if (!currentTenant?.id) { alert('Tenant not ready'); return; }
    const sections = tplSections.split(',').map(s => s.trim()).filter(Boolean);
    if (sections.length === 0) { alert('Add at least one section'); return; }
    const payload = {
      tenant_id: currentTenant.id,
      project_type: tplProjectType,
      language: tplLanguage,
      sections,
      tone: tplTone || null,
      consent_text: tplConsent || null,
    };
    try {
      if (editingTemplateId) {
        const { data, error } = await supabase
          .from('proposal_templates')
          .update(payload)
          .eq('id', editingTemplateId)
          .select()
          .single();
        if (error) throw error;
        setTemplates(prev => prev.map(t => t.id === editingTemplateId ? (data as ProposalTemplate) : t));
      } else {
        const { data, error } = await supabase
          .from('proposal_templates')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setTemplates(prev => [data as ProposalTemplate, ...prev]);
      }
      resetTemplateForm();
    } catch (err: any) {
      alert(err?.message || 'Could not save template');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template? Existing proposals are not affected.')) return;
    try {
      const { error } = await supabase.from('proposal_templates').delete().eq('id', id);
      if (error) throw error;
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplateId === id) resetTemplateForm();
    } catch (err: any) {
      alert(err?.message || 'Could not delete template');
    }
  };

  const selectedProposal = useMemo(
    () => proposals.find(p => p.id === selectedId) || null,
    [proposals, selectedId]
  );

  const selectedService = useMemo(
    () => services.find(s => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [proposalRes, leadRes, clientRes, serviceRes] = await Promise.all([
        supabase.from('proposals').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('id,name,email,created_at'),
        supabase.from('clients').select('id,name,email,created_at'),
        supabase.from('service_pricing').select('*').eq('is_active', true).order('name')
      ]);

      const [templateRes, portfolioRes] = await Promise.all([
        supabase.from('proposal_templates').select('*'),
        supabase.from('portfolio_items').select('*').order('created_at', { ascending: false })
      ]);

      if (proposalRes.error) throw proposalRes.error;
      if (templateRes.error && templateRes.error.code !== 'PGRST116') throw templateRes.error;
      if (portfolioRes.error && portfolioRes.error.code !== 'PGRST116') throw portfolioRes.error;

      setProposals(proposalRes.data || []);
      if (leadRes.error && leadRes.error.code !== 'PGRST116') {
        errorLogger.error('Error loading leads:', leadRes.error);
      }
      if (clientRes.error && clientRes.error.code !== 'PGRST116') {
        errorLogger.error('Error loading clients:', clientRes.error);
      }
      if (serviceRes.error && serviceRes.error.code !== 'PGRST116') {
        errorLogger.error('Error loading services:', serviceRes.error);
      }
      setLeads((leadRes.data || []) as LeadLite[]);
      setClients((clientRes.data || []) as Client[]);
      setServices((serviceRes.data || []) as ServicePricing[]);
      setTemplates((templateRes.data || []) as ProposalTemplate[]);
      setPortfolio((portfolioRes.data || []) as PortfolioItem[]);
    } catch (err: any) {
      errorLogger.error('Error loading proposals:', err);
      setLoadError(err?.message || 'Error loading proposals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchComments = useCallback(async (proposalId: string) => {
    const { data, error } = await supabase
      .from('proposal_comments')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true });
    if (!error) setComments(data || []);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (selectedId) {
      fetchComments(selectedId);
    } else {
      setComments([]);
    }
  }, [selectedId, fetchComments]);

  useEffect(() => {
    if (selectedProposal?.portfolio_ids) {
      setSelectedPortfolioIds(selectedProposal.portfolio_ids);
    }
  }, [selectedProposal]);

  const handleCreate = async () => {
    if (!createTitle.trim()) return;
    if (!currentTenant?.id) {
      alert('Tenant not ready yet. Please retry.');
      return;
    }
    setIsSaving(true);
    try {
      // If the user picked a previous proposal as a starting point, copy
      // its shape into the new draft. We never carry over status/sent_at/
      // approved_at/public_token — those reset to a fresh draft state.
      const cloneSource = createCloneFromId
        ? proposals.find(p => p.id === createCloneFromId)
        : null;
      const payload = {
        tenant_id: currentTenant?.id,
        title: createTitle.trim(),
        lead_id: createLeadId || null,
        client_id: createClientId || null,
        status: 'draft',
        content: cloneSource?.content || '',
        pricing_snapshot: cloneSource?.pricing_snapshot || {},
        pricing_total: cloneSource?.pricing_total ?? null,
        timeline: cloneSource?.timeline || {},
        currency: cloneSource?.currency || 'USD',
        project_type: cloneSource?.project_type || createProjectType,
        language: cloneSource?.language || createLanguage,
        complexity: cloneSource?.complexity || createComplexity,
        complexity_factor: cloneSource?.complexity_factor ?? null,
        brief_text: createBrief || cloneSource?.brief_text || '',
        portfolio_ids: cloneSource?.portfolio_ids || [],
        consent_text: cloneSource?.consent_text || null,
      };
      const { data, error } = await supabase.from('proposals').insert(payload).select().single();
      if (error) throw error;
      setProposals(prev => [data as Proposal, ...prev]);
      setSelectedId(data.id);
      setShowCreate(false);
      setCreateTitle('');
      setCreateLeadId('');
      setCreateClientId('');
      setCreateBrief('');
      setCreateProjectType('web');
      setCreateLanguage('en');
      setCreateComplexity('standard');
      setCreateCloneFromId('');
    } catch (err: any) {
      alert(err.message || 'Error creating proposal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (updates: Partial<Proposal>) => {
    if (!selectedProposal) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('proposals')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', selectedProposal.id)
        .select()
        .single();
      if (error) throw error;
      setProposals(prev => prev.map(p => (p.id === selectedProposal.id ? (data as Proposal) : p)));

      if (updates.status || updates.public_enabled || updates.sent_at) {
        const leadId = (data as Proposal).lead_id;
        if (leadId) {
          await supabase.from('leads').update({
            proposal_status: (data as Proposal).status,
            last_proposal_id: (data as Proposal).id,
            proposal_sent_at: (data as Proposal).sent_at,
            proposal_approved_at: (data as Proposal).approved_at
          }).eq('id', leadId);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error updating proposal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = () => {
    if (!selectedProposal) return;
    const brief = selectedProposal.brief_text || '';
    const language = selectedProposal.language || detectLanguage(brief);
    const timeline = buildTimeline(selectedService);
    const matchingTemplate = templates.find(t => t.project_type === (selectedProposal.project_type || 'web') && t.language === language)
      || templates.find(t => t.project_type === (selectedProposal.project_type || 'web'))
      || null;
    const sections = matchingTemplate?.sections || [];
    const consent = matchingTemplate?.consent_text || selectedProposal.consent_text || null;

    const pricingModel = selectedService?.pricing_model || 'fixed';
    const basePrice = pricingModel === 'hourly'
      ? (selectedService?.hourly_rate || 0) * (selectedService?.estimated_weeks || 4) * 40
      : (selectedService?.fixed_price || 0);
    const complexity = selectedProposal.complexity || 'standard';
    const factorMap: Record<string, number> = {
      simple: selectedService?.simple_factor || 0.8,
      standard: selectedService?.standard_factor || 1.0,
      advanced: selectedService?.advanced_factor || 1.3,
      complex: selectedService?.complex_factor || 1.6
    };
    const factor = factorMap[complexity] ?? 1.0;
    const total = basePrice * factor;

    // Service catalog as grounding for the AI's pricing — the Livv quoting
    // framework already gives bracket numbers, but the AI should also
    // reference the user's configured per-service rates when relevant.
    const catalogLines = services
      .filter(s => s.is_active)
      .slice(0, 20)
      .map(s => {
        const priceBit = s.pricing_model === 'hourly'
          ? `hourly @ USD ${s.hourly_rate}/h`
          : `fixed USD ${s.fixed_price}`;
        const stack = s.tech_stack?.length ? ` · stack: ${s.tech_stack.join(', ')}` : '';
        return `- ${s.name} (${priceBit}, ~${s.estimated_weeks || '?'} wks${stack})`;
      })
      .join('\n');

    // Up to 5 recent CONFIRMED proposals (status=approved with pricing) as
    // a "what we've actually closed at" reference. Keeps the AI calibrated
    // to real wins instead of guessing from the bracket alone.
    const recentWins = proposals
      .filter(p => p.status === 'approved' && (p.pricing_total || 0) > 0)
      .slice(0, 5)
      .map(p => `- ${p.title} · ${p.project_type || 'web'} · ${p.complexity || 'standard'} · ${p.currency || 'USD'} ${p.pricing_total}`)
      .join('\n');

    const prompt = [
      `Project type: ${selectedProposal.project_type || 'web'}`,
      `Language: ${language}`,
      `Sections: ${sections.join(', ')}`,
      `Brief: ${brief}`,
      `Deliverables (selected service): ${(selectedService?.deliverables || []).join(', ')}`,
      `Tech stack (selected service): ${(selectedService?.tech_stack || []).join(', ')}`,
      `Timeline (weeks, selected service): ${timeline.weeks}`,
      `Pricing model (selected service): ${pricingModel}`,
      `Base price (selected service): USD ${basePrice}`,
      `Complexity: ${complexity} (${factor}x)`,
      `Portfolio references: ${portfolio.filter(p => selectedPortfolioIds.includes(p.id)).map(p => `${p.title} (${p.url})`).join('; ') || '(none)'}`,
      `Tone: ${matchingTemplate?.tone || 'confident'}`,
      '',
      catalogLines ? `=== SERVICE CATALOG (the user's configured rates — use as price grounding) ===\n${catalogLines}` : '',
      recentWins ? `\n=== RECENTLY CLOSED PROPOSALS (use to calibrate this quote to real wins) ===\n${recentWins}` : '',
      '',
      'Output: a Livv-formatted quote following the system prompt. Default to the 2-tier (Simple + Premium) layout unless the brief explicitly asks for a 4-option / "full quote" / "Simple Custom and Simple CMS" presentation.',
    ].filter(Boolean).join('\n');

    setAiWarning(null);
    generateProposalFromAI(prompt).then((result) => {
      setLastAIOutputId(getOutputId(result));
      // The AI may return a `document` field — the structured payload that
      // drives the Livv "Sales Proposal v2" client-facing design. We tuck
      // it under pricing_snapshot.document so the existing column carries
      // both pricing metadata AND presentation data without a migration.
      handleUpdate({
        pricing_snapshot: {
          ...(selectedService || {}),
          base_price: basePrice,
          complexity,
          complexity_factor: factor,
          ...(result.document ? { document: result.document } : {}),
        },
        pricing_total: total,
        timeline: result.timeline?.length ? { weeks: timeline.weeks, items: result.timeline } : timeline,
        content: result.content || defaultTemplate(selectedProposal, selectedService),
        summary: result.summary,
        language,
        consent_text: consent || selectedProposal.consent_text
      });
    }).catch(() => {
      handleUpdate({
        pricing_snapshot: selectedService || {},
        timeline,
        content: defaultTemplate(selectedProposal, selectedService),
        language,
        consent_text: consent || selectedProposal.consent_text
      });
      setAiWarning('AI unavailable — used the default template.');
    });
  };

  const handleSend = () => {
    if (!selectedProposal) return;
    handleUpdate({
      public_enabled: true,
      sent_at: new Date().toISOString(),
      status: selectedProposal.status === 'draft' ? 'sent' : selectedProposal.status
    });
  };

  const handleComment = async () => {
    if (!selectedProposal || !commentText.trim()) return;
    const { data, error } = await supabase
      .from('proposal_comments')
      .insert({
        proposal_id: selectedProposal.id,
        tenant_id: selectedProposal.tenant_id,
        comment: commentText.trim(),
        is_client: false
      })
      .select()
      .single();
    if (!error && data) {
      setComments(prev => [...prev, data as ProposalComment]);
      setCommentText('');
    }
  };

  const statusBadge = (status: ProposalStatus) => {
    const styles: Record<ProposalStatus, string> = {
      draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
      sent: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
      approved: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
      rejected: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
    };
    return `text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${styles[status]}`;
  };

  const publicUrl = selectedProposal?.public_token
    ? `${appUrl()}?proposal=${selectedProposal.public_token}`
    : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Proposals</h3>
            <p className="text-xs text-zinc-500">From leads or clients, with status tracking.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setShowTemplates(v => !v); if (!showTemplates) resetTemplateForm(); }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                showTemplates
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-800 dark:hover:bg-zinc-800'
              }`}
              title="Manage proposal templates"
            >
              Templates
            </button>
            <button
              onClick={() => setShowComposer(true)}
              className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold uppercase tracking-wide inline-flex items-center gap-1"
              title="Paste what the client asked for and the AI builds it"
            >
              <Icons.Sparkles size={11} />
              New
            </button>
          </div>
        </div>

        {/* ─── Templates manager (toggled) ────────────────────────── */}
        {showTemplates && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Templates
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Reusable section sets that the AI follows when generating proposals.
                </div>
              </div>
              <span className="text-[10px] tabular-nums text-zinc-400">
                {templates.length} saved
              </span>
            </div>

            {/* List of existing templates */}
            {templates.length > 0 && (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 -mx-1">
                {templates.map(t => {
                  const isEditing = editingTemplateId === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-2 px-2 py-2 rounded-md group/tpl ${
                        isEditing ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">
                          {t.project_type} · {t.language}
                          {t.tone && <span className="text-[10px] text-zinc-400 ml-2">{t.tone}</span>}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {(t.sections || []).join(' · ')}
                        </div>
                      </div>
                      <button
                        onClick={() => startEditTemplate(t)}
                        className="text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="opacity-0 group-hover/tpl:opacity-100 text-[10px] font-medium text-rose-500 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create / edit form */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {editingTemplateId ? 'Edit template' : 'New template'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={tplProjectType}
                  onChange={(e) => setTplProjectType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                >
                  {PROJECT_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <select
                  value={tplLanguage}
                  onChange={(e) => setTplLanguage(e.target.value as 'en' | 'es')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Sections</label>
                <input
                  value={tplSections}
                  onChange={(e) => setTplSections(e.target.value)}
                  placeholder="Comma-separated, e.g. Overview, Scope, Timeline, Investment, Next steps"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={tplTone}
                  onChange={(e) => setTplTone(e.target.value)}
                  placeholder="Tone (e.g. confident, friendly)"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                />
                <input
                  value={tplConsent}
                  onChange={(e) => setTplConsent(e.target.value)}
                  placeholder="Consent line (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveTemplate}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
                >
                  {editingTemplateId ? 'Save changes' : 'Add template'}
                </button>
                {editingTemplateId && (
                  <button
                    onClick={resetTemplateForm}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!currentTenant?.id && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Tenant is not ready yet. If leads/clients are not loading, sign out and sign back in.
          </div>
        )}

        {loadError && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {loadError}
          </div>
        )}

        {showCreate && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Proposal title"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            />
            {/* Start from existing — pre-fills brief / pricing / project_type
                / complexity / portfolio from a prior proposal so the user
                isn't writing from scratch every time. Empty value = blank. */}
            {proposals.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                  Start from existing
                </label>
                <select
                  value={createCloneFromId}
                  onChange={(e) => setCreateCloneFromId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                >
                  <option value="">Blank — start from scratch</option>
                  {proposals
                    .filter(p => p.content && p.content.trim().length > 0)
                    .slice(0, 25)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {p.pricing_total ? ` · $${p.pricing_total.toLocaleString()}` : ''}
                        {p.project_type ? ` · ${p.project_type}` : ''}
                      </option>
                    ))}
                </select>
                {createCloneFromId && (
                  <p className="text-[10px] text-zinc-400">
                    Content, pricing, timeline, project type, complexity and portfolio links will be copied as a starting point. Status resets to draft.
                  </p>
                )}
              </div>
            )}
            <textarea
              value={createBrief}
              onChange={(e) => setCreateBrief(e.target.value)}
              placeholder="Brief or context for the proposal"
              className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={createProjectType}
                onChange={(e) => setCreateProjectType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
              >
                {PROJECT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={createLanguage}
                onChange={(e) => setCreateLanguage(e.target.value as 'en' | 'es')}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
              <select
                value={createComplexity}
                onChange={(e) => setCreateComplexity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
              >
                {COMPLEXITIES.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            <select
              value={createLeadId}
              onChange={(e) => setCreateLeadId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            >
              <option value="">Assign to lead (optional)</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>{lead.name} · {lead.email}</option>
              ))}
            </select>
            <select
              value={createClientId}
              onChange={(e) => setCreateClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            >
              <option value="">Assign to client (optional)</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name} {client.company ? `· ${client.company}` : ''}</option>
              ))}
            </select>
            {leads.length === 0 && clients.length === 0 && (
              <div className="text-[11px] text-zinc-500">
                No leads/clients available. You can still create the proposal and assign it later.
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {isLoading && (
            <div className="text-xs text-zinc-500">Loading proposals...</div>
          )}
          {!isLoading && proposals.length === 0 && (
            <div className="text-xs text-zinc-500">No proposals yet.</div>
          )}
          {proposals.map((proposal) => (
            <button
              key={proposal.id}
              onClick={() => setSelectedId(proposal.id)}
              className={`w-full text-left border rounded-xl p-3 transition-all ${
                selectedId === proposal.id
                  ? 'border-indigo-400 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/20'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{proposal.title}</div>
                <div className="text-[11px] text-zinc-500">
                    {proposal.project_type || 'general'} · {proposal.client_id ? 'Client' : proposal.lead_id ? 'Lead' : 'Unassigned'}
                  </div>
                </div>
                <span className={statusBadge(proposal.status)}>{proposal.status}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="xl:col-span-8">
        {selectedProposal ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="space-y-2">
                <input
                  value={selectedProposal.title}
                  onChange={(e) => handleUpdate({ title: e.target.value })}
                  className="text-2xl font-bold bg-transparent border-b border-zinc-200 dark:border-zinc-700 focus:outline-none w-full"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedProposal.status}
                    onChange={(e) => handleUpdate({ status: e.target.value as ProposalStatus })}
                    className="text-xs px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <span className="text-xs text-zinc-500">{selectedProposal.currency || 'USD'}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="text-xs px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                >
                  <option value="">Pricing template</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleGenerate}
                  className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-semibold"
                >
                  Generate structure
                </button>
                <button
                  onClick={() => setPreviewing(true)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  title="Open the client-facing design preview"
                >
                  Preview
                </button>
                <button
                  onClick={handleSend}
                  className="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold"
                >
                  Send link
                </button>
              </div>
              {aiWarning && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">{aiWarning}</div>
              )}
              {lastAIOutputId && (
                <AIFeedbackBar outputId={lastAIOutputId} className="mt-2" />
              )}
            </div>

            {publicUrl && selectedProposal.public_enabled && (
              <div className="flex items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                <div className="text-xs text-emerald-700 dark:text-emerald-200">Public link ready</div>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">
                  {publicUrl}
                </a>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                {/* Chat-style editor: brief (collapsible) → rendered
                    document preview → AI chat to refine. The legacy
                    3-textarea layout was replaced because the user
                    couldn't see the actual document, just raw markdown,
                    and there was no iterate-via-chat flow. */}
                <ProposalChatEditor
                  proposal={selectedProposal}
                  services={services}
                  recentWins={proposals
                    .filter(p => p.status === 'approved' && (p.pricing_total || 0) > 0)
                    .slice(0, 5)
                    .map(p => ({
                      title: p.title,
                      pricing_total: p.pricing_total || 0,
                      project_type: p.project_type,
                      complexity: p.complexity,
                      currency: p.currency,
                    }))}
                  onUpdate={handleUpdate}
                  onAIOutput={(id) => setLastAIOutputId(id)}
                />

                {/* Comments stays — it's an internal thread between
                    teammates, distinct from the AI chat above. */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                  <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-1.5">
                    <Icons.Message size={11} className="text-zinc-400" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      Internal comments
                    </span>
                    {comments.length > 0 && (
                      <span className="text-[10px] tabular-nums text-zinc-400">· {comments.length}</span>
                    )}
                  </div>
                  {comments.length > 0 && (
                    <div className="p-3 space-y-1.5 max-h-[160px] overflow-y-auto">
                      {comments.map((c) => (
                        <div key={c.id} className={`text-xs px-3 py-2 rounded-lg ${c.is_client ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-zinc-100 dark:bg-zinc-800/60'}`}>
                          {c.comment}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 flex items-center gap-2 border-t border-zinc-100 dark:border-zinc-800/60">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && commentText.trim()) handleComment(); }}
                      placeholder="Note for your team (client doesn't see this)"
                      className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                    />
                    <button
                      onClick={handleComment}
                      disabled={!commentText.trim()}
                      className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs disabled:opacity-40"
                    >
                      Comment
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500">Assignment</div>
                  <select
                    value={selectedProposal.project_type || 'web'}
                    onChange={(e) => handleUpdate({ project_type: e.target.value })}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                  >
                    {PROJECT_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <select
                    value={selectedProposal.language || 'en'}
                    onChange={(e) => handleUpdate({ language: e.target.value })}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                  <select
                    value={selectedProposal.complexity || 'standard'}
                    onChange={(e) => handleUpdate({ complexity: e.target.value })}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                  >
                    {COMPLEXITIES.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                  <select
                    value={selectedProposal.lead_id || ''}
                    onChange={(e) => handleUpdate({ lead_id: e.target.value || null })}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                  >
                    <option value="">Lead</option>
                    {leads.map(lead => (
                      <option key={lead.id} value={lead.id}>{lead.name} · {lead.email}</option>
                    ))}
                  </select>
                  <select
                    value={selectedProposal.client_id || ''}
                    onChange={(e) => handleUpdate({ client_id: e.target.value || null })}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                  >
                    <option value="">Client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-2">Timeline</div>
                  {(() => {
                    // Defensive: timeline.items can legitimately be missing,
                    // empty, or — from older proposals or buggy AI output —
                    // a non-array value (string / object). Guard with
                    // Array.isArray so a single bad row doesn't crash the
                    // entire Docs page via PageErrorBoundary.
                    const items = Array.isArray(selectedProposal.timeline?.items)
                      ? selectedProposal.timeline!.items
                      : [];
                    if (items.length === 0) {
                      return <div className="text-xs text-zinc-400">Generate a timeline from a template.</div>;
                    }
                    return (
                      <div className="space-y-2">
                        {items.map((item: any, idx: number) => (
                          <div key={item.week ?? idx} className="text-xs">
                            <div className="font-semibold text-zinc-700 dark:text-zinc-200">{item.title}</div>
                            <div className="text-zinc-500">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">Pricing total</div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedProposal.pricing_total ? `${selectedProposal.currency || 'USD'} ${selectedProposal.pricing_total.toFixed(2)}` : '—'}
                  </div>
                </div>
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-2">Portfolio</div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {portfolio.map(item => (
                      <label key={item.id} className="flex items-center gap-2 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={selectedPortfolioIds.includes(item.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedPortfolioIds, item.id]
                              : selectedPortfolioIds.filter(id => id !== item.id);
                            setSelectedPortfolioIds(next);
                            handleUpdate({ portfolio_ids: next });
                          }}
                        />
                        {item.title}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            Select a proposal to edit
          </div>
        )}
      </div>

      {/* ─── Preview overlay — Livv "Sales Proposal v2" design ────────
          Studio-side preview of the same client-facing document the
          public token URL serves. We hide the Accept section so the
          user can't accidentally self-approve. */}
      {previewing && selectedProposal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewing(false); }}
        >
          <div className="flex items-center justify-between px-5 py-3 bg-zinc-900/80 backdrop-blur text-zinc-100 shrink-0">
            <div className="text-xs font-medium uppercase tracking-wider opacity-80">
              Preview — client view
            </div>
            <div className="flex items-center gap-3">
              {selectedProposal.public_token && (
                <a
                  href={`${appUrl()}?proposal=${selectedProposal.public_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  Open public link →
                </a>
              )}
              <button
                onClick={() => setPreviewing(false)}
                className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-[#FDFBF7]">
            <ProposalDocumentView
              data={buildProposalDocumentData(selectedProposal, {
                clientName: clients.find(c => c.id === selectedProposal.client_id)?.name
                  || leads.find(l => l.id === selectedProposal.lead_id)?.name
                  || undefined,
              })}
              hideAccept
              readOnly
            />
          </div>
        </div>,
        document.body
      )}

      {/* Streamlined "paste brief → AI → share" flow. Opens from the New
          button in the header. The legacy inline form stays as a
          power-user fallback (still accessible via showCreate). */}
      <ProposalComposer
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        services={services}
        proposals={proposals}
        leads={leads}
        clients={clients}
        onCreated={(id) => {
          fetchAll();
          setSelectedId(id);
        }}
      />
    </div>
  );
};
