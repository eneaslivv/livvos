import React, { useState } from 'react';
import { Icons } from '../components/ui/Icons';
import { Lead, WebAnalytics } from '../types';
import { useSupabase } from '../hooks/useSupabase';
import { useLeadToProject } from '../hooks/useLeadToProject';
import { CRMBoard } from '../components/crm/CRMBoard';

type LeadStatus = 'new' | 'contacted' | 'following' | 'closed' | 'lost';
type LeadTemperature = 'cold' | 'warm' | 'hot';
type LeadCategory = 'branding' | 'web-design' | 'ecommerce' | 'saas' | 'creators' | 'other';

interface SalesProps {
  view: 'crm' | 'inbox' | 'analytics';
  onNavigate?: (page: string) => void;
}

export const Sales: React.FC<SalesProps> = ({ view, onNavigate }) => {
  const { data: leads, add: addLead, update: updateLead } = useSupabase<Lead>('leads');
  const { data: analytics } = useSupabase<WebAnalytics>('web_analytics');
  const { convertLeadToProject, isConverting } = useLeadToProject();

  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [category, setCategory] = useState<LeadCategory | 'all'>('all');
  const [temperature, setTemperature] = useState<LeadTemperature | 'all'>('all');
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [showConvertModal, setShowConvertModal] = useState<Lead | null>(null);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [newLeadData, setNewLeadData] = useState({ name: '', email: '', message: '', company: '' });
  const [isCreating, setIsCreating] = useState(false);

  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.status !== filter) return false;
    if (category !== 'all' && l.aiAnalysis?.category !== category) return false;
    if (temperature !== 'all' && l.aiAnalysis?.temperature !== temperature) return false;
    return true;
  });

  const handleStatusChange = (id: string, newStatus: LeadStatus) => {
    updateLead(id, { status: newStatus });
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
      alert('Error creating lead');
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

  if (view === 'analytics') {
    const defaultAnalytics = { totalVisits: 0, uniqueVisitors: 0, bounceRate: 0, conversions: 0, topPages: [], dailyVisits: [] };
    const data = analytics?.[0] || defaultAnalytics;

    return (
      <div className="max-w-6xl mx-auto p-6">
        {/* ... existing analytics UI ... same as before but now data is safe */}
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
      <div className="max-w-[1800px] mx-auto px-6 py-4 h-[calc(100vh-80px)] flex flex-col">
        {/* New Lead Modal */}
        {showNewLeadModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 font-serif">Add New Lead</h3>
                <p className="text-sm text-zinc-500 mt-1">Enter lead details manually</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Full Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-indigo-500 transition-colors"
                      placeholder="e.g. John Doe"
                      value={newLeadData.name}
                      onChange={e => setNewLeadData({ ...newLeadData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Email</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-indigo-500 transition-colors"
                      placeholder="john@example.com"
                      value={newLeadData.email}
                      onChange={e => setNewLeadData({ ...newLeadData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Company (Optional)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Acme Inc."
                      value={newLeadData.company}
                      onChange={e => setNewLeadData({ ...newLeadData, company: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Message / Note</label>
                    <textarea
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-indigo-500 transition-colors resize-none h-24"
                      placeholder="Any details..."
                      value={newLeadData.message}
                      onChange={e => setNewLeadData({ ...newLeadData, message: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  onClick={() => setShowNewLeadModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateLead}
                  disabled={isCreating}
                  className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreating ? <Icons.Loader size={16} className="animate-spin" /> : <Icons.Plus size={16} />}
                  <span>Create Lead</span>
                </button>
              </div>
            </div>
          </div>
        )}

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
          <CRMBoard
            leads={filtered}
            onStatusChange={handleStatusChange}
            onConvert={lead => setShowConvertModal(lead)}
            convertingId={convertingLeadId}
          />
        </div>
      </div>
    );
  }

  if (view === 'inbox') {
    const newLeads = leads.filter(l => l.status === 'new');
    return (
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

        {showNewLeadModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 font-serif">Add New Lead</h3>
                <p className="text-sm text-zinc-500 mt-1">Enter lead details manually</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase block mb-1">Full Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:border-indigo-500 outline-none"
                      value={newLeadData.name}
                      onChange={e => setNewLeadData({ ...newLeadData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase block mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:border-indigo-500 outline-none"
                      value={newLeadData.email}
                      onChange={e => setNewLeadData({ ...newLeadData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase block mb-1">Company</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:border-indigo-500 outline-none"
                      value={newLeadData.company}
                      onChange={e => setNewLeadData({ ...newLeadData, company: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase block mb-1">Message</label>
                    <textarea
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:border-indigo-500 outline-none resize-none h-24"
                      value={newLeadData.message}
                      onChange={e => setNewLeadData({ ...newLeadData, message: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end gap-3">
                <button onClick={() => setShowNewLeadModal(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900">Cancel</button>
                <button onClick={handleCreateLead} disabled={isCreating} className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg disabled:opacity-50">
                  {isCreating ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </div>
          </div>
        )}

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
                <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
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
                      onClick={() => updateLead(lead.id, { status: 'contacted' })}
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
    );
  }

  // Fallback
  return <div>Select a view</div>;
};