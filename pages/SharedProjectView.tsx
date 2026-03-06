import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';
import PortalApp from '../components/portal/livv-client view-control/App';
import type { DashboardData, Milestone, PortalTask, LogEntry, PaymentEntry, CredentialItem, AssetItem } from '../components/portal/livv-client view-control/types';

/* ── Interfaces ── */
interface SharedTask {
  id: string; title: string; description?: string;
  completed: boolean; status: string; priority: string;
  due_date?: string; start_date?: string; parent_task_id?: string;
  group_name?: string; completed_at?: string;
}
interface SharedFile { id: string; name: string; type?: string; size?: number; url: string; created_at: string; }
interface SharedTeamMember { name: string; email: string; avatar_url?: string; }
interface SharedComment {
  id: string; entity_type: string; entity_id?: string;
  content: string; author_name: string; is_external: boolean;
  parent_id?: string; created_at: string;
}
interface SharedDeliverable {
  id: string; task_id?: string; title: string; description?: string;
  status: string; reviewed_by?: string; reviewed_at?: string;
  review_comment?: string; created_at: string;
}
interface SharedIncome {
  id: string; concept?: string; total_amount?: number; status?: string; due_date?: string;
  installments?: { id: string; number?: number; amount?: number; due_date?: string; paid_date?: string; status?: string }[];
}
interface SharedActivity { id: string; action?: string; created_at?: string; }
interface SharedCredential { id: string; service: string; username?: string; secret?: string; }
interface SharedClientDoc { id: string; name: string; doc_type?: string; url?: string; size_label?: string; }

interface SharedProjectData {
  project: {
    id: string; title: string; description?: string; status: string;
    created_at: string; updated_at: string;
    client_id?: string; client_name?: string; client_company?: string;
  };
  share_role: string;
  tasks: SharedTask[];
  files: SharedFile[];
  team: SharedTeamMember[];
  shares: { email: string; role: string; status: string }[];
  comments: SharedComment[];
  deliverables: SharedDeliverable[];
  incomes?: SharedIncome[];
  activity?: SharedActivity[];
  credentials?: SharedCredential[];
  client_documents?: SharedClientDoc[];
}

const deliverableStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700', revision_requested: 'bg-purple-100 text-purple-700',
};

interface SharedProjectViewProps {
  projectId: string;
  onClose?: () => void;
}

