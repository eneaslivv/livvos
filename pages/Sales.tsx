import React, { Suspense, useMemo, useState } from 'react';
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

export const Sales: React.FC<SalesProps> = ({ view, onNavigate }) => {
  const leadsEnabled = view !== 'analytics';
  const analyticsEnabled = view === 'analytics';
  const leadsSelect = 'id,name,email,company,message,status,created_at,last_interaction,ai_analysis,history,origin,source,category,temperature';
  const { data: leads, loading: leadsLoading, error: leadsError, add: addLead, update: updateLead, refresh: refreshLeads } = useSupabase<Lead>('leads', {
    enabled: leadsEnabled,
    subscribe: leadsEnabled,
    select: leadsSelect,
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

      const leadId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await addLead({
        id: leadId,
        name: newLeadData.name,
        email: newLeadData.email,
        company: newLeadData.company,
        message: newLeadData.message || 'Manual entry',
        status: 'new',
        origin: 'Manual',
        created_at: new Date().toISOString(),
        ai_analysis: {
          category: 'other',
          temperature: 'warm',
          summary: 'Added manually',
          recommendation: 'Check details'
        }
      } as any);

      setShowNewLeadModal(false);
      setNewLeadData({ name: '', email: '', message: '', company: '' });
    } catch (e) {
      console.error(e);
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
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          <div className="absolute inset-0 bg-zinc-950/8" />
          <aside className="relative h-full w-full max-w-xl bg-white dark:bg-zinc-950 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <div className="h-full flex flex-col">
              <div className="p-6 space-y-5">
                <div className="h-5 w-36 rounded bg-zinc-100/80 dark:bg-zinc-800/60 animate-pulse" />
                <div className="h-3.5 w-24 rounded bg-zinc-100/70 dark:bg-zinc-800/50 animate-pulse" />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-9 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 animate-pulse" />
                  ))}
                </div>
                <div className="h-24 rounded-lg bg-zinc-100/60 dark:bg-zinc-800/40 animate-pulse" />
              </div>
              <div className="mt-auto p-5 bg-zinc-50/50 dark:bg-zinc-950/60">
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
      />
    </Suspense>
  );

  if (view === 'analytics') {
    const defaultAnalytics = { totalVisits: 0, uniqueVisitors: 0, bounceRate: 0, conversions: 0, topPages: [], dailyVisits: [] };
    const data = analytics?.[0] || defaultAnalytics;

    return (
      <div className="max-w-6xl mx-auto p-6">
        {renderNewLeadModal()}
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">Sales Analytics</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Visits</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data.totalVisits?.toLocaleString() || 0}</div>
          </div>
          <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Unique Visitors</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data.uniqueVisitors?.toLocaleString() || 0}</div>
          </div>
          <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Bounce Rate</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data.bounceRate}%</div>
          </div>
          <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Conversions</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data.conversions}</div>
          </div>
        </div>
        <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Top Pages</h2>
          <div className="space-y-2">
            {data.topPages?.map((page: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{page.path}</span>
                <span className="text-zinc-500">{page.views?.toLocaleString()} views</span>
              </div>
            ))}
            {(!data.topPages || data.topPages.length === 0) && (
              <div className="text-zinc-500 text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'crm') {
    return (
      <>
        {renderNewLeadModal()}
        {renderLeadPanel()}
        <div className="max-w-[1800px] mx-auto px-6 py-4 h-[calc(100vh-80px)] flex flex-col">
          {/* Convert to Project Modal */}
          {showConvertModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 font-serif">Convert Lead to Project</h3>
                <p className="text-sm text-zinc-500 mt-1">Create a new project from this lead</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Lead Details</div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-sm">Name</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{showConvertModal.name}</span>
                    </div>
                    {showConvertModal.company && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 text-sm">Company</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{showConvertModal.company}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-sm">Email</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{showConvertModal.email}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                      <Icons.Briefcase size={16} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                        Project will be created
                      </div>
                      <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                        A new project titled "{showConvertModal.company || showConvertModal.name}" will be created.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  onClick={() => setShowConvertModal(null)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConvertToProject(showConvertModal)}
                  disabled={isConverting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isConverting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Icons.Briefcase size={16} />
                      Convert to Project
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Header & Filters */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <h1 className="text-3xl font-light text-zinc-900 dark:text-zinc-100 font-serif">
                Sales Pipeline
              </h1>
              <p className="text-zinc-500 text-sm mt-1">Manage and track your leads.</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Search - Visual only for now */}
              <div className="relative group">
                <Icons.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-600 transition-colors" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  className="pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 w-48 transition-all"
                />
              </div>

              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

              <select
                value={category}
                onChange={e => setCategory(e.target.value as LeadCategory | 'all')}
                className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 outline-none hover:border-zinc-300 transition-colors"
              >
                <option value="all">All Categories</option>
                {(['branding', 'web-design', 'ecommerce', 'saas', 'creators', 'other'] as LeadCategory[]).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={temperature}
                onChange={e => setTemperature(e.target.value as LeadTemperature | 'all')}
                className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 outline-none hover:border-zinc-300 transition-colors"
              >
                <option value="all">All Temperatures</option>
                {(['cold', 'warm', 'hot'] as LeadTemperature[]).map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <button
                onClick={() => setShowNewLeadModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:opacity-90 transition-opacity ml-2"
              >
                <Icons.Plus size={16} />
                New Lead
              </button>
            </div>
          </div>

          {/* Kanban Board */}
          <div className="flex-1 min-h-0">
            {leadsError && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm flex items-center justify-between">
                <span>{leadsError}</span>
                <button
                  onClick={() => refreshLeads()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white"
                >
                  Reintentar
                </button>
              </div>
            )}
            {leadsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 h-full animate-pulse">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="w-full h-full min-h-[360px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40" />
                ))}
              </div>
            ) : (
              <CRMBoard
                leads={filtered}
                onStatusChange={handleStatusChange}
                onConvert={lead => setShowConvertModal(lead)}
                onLeadClick={(lead) => setSelectedLeadId(lead.id)}
                convertingId={convertingLeadId}
              />
            )}
          </div>
        </div>
      </>
    );
  }

  if (view === 'inbox') {
    const newLeads = normalizedLeads.filter((l: any) => l.status === 'new');
    return (
      <>
      {renderNewLeadModal()}
      {renderLeadPanel()}
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Inbox</h1>
              <p className="text-zinc-500">You have {newLeads.length} new leads to review.</p>
            </div>
            <button
              onClick={() => setShowNewLeadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium"
            >
              <Icons.Plus size={16} />
              New Lead
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 font-medium">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Company</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">AI Analysis</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {newLeads.map(lead => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100">{lead.name}</td>
                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{lead.email}</td>
                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{lead.company || '-'}</td>
                    <td className="px-6 py-4 text-zinc-500">{new Date(lead.created_at || '').toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      {lead.aiAnalysis?.temperature && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${lead.aiAnalysis.temperature === 'hot' ? 'bg-red-100 text-red-700' :
                            lead.aiAnalysis.temperature === 'warm' ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                          }`}>
                          {lead.aiAnalysis.temperature}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStatusChange(lead.id, 'contacted');
                        }}
                        className="text-indigo-600 hover:text-indigo-700 text-xs font-medium border border-indigo-200 rounded px-2 py-1"
                      >
                        Mark Contacted
                      </button>
                    </td>
                  </tr>
                ))}
                {newLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
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
