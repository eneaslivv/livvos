import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/ui/Icons';
import { Lead, WebAnalytics } from '../types';
import { useSupabase } from '../hooks/useSupabase';
import { useLeadToProject } from '../hooks/useLeadToProject';
import { CRMBoard } from '../components/crm/CRMBoard';
import { NewLeadModal } from '../components/crm/NewLeadModal';
const LeadDetailPanelLazy = React.lazy(() =>
  import('../components/crm/LeadDetailPanel').then((module) => ({ default: module.LeadDetailPanel }))
);

type LeadStatus = 'new' | 'contacted' | 'following' | 'closed' | 'lost';
type LeadTemperature = 'cold' | 'warm' | 'hot';
type LeadCategory = 'branding' | 'web-design' | 'ecommerce' | 'saas' | 'creators' | 'other';

interface SalesProps {
  view: 'crm' | 'inbox' | 'analytics';
  onNavigate?: (page: string) => void;
}

// ─── SubViewToggle ───────────────────────────────────────────────
// Pipeline ↔ Inbox pill toggle — editorial design system.
const SubViewToggle: React.FC<{
  subView: 'pipeline' | 'inbox';
  onChange: (v: 'pipeline' | 'inbox') => void;
}> = ({ subView, onChange }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: 3,
      background: 'var(--os-panel)',
      border: '0.5px solid var(--os-border-2)',
      borderRadius: 999,
      boxShadow: 'var(--shadow-card)',
    }}
  >
    {(['pipeline', 'inbox'] as const).map((v) => (
      <button
        key={v}
        onClick={() => onChange(v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: subView === v ? 'var(--os-ink)' : 'transparent',
          border: 0,
          cursor: 'pointer',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          color: subView === v ? 'var(--livv-cream-50, #FDFBF7)' : 'var(--os-fg-2)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {v === 'pipeline' ? <Icons.Grid size={12} /> : <Icons.Inbox size={12} />}
        {v.charAt(0).toUpperCase() + v.slice(1)}
      </button>
    ))}
  </div>
);

export const Sales: React.FC<SalesProps> = ({ view, onNavigate }) => {
  const leadsEnabled = view !== 'analytics';
  const analyticsEnabled = view === 'analytics';

  // Pipeline ↔ Inbox toggle that lives inside Sales Overview. The
  // 'Leads Inbox' sidebar entry was removed because the two surfaces
  // are 95% the same data — just different layouts. Default to the
  // sub-view that matches the incoming `view` prop, so deep links to
  // /sales_leads still land on the inbox table, and /sales_dashboard
  // lands on the pipeline.
  const [subView, setSubView] = useState<'pipeline' | 'inbox'>(
    view === 'inbox' ? 'inbox' : 'pipeline'
  );
  // Re-sync if the user navigates between sales_dashboard / sales_leads
  // via a direct URL change (e.g. browser back/forward).
  useEffect(() => {
    if (view === 'inbox') setSubView('inbox');
    else if (view === 'crm') setSubView('pipeline');
  }, [view]);
  const { data: leads, loading: leadsLoading, error: leadsError, add: addLead, update: updateLead, remove: removeLead, refresh: refreshLeads } = useSupabase<Lead>('leads', {
    enabled: leadsEnabled,
    subscribe: leadsEnabled,
  });
  const { data: analytics } = useSupabase<WebAnalytics>('web_analytics', {
    enabled: analyticsEnabled,
    subscribe: false,
  });
  const { convertLeadToProject, isConverting } = useLeadToProject();

  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [category, setCategory] = useState<LeadCategory | 'all'>('all');
  const [temperature, setTemperature] = useState<LeadTemperature | 'all'>('all');
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [showConvertModal, setShowConvertModal] = useState<Lead | null>(null);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [newLeadData, setNewLeadData] = useState({ name: '', email: '', message: '', company: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isSavingLead, setIsSavingLead] = useState(false);

  const normalizedLeads = useMemo(() => leads.map((lead: any) => ({
    ...lead,
    status: lead.status || 'new',
    createdAt: lead.createdAt || lead.created_at || '',
    lastInteraction: lead.lastInteraction || lead.last_interaction || '',
    aiAnalysis: lead.aiAnalysis || lead.ai_analysis,
    history: Array.isArray(lead.history) ? lead.history : [],
  })), [leads]);

  const filtered = useMemo(() => normalizedLeads.filter((l: any) => {
    if (filter !== 'all' && l.status !== filter) return false;
    if (category !== 'all' && l.aiAnalysis?.category !== category) return false;
    if (temperature !== 'all' && l.aiAnalysis?.temperature !== temperature) return false;
    return true;
  }), [normalizedLeads, filter, category, temperature]);

  const selectedLead = useMemo(
    () => normalizedLeads.find((lead: any) => lead.id === selectedLeadId) || null,
    [normalizedLeads, selectedLeadId]
  );

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    try {
      const lead = normalizedLeads.find((item: any) => item.id === id);
      const nextHistory = lead ? [
        ...(lead.history || []),
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'status_change',
          content: `Status changed to ${newStatus}`,
          date: new Date().toISOString(),
        },
      ] : undefined;

      const supportsHistory = lead && Object.prototype.hasOwnProperty.call(lead, 'history');
      const supportsLastInteraction = lead && Object.prototype.hasOwnProperty.call(lead, 'last_interaction');

      await updateLead(id, {
        status: newStatus,
        ...(supportsHistory ? { history: nextHistory } : {}),
        ...(supportsLastInteraction ? { last_interaction: new Date().toISOString() } : {}),
      } as any);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error updating lead status';
      alert(message);
      await refreshLeads();
    }
  };

  const handleDeleteLead = async (id: string) => {
    try {
      await removeLead(id);
      // If the lead being deleted is the one open in the side panel, close it.
      if (selectedLeadId === id) setSelectedLeadId(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No pude eliminar el lead.';
      alert(message);
      await refreshLeads();
    }
  };

  const handleSaveLead = async (id: string, updates: Partial<Lead>) => {
    setIsSavingLead(true);
    try {
      const lead = normalizedLeads.find((item: any) => item.id === id);
      const supportsLastInteraction = lead && Object.prototype.hasOwnProperty.call(lead, 'last_interaction');

      await updateLead(id, {
        ...updates,
        ...(supportsLastInteraction ? { last_interaction: new Date().toISOString() } : {}),
      } as any);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error updating lead';
      alert(message);
      await refreshLeads();
    } finally {
      setIsSavingLead(false);
    }
  };

  const handleAddComment = async (id: string, comment: string, type: Lead['history'][number]['type'] = 'note') => {
    const lead = normalizedLeads.find((item: any) => item.id === id);
    if (!lead) return;
    const nextHistory = [
      ...(lead.history || []),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        content: comment,
        date: new Date().toISOString(),
      },
    ];
    await handleSaveLead(id, { history: nextHistory } as any);
  };

  const handleConvertToProject = async (lead: Lead) => {
    setConvertingLeadId(lead.id);
    try {
      const result = await convertLeadToProject(lead, {
        markLeadClosed: true,
      });

      if (result.success) {
        // Navigate to projects page
        if (onNavigate) {
          onNavigate('projects');
        }
      } else {
        alert(`Failed to convert: ${result.error}`);
      }
    } finally {
      setConvertingLeadId(null);
      setShowConvertModal(null);
    }
  };

  const handleCreateLead = async () => {
    setIsCreating(true);
    try {
      if (!newLeadData.name || !newLeadData.email) {
        alert("Name and Email are necessary");
        return;
      }

      await addLead({
        name: newLeadData.name,
        email: newLeadData.email,
        company: newLeadData.company || '',
        message: newLeadData.message || 'Manual entry',
        status: 'new',
        origin: 'Manual',
        source: '',
        created_at: new Date().toISOString(),
        last_interaction: new Date().toISOString(),
        ai_analysis: {
          category: 'other',
          temperature: 'warm',
          summary: 'Added manually',
          recommendation: 'Check details'
        },
        history: [],
      } as any);

      setShowNewLeadModal(false);
      setNewLeadData({ name: '', email: '', message: '', company: '' });
    } catch (e) {
      console.error('[Sales] Lead creation error:', e);
      const message = e instanceof Error ? e.message : 'Error creating lead';
      alert(message);
    } finally {
      setIsCreating(false);
    }
  };

  const statusColors: Record<LeadStatus, string> = {
    new: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    contacted: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    following: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
    closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    lost: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  };

  const tempColors: Record<LeadTemperature, string> = {
    cold: 'text-blue-500',
    warm: 'text-amber-500',
    hot: 'text-red-500',
  };

  const renderNewLeadModal = () => (
    <NewLeadModal
      isOpen={showNewLeadModal}
      onClose={() => setShowNewLeadModal(false)}
      onSubmit={handleCreateLead}
      isCreating={isCreating}
      newLeadData={newLeadData}
      setNewLeadData={setNewLeadData}
    />
  );

  const renderLeadPanel = () => (
    <Suspense
      fallback={
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.06)' }} />
          <aside style={{
            position: 'relative', height: '100%', width: '100%', maxWidth: 560,
            background: 'var(--os-panel)',
            boxShadow: 'var(--shadow-slideover)',
          }}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="h-5 w-36 rounded bg-zinc-100/80 dark:bg-zinc-800/60 animate-pulse" />
                <div className="h-3.5 w-24 rounded bg-zinc-100/70 dark:bg-zinc-800/50 animate-pulse" />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-9 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 animate-pulse" />
                  ))}
                </div>
                <div className="h-24 rounded-lg bg-zinc-100/60 dark:bg-zinc-800/40 animate-pulse" />
              </div>
              <div style={{ marginTop: 'auto', padding: 20, background: 'var(--os-surface)' }}>
                <div className="h-9 w-28 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 animate-pulse" />
              </div>
            </div>
          </aside>
        </div>
      }
    >
      <LeadDetailPanelLazy
        lead={selectedLead}
        isOpen={!!selectedLead}
        isSaving={isSavingLead}
        onClose={() => setSelectedLeadId(null)}
        onSave={handleSaveLead}
        onAddComment={handleAddComment}
        onStatusChange={handleStatusChange}
        onConvert={(l) => handleConvertToProject(l)}
        onGenerateInvoice={(l) => {
          // Hop to Finance with the lead context — Finance reads
          // navParams.leadId + intent='new_invoice' to pre-seed an invoice
          // draft. Keeps the cross-page handoff explicit.
          window.dispatchEvent(new CustomEvent('app-navigate', {
            detail: { page: 'finance', params: { leadId: l.id, intent: 'new_invoice' } },
          }));
        }}
      />
    </Suspense>
  );

  if (view === 'analytics') {
    const defaultAnalytics = { totalVisits: 0, uniqueVisitors: 0, bounceRate: 0, conversions: 0, topPages: [], dailyVisits: [] };
    const data = analytics?.[0] || defaultAnalytics;

    return (
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 0 80px' }}>
        {renderNewLeadModal()}

        {/* Editorial header */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 24, marginBottom: 22, paddingBottom: 18,
          borderBottom: '0.5px solid var(--os-divider)',
        }}>
          <div>
            <h1 style={{
              fontSize: 'clamp(22px, 2.4vw, 30px)', fontWeight: 300,
              letterSpacing: '-0.03em', lineHeight: 1.05,
              color: 'var(--os-fg-0)', margin: 0,
            }}>
              Sales Analytics
            </h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              letterSpacing: '0.04em', color: 'var(--os-fg-2)',
            }}>
              Website performance · Conversion metrics
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Visits', value: data.totalVisits?.toLocaleString() || '0' },
            { label: 'Unique Visitors', value: data.uniqueVisitors?.toLocaleString() || '0' },
            { label: 'Bounce Rate', value: `${data.bounceRate}%` },
            { label: 'Conversions', value: String(data.conversions || 0) },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: '18px 20px', background: 'var(--os-panel)',
              border: '0.5px solid var(--os-border-2)', borderRadius: 14,
              boxShadow: 'var(--shadow-card)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: '0.2em', textTransform: 'uppercase' as const,
                color: 'var(--os-fg-2)', marginBottom: 10,
              }}>
                {stat.label}
              </div>
              <div style={{
                fontWeight: 300, fontSize: 30, lineHeight: 1,
                letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                color: 'var(--os-fg-0)',
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Top Pages card */}
        <div style={{
          padding: 24, background: 'var(--os-panel)',
          border: '0.5px solid var(--os-border-2)', borderRadius: 14,
          boxShadow: 'var(--shadow-card)',
        }}>
          <h2 style={{
            fontSize: 16, fontWeight: 500, letterSpacing: '-0.02em',
            color: 'var(--os-fg-0)', margin: '0 0 16px',
          }}>
            Top Pages
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.topPages?.map((page: any, idx: number) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--fg-2, var(--livv-wine-500))' }}>{page.path}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--os-fg-2)',
                }}>
                  {page.views?.toLocaleString()} views
                </span>
              </div>
            ))}
            {(!data.topPages || data.topPages.length === 0) && (
              <div style={{ color: 'var(--os-fg-2)', fontSize: 13 }}>No data available</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Use the local subView to decide which Sales surface to render.
  // 'analytics' was already returned above, so here view is 'crm' | 'inbox'.
  if (subView === 'pipeline') {
    return (
      <>
        {renderNewLeadModal()}
        {renderLeadPanel()}
        <div style={{ maxWidth: 1800, margin: '0 auto', padding: '16px 24px', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
          {/* Convert to Project Modal */}
          {showConvertModal && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(6px)', zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}>
              <div style={{
                background: 'var(--os-panel)', borderRadius: 'var(--radius-lg, 24px)',
                border: '0.5px solid var(--os-border-2)',
                boxShadow: 'var(--shadow-xl)', maxWidth: 440, width: '100%',
                maxHeight: '90vh', overflowY: 'auto',
              }}>
                <div style={{
                  padding: '20px 24px',
                  borderBottom: '0.5px solid var(--os-divider)',
                }}>
                  <h3 style={{
                    fontSize: 18, fontWeight: 300, letterSpacing: '-0.02em',
                    color: 'var(--os-fg-0)', margin: 0,
                  }}>
                    Convert Lead to Project
                  </h3>
                  <p style={{
                    fontSize: 12, color: 'var(--os-fg-2)', marginTop: 4,
                  }}>
                    Create a new project from this lead
                  </p>
                </div>
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9.5,
                      letterSpacing: '0.18em', textTransform: 'uppercase' as const,
                      color: 'var(--os-fg-2)', marginBottom: 8, fontWeight: 600,
                    }}>
                      Lead Details
                    </div>
                    <div style={{
                      padding: 16, background: 'var(--os-surface)',
                      borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      {[
                        ['Name', showConvertModal.name],
                        ...(showConvertModal.company ? [['Company', showConvertModal.company]] : []),
                        ['Email', showConvertModal.email],
                      ].map(([label, value]) => (
                        <div key={label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <span style={{ fontSize: 12, color: 'var(--os-fg-2)' }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    padding: 16, background: 'var(--accent-soft)',
                    borderRadius: 14, border: '0.5px solid var(--accent-strong)',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 999,
                      background: 'var(--accent-strong)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icons.Briefcase size={16} style={{ color: 'var(--livv-gold)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)' }}>
                        Project will be created
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--os-fg-2)', marginTop: 4 }}>
                        A new project titled "{showConvertModal.company || showConvertModal.name}" will be created.
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '14px 24px',
                  background: 'var(--os-surface)',
                  borderTop: '0.5px solid var(--os-divider)',
                  display: 'flex', justifyContent: 'flex-end', gap: 10,
                }}>
                  <button
                    onClick={() => setShowConvertModal(null)}
                    style={{
                      padding: '8px 16px', fontSize: 13, fontWeight: 500,
                      color: 'var(--os-fg-2)', background: 'transparent',
                      border: 0, cursor: 'pointer', borderRadius: 999,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConvertToProject(showConvertModal)}
                    disabled={isConverting}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 18px', background: 'var(--os-ink)',
                      color: 'var(--livv-cream-50, #FDFBF7)',
                      border: '0.5px solid var(--os-ink)',
                      borderRadius: 999, cursor: isConverting ? 'default' : 'pointer',
                      fontSize: 13, fontWeight: 500,
                      opacity: isConverting ? 0.5 : 1,
                    }}
                  >
                    {isConverting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Converting...
                      </>
                    ) : (
                      <>
                        <Icons.Briefcase size={14} />
                        Convert to Project
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Editorial header */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 24, marginBottom: 18, paddingBottom: 16,
            borderBottom: '0.5px solid var(--os-divider)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <div>
                <h1 style={{
                  fontSize: 'clamp(22px, 2.4vw, 30px)', fontWeight: 300,
                  letterSpacing: '-0.03em', lineHeight: 1.05,
                  color: 'var(--os-fg-0)', margin: 0,
                }}>
                  Sales Pipeline
                </h1>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  letterSpacing: '0.04em', color: 'var(--os-fg-2)',
                }}>
                  {filtered.length} leads
                  <span style={{ color: 'var(--os-fg-3)' }}>·</span>
                  {filtered.filter((l: any) => l.status === 'new').length} new
                </div>
              </div>
              <SubViewToggle subView={subView} onChange={setSubView} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Icons.Search size={12} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--os-fg-3)',
                }} strokeWidth={2} />
                <input
                  type="text"
                  placeholder="Search leads"
                  style={{
                    paddingLeft: 28, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                    fontSize: 12, background: 'var(--os-panel)',
                    border: '0.5px solid var(--os-border-2)',
                    borderRadius: 999, outline: 'none', width: 160,
                    color: 'var(--os-fg-0)',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>

              <select
                value={category}
                onChange={e => setCategory(e.target.value as LeadCategory | 'all')}
                style={{
                  padding: '7px 12px', fontSize: 12,
                  border: '0.5px solid var(--os-border-2)',
                  borderRadius: 999, background: 'var(--os-panel)',
                  color: 'var(--os-fg-0)', outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All categories</option>
                {(['branding', 'web-design', 'ecommerce', 'saas', 'creators', 'other'] as LeadCategory[]).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={temperature}
                onChange={e => setTemperature(e.target.value as LeadTemperature | 'all')}
                style={{
                  padding: '7px 12px', fontSize: 12,
                  border: '0.5px solid var(--os-border-2)',
                  borderRadius: 999, background: 'var(--os-panel)',
                  color: 'var(--os-fg-0)', outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All temperatures</option>
                {(['cold', 'warm', 'hot'] as LeadTemperature[]).map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <button
                onClick={() => setShowNewLeadModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: 'var(--os-ink)',
                  color: 'var(--livv-cream-50, #FDFBF7)',
                  border: '0.5px solid var(--os-ink)',
                  borderRadius: 999, cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <Icons.Plus size={12} strokeWidth={2.5} />
                New Lead
              </button>
            </div>
          </div>

          {/* Kanban Board */}
          <div className="flex-1 min-h-0">
            {leadsError && (
              <div style={{
                marginBottom: 16, borderRadius: 14,
                border: '0.5px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.06)',
                color: '#b91c1c', padding: '12px 16px', fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{leadsError}</span>
                <button
                  onClick={() => refreshLeads()}
                  style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                    borderRadius: 999, background: '#b91c1c', color: '#fff',
                    border: 0, cursor: 'pointer',
                  }}
                >
                  Reintentar
                </button>
              </div>
            )}
            {leadsLoading && (
              <div style={{
                marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, color: 'var(--os-fg-3)',
              }}>
                <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
                Loading leads...
              </div>
            )}
            <CRMBoard
              leads={filtered}
              onStatusChange={handleStatusChange}
              onConvert={lead => setShowConvertModal(lead)}
              onLeadClick={(lead) => setSelectedLeadId(lead.id)}
              onDelete={handleDeleteLead}
              convertingId={convertingLeadId}
            />
          </div>
        </div>
      </>
    );
  }

  if (subView === 'inbox') {
    const newLeads = normalizedLeads.filter((l: any) => l.status === 'new');
    return (
      <>
        {renderNewLeadModal()}
        {renderLeadPanel()}
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 0 80px' }}>
          {/* Editorial header */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 24, marginBottom: 22, paddingBottom: 18,
            borderBottom: '0.5px solid var(--os-divider)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <div>
                <h1 style={{
                  fontSize: 'clamp(22px, 2.4vw, 30px)', fontWeight: 300,
                  letterSpacing: '-0.03em', lineHeight: 1.05,
                  color: 'var(--os-fg-0)', margin: 0,
                }}>
                  Leads Inbox
                </h1>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  letterSpacing: '0.04em', color: 'var(--os-fg-2)',
                }}>
                  {newLeads.length} new leads to review
                </div>
              </div>
              <SubViewToggle subView={subView} onChange={setSubView} />
            </div>
            <button
              onClick={() => setShowNewLeadModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', background: 'var(--os-ink)',
                color: 'var(--livv-cream-50, #FDFBF7)',
                border: '0.5px solid var(--os-ink)',
                borderRadius: 999, cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
              }}
            >
              <Icons.Plus size={14} />
              New Lead
            </button>
          </div>

          {/* Table card */}
          <div style={{
            background: 'var(--os-panel)',
            border: '0.5px solid var(--os-border-2)',
            borderRadius: 14, overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
          }}>
            <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  background: 'var(--os-surface)',
                  fontSize: 10.5, fontWeight: 500,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--os-fg-2)',
                }}>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>Name</th>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>Email</th>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>Company</th>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>AI Analysis</th>
                  <th style={{ padding: '10px 20px', fontWeight: 500 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {newLeads.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '0.5px solid var(--os-divider)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--os-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--os-fg-0)' }}>{lead.name}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--fg-2, var(--livv-wine-500))' }}>{lead.email}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--fg-2, var(--livv-wine-500))' }}>{lead.company || '-'}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {new Date(lead.created_at || '').toLocaleDateString()}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {lead.aiAnalysis?.temperature && (
                        <span style={{
                          padding: '3px 10px', borderRadius: 999,
                          fontSize: 10, fontWeight: 600,
                          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                          background: lead.aiAnalysis.temperature === 'hot'
                            ? 'rgba(239,68,68,0.1)' : lead.aiAnalysis.temperature === 'warm'
                              ? 'rgba(196,163,90,0.13)' : 'rgba(109,190,220,0.12)',
                          color: lead.aiAnalysis.temperature === 'hot'
                            ? '#b91c1c' : lead.aiAnalysis.temperature === 'warm'
                              ? 'var(--livv-gold)' : 'var(--livv-sky)',
                        }}>
                          {lead.aiAnalysis.temperature}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStatusChange(lead.id, 'contacted');
                        }}
                        style={{
                          padding: '4px 12px', fontSize: 11, fontWeight: 500,
                          borderRadius: 999,
                          border: '0.5px solid var(--os-border-2)',
                          background: 'var(--os-panel)',
                          color: 'var(--os-fg-0)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Mark Contacted
                      </button>
                    </td>
                  </tr>
                ))}
                {newLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{
                      padding: '48px 24px', textAlign: 'center',
                      color: 'var(--os-fg-2)', fontSize: 13,
                    }}>
                      No new leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  // Fallback
  return <div>Select a view</div>;
};