/* ── Transform RPC data → DashboardData ── */
function transformToDashboardData(data: SharedProjectData, shareRole: string): DashboardData {
  const { project, tasks, files, incomes, activity, credentials, client_documents } = data;

  // Progress
  const totalTasks = tasks.length || 1;
  const completedTasks = tasks.filter(t => t.completed).length;
  const progress = Math.min(100, Math.round((completedTasks / totalTasks) * 100));

  // Dates
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return 'TBD'; }
  };
  const startDate = project.created_at ? fmtDate(project.created_at) : 'TBD';
  const dueDates = tasks.map(t => t.due_date || t.start_date).filter(Boolean) as string[];
  const etaRaw = dueDates.length ? dueDates.sort().slice(-1)[0] : null;
  const etaDate = etaRaw ? fmtDate(etaRaw) : 'TBD';

  // Milestones from task groups
  const mainTasks = tasks.filter(t => !t.parent_task_id);
  const groupMap = new Map<string, SharedTask[]>();
  for (const t of mainTasks) {
    const key = t.group_name || 'General';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  let foundCurrent = false;
  const milestones: Milestone[] = Array.from(groupMap.entries()).map(([name, groupTasks], idx) => {
    const done = groupTasks.filter(t => t.completed).length;
    const total = groupTasks.length;
    const allDone = total > 0 && done === total;

    let status: 'completed' | 'current' | 'future';
    if (allDone) {
      status = 'completed';
    } else if (!foundCurrent) {
      status = 'current';
      foundCurrent = true;
    } else {
      status = 'future';
    }

    return {
      id: `phase-${idx}`,
      title: name,
      description: `${done}/${total} tasks completed`,
      status,
    };
  });

  // Portal tasks
  const portalTasks: PortalTask[] = mainTasks.map(t => ({
    id: t.id,
    title: t.title,
    completed: t.completed,
    completedAt: t.completed_at || undefined,
    startDate: t.start_date || undefined,
    dueDate: t.due_date || undefined,
    groupName: t.group_name || 'General',
    status: t.status || undefined,
    priority: t.priority || undefined,
  }));

  // Activity logs
  const logs: LogEntry[] = (activity || []).slice(0, 8).map((a, idx) => ({
    id: a.id || `log-${idx}`,
    timestamp: a.created_at
      ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Recent',
    message: a.action || 'Project update',
  }));
  if (logs.length === 0) {
    logs.push({ id: 'default', timestamp: 'Now', message: 'Portal connected' });
  }

  // Budget from incomes
  const payments: PaymentEntry[] = [];
  let totalFromIncomes = 0;
  let paidFromInstallments = 0;
  for (const inc of (incomes || [])) {
    const installments = inc.installments || [];
    if (installments.length > 0) {
      for (const inst of installments) {
        const isPaid = inst.status === 'paid';
        if (isPaid) paidFromInstallments += Number(inst.amount || 0);
        payments.push({
          id: inst.id,
          concept: `${inc.concept || 'Payment'} — #${inst.number || 1}`,
          amount: Number(inst.amount || 0),
          dueDate: inst.due_date || inc.due_date || '',
          paidDate: inst.paid_date || undefined,
          status: (inst.status === 'paid' ? 'paid' : inst.status === 'overdue' ? 'overdue' : 'pending') as PaymentEntry['status'],
          number: inst.number || 1,
        });
      }
    } else {
      const isPaid = inc.status === 'paid';
      if (isPaid) paidFromInstallments += Number(inc.total_amount || 0);
      payments.push({
        id: inc.id,
        concept: inc.concept || 'Payment',
        amount: Number(inc.total_amount || 0),
        dueDate: inc.due_date || '',
        status: (inc.status === 'paid' ? 'paid' : inc.status === 'overdue' ? 'overdue' : 'pending') as PaymentEntry['status'],
      });
    }
    totalFromIncomes += Number(inc.total_amount || 0);
  }
  payments.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const nextPending = payments.find(p => p.status !== 'paid');

  // Assets (files + client_documents)
  const fileAssets: AssetItem[] = (files || []).map(f => ({
    id: f.id,
    name: f.name,
    type: f.type || 'File',
    size: f.size ? `${Math.round(f.size / 1024)} KB` : '--',
    url: f.url || undefined,
  }));
  const docAssets: AssetItem[] = (client_documents || []).map(d => ({
    id: d.id,
    name: d.name,
    type: d.doc_type || 'Document',
    size: d.size_label || '--',
    url: d.url || undefined,
  }));

  // Credentials (only for collaborator/editor)
  const credentialItems: CredentialItem[] = shareRole !== 'viewer'
    ? (credentials || []).map(c => ({
        id: c.id,
        service: c.service,
        user: c.username || undefined,
        pass: c.secret || undefined,
      }))
    : [];

  return {
    progress,
    startDate,
    etaDate,
    onTrack: project.status === 'active' || project.status === 'review',
    budget: {
      total: totalFromIncomes,
      paid: paidFromInstallments,
      nextPayment: nextPending ? { amount: nextPending.amount, dueDate: nextPending.dueDate, concept: nextPending.concept } : undefined,
      payments,
    },
    milestones: milestones.length ? milestones : [{ id: 'default', title: 'Project', description: 'Initial setup', status: 'current' as const }],
    logs,
    credentials: credentialItems,
    assets: [...fileAssets, ...docAssets],
    tasks: portalTasks,
  };
}

