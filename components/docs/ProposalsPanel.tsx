import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';
import { Icons } from '../ui/Icons';
import { Client } from '../../context/ClientsContext';
import { useTenant } from '../../context/TenantContext';
import { generateProposalFromAI } from '../../lib/ai';

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
  const [createTitle, setCreateTitle] = useState('');
  const [createLeadId, setCreateLeadId] = useState<string>('');
  const [createClientId, setCreateClientId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>([]);
  const [createBrief, setCreateBrief] = useState('');
  const [createProjectType, setCreateProjectType] = useState('web');
  const [createLanguage, setCreateLanguage] = useState<'en' | 'es'>('en');
  const [createComplexity, setCreateComplexity] = useState('standard');

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
      const payload = {
        tenant_id: currentTenant?.id,
        title: createTitle.trim(),
        lead_id: createLeadId || null,
        client_id: createClientId || null,
        status: 'draft',
        content: '',
        pricing_snapshot: {},
        timeline: {},
        currency: 'USD',
        project_type: createProjectType,
        language: createLanguage,
        complexity: createComplexity,
        brief_text: createBrief,
        portfolio_ids: []
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

    const prompt = `Project type: ${selectedProposal.project_type || 'web'}\nLanguage: ${language}\nSections: ${sections.join(', ')}\nBrief: ${brief}\nDeliverables: ${(selectedService?.deliverables || []).join(', ')}\nTech stack: ${(selectedService?.tech_stack || []).join(', ')}\nTimeline (weeks): ${timeline.weeks}\nPricing model: ${pricingModel}\nBase price: ${basePrice}\nComplexity: ${complexity} (${factor}x)\nPortfolio references: ${portfolio.filter(p => selectedPortfolioIds.includes(p.id)).map(p => `${p.title} (${p.url})`).join('; ')}\nTone: ${matchingTemplate?.tone || 'confident'}\nOutput should read like a professional contract-style proposal with clear headings and concise sections.\n`;

    generateProposalFromAI(prompt).then((result) => {
      handleUpdate({
        pricing_snapshot: {
          ...(selectedService || {}),
          base_price: basePrice,
          complexity,
          complexity_factor: factor
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
    ? `${window.location.origin}?proposal=${selectedProposal.public_token}`
    : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Propuestas</h3>
            <p className="text-xs text-zinc-500">Desde leads o clientes, con tracking de estado.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold uppercase tracking-wide"
          >
            Nueva
          </button>
        </div>

        {!currentTenant?.id && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Tenant no está listo todavía. Si no cargan leads/clientes, cerrá sesión y volvé a entrar.
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
              placeholder="Título de la propuesta"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            />
            <textarea
              value={createBrief}
              onChange={(e) => setCreateBrief(e.target.value)}
              placeholder="Brief o contexto para la propuesta"
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
                <option value="es">Español</option>
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
              <option value="">Asignar a lead (opcional)</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>{lead.name} · {lead.email}</option>
              ))}
            </select>
            <select
              value={createClientId}
              onChange={(e) => setCreateClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
            >
              <option value="">Asignar a cliente (opcional)</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name} {client.company ? `· ${client.company}` : ''}</option>
              ))}
            </select>
            {leads.length === 0 && clients.length === 0 && (
              <div className="text-[11px] text-zinc-500">
                No hay leads/clientes disponibles. Podés crear la propuesta igual y asignarla después.
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
              >
                Crear
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {isLoading && (
            <div className="text-xs text-zinc-500">Cargando propuestas...</div>
          )}
          {!isLoading && proposals.length === 0 && (
            <div className="text-xs text-zinc-500">No hay propuestas todavía.</div>
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
                    {proposal.project_type || 'general'} · {proposal.client_id ? 'Cliente' : proposal.lead_id ? 'Lead' : 'Sin asignar'}
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
                  <option value="">Template de pricing</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleGenerate}
                  className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-semibold"
                >
                  Generar estructura
                </button>
                <button
                  onClick={handleSend}
                  className="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold"
                >
                  Enviar link
                </button>
              </div>
            </div>

            {publicUrl && selectedProposal.public_enabled && (
              <div className="flex items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                <div className="text-xs text-emerald-700 dark:text-emerald-200">Link público listo</div>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">
                  {publicUrl}
                </a>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <textarea
                  value={selectedProposal.summary || ''}
                  onChange={(e) => handleUpdate({ summary: e.target.value })}
                  placeholder="Resumen ejecutivo"
                  className="w-full min-h-[90px] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                />
                <textarea
                  value={selectedProposal.brief_text || ''}
                  onChange={(e) => handleUpdate({ brief_text: e.target.value })}
                  placeholder="Texto crudo o brief del cliente..."
                  className="w-full min-h-[140px] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                />
                <textarea
                  value={selectedProposal.content || ''}
                  onChange={(e) => handleUpdate({ content: e.target.value })}
                  placeholder="Escribe tu propuesta aquí..."
                  className="w-full min-h-[280px] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
                />
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Comentarios</h4>
                  <div className="space-y-2 mt-2">
                    {comments.map((c) => (
                      <div key={c.id} className={`text-xs p-3 rounded-lg ${c.is_client ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                        {c.comment}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Agregar comentario interno"
                      className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                    />
                    <button
                      onClick={handleComment}
                      className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500">Asignación</div>
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
                    <option value="es">Español</option>
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
                    <option value="">Cliente</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-2">Timeline</div>
                  {(selectedProposal.timeline?.items || []).length ? (
                    <div className="space-y-2">
                      {selectedProposal.timeline.items.map((item: any) => (
                        <div key={item.week} className="text-xs">
                          <div className="font-semibold text-zinc-700 dark:text-zinc-200">{item.title}</div>
                          <div className="text-zinc-500">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400">Genera un timeline desde un template.</div>
                  )}
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
            Selecciona una propuesta para editarla
          </div>
        )}
      </div>
    </div>
  );
};