export const SharedProjectView: React.FC<SharedProjectViewProps> = ({ projectId }) => {
  const [data, setData] = useState<SharedProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentEntity, setCommentEntity] = useState<{ type: string; id?: string }>({ type: 'project' });
  const [submittingComment, setSubmittingComment] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('get_shared_project', { p_project_id: projectId });
      if (rpcErr) throw rpcErr;
      if (!result) {
        setError('You do not have access to this project or it does not exist.');
        return;
      }
      setData(result as SharedProjectData);
    } catch (err: any) {
      setError(err.message || 'Error loading project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const { data: result, error: err } = await supabase.rpc('submit_project_comment', {
        p_project_id: projectId,
        p_entity_type: commentEntity.type,
        p_content: newComment.trim(),
        p_entity_id: commentEntity.id || null,
      });
      if (err) throw err;
      if (result?.error) throw new Error(result.error);
      setNewComment('');
      setCommentEntity({ type: 'project' });
      await loadData();
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Error commenting:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReview = async (deliverableId: string, status: string) => {
    try {
      const { data: result, error: err } = await supabase.rpc('review_deliverable', {
        p_deliverable_id: deliverableId,
        p_status: status,
        p_comment: reviewComment || null,
      });
      if (err) throw err;
      if (result?.error) throw new Error(result.error);
      setReviewingId(null);
      setReviewComment('');
      await loadData();
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Error reviewing:', err);
    }
  };

  // Dashboard data
  const dashboardData = useMemo(() => data ? transformToDashboardData(data, data.share_role) : null, [data]);

  const hiddenResourceTabs = useMemo(() => {
    if (!dashboardData) return [];
    const hidden: ('finance' | 'access' | 'docs')[] = [];
    if (dashboardData.budget.total === 0 && (!dashboardData.budget.payments || dashboardData.budget.payments.length === 0)) {
      hidden.push('finance');
    }
    if (!dashboardData.credentials || dashboardData.credentials.length === 0) {
      hidden.push('access');
    }
    if (!dashboardData.assets || dashboardData.assets.length === 0) {
      hidden.push('docs');
    }
    return hidden;
  }, [dashboardData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-8 h-8 border-2 border-zinc-300 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data || !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No access</h2>
          <p className="text-sm text-zinc-500 mb-6">{error || 'No data found.'}</p>
          <button onClick={handleLogout} className="text-sm text-emerald-600 hover:underline">Sign out</button>
        </div>
      </div>
    );
  }

  const { project, share_role, comments, deliverables } = data;
  const canInteract = share_role === 'collaborator' || share_role === 'editor';

  const roleBadge = (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
      share_role === 'editor' ? 'bg-emerald-100 text-emerald-700' :
      share_role === 'collaborator' ? 'bg-blue-100 text-blue-700' :
      'bg-zinc-100 text-zinc-500'
    }`}>
      {share_role === 'editor' ? 'Editor' : share_role === 'collaborator' ? 'Collaborator' : 'Viewer'}
    </span>
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Portal Dashboard */}
      <PortalApp
        initialData={dashboardData}
        projectTitle={project.title}
        projectSubtitle={
          [project.client_company || project.client_name, project.status]
            .filter(Boolean)
            .join(' — ')
        }
        forceOnboarded
        disableLoading
        hideCreatorToggle
        onLogout={handleLogout}
        hiddenResourceTabs={hiddenResourceTabs}
        roleBadge={roleBadge}
        hideSupport={!project.client_id}
      />

      {/* Comments Section (below portal) */}
      {(comments.length > 0 || canInteract) && (
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 pb-6">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <Icons.Message size={14} />
            Comments
            {comments.length > 0 && <span className="text-zinc-400 font-normal">({comments.length})</span>}
          </h3>
          <div className="bg-white rounded-2xl border border-zinc-200/60 divide-y divide-zinc-100 overflow-hidden">
            {comments.filter(c => !c.parent_id).map(c => {
              const replies = comments.filter(r => r.parent_id === c.id);
              return (
                <div key={c.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                      c.is_external ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {c.author_name[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-zinc-900">{c.author_name}</span>
                        {c.is_external && <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">External</span>}
                        <span className="text-[10px] text-zinc-400">{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-zinc-700">{c.content}</p>
                      {replies.map(r => (
                        <div key={r.id} className="mt-2 ml-4 pl-3 border-l-2 border-zinc-200">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-zinc-700">{r.author_name}</span>
                            <span className="text-[10px] text-zinc-400">{new Date(r.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-zinc-600">{r.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {comments.length === 0 && (
              <div className="p-6 text-center text-sm text-zinc-400">No comments yet</div>
            )}
          </div>

          {/* New comment input */}
          {canInteract && (
            <div className="mt-3 bg-white rounded-2xl border border-zinc-200/60 p-4">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-zinc-400">
                  Commenting on: {commentEntity.type === 'project' ? 'General project' : commentEntity.type}
                </span>
                <button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                >
                  {submittingComment ? 'Sending...' : 'Send comment'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deliverables Section (below portal) */}
      {deliverables.length > 0 && (
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 pb-10">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <Icons.File size={14} />
            Deliverables
            <span className="text-zinc-400 font-normal">({deliverables.length})</span>
          </h3>
          <div className="space-y-3">
            {deliverables.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-zinc-200/60 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900">{d.title}</h4>
                    {d.description && <p className="text-xs text-zinc-500 mt-0.5">{d.description}</p>}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${deliverableStatusColors[d.status] || 'bg-zinc-100 text-zinc-500'}`}>
                    {d.status === 'pending' ? 'Pending' : d.status === 'approved' ? 'Approved' :
                     d.status === 'rejected' ? 'Rejected' : 'Revision requested'}
                  </span>
                </div>

                {d.review_comment && (
                  <div className="mt-2 p-2 bg-zinc-50 rounded-lg text-xs text-zinc-600">
                    <span className="font-medium">Review comment:</span> {d.review_comment}
                  </div>
                )}

                {canInteract && d.status === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    {reviewingId === d.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          placeholder="Review comment (optional)..."
                          rows={2}
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs resize-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleReview(d.id, 'approved')}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
                            Approve
                          </button>
                          <button onClick={() => handleReview(d.id, 'revision_requested')}
                            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">
                            Request revision
                          </button>
                          <button onClick={() => handleReview(d.id, 'rejected')}
                            className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">
                            Reject
                          </button>
                          <button onClick={() => { setReviewingId(null); setReviewComment(''); }}
                            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReviewingId(d.id)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        Review deliverable
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
