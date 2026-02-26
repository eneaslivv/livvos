import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';

interface SharedTask {
  id: string; title: string; description?: string;
  completed: boolean; status: string; priority: string;
  due_date?: string; start_date?: string; parent_task_id?: string;
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
interface SharedProjectData {
  project: {
    id: string; title: string; description?: string; status: string;
    created_at: string; updated_at: string;
    client_name?: string; client_company?: string;
  };
  share_role: string;
  tasks: SharedTask[];
  files: SharedFile[];
  team: SharedTeamMember[];
  shares: { email: string; role: string; status: string }[];
  comments: SharedComment[];
  deliverables: SharedDeliverable[];
}

type Tab = 'overview' | 'tasks' | 'files' | 'comments' | 'deliverables';

interface SharedProjectViewProps {
  projectId: string;
  onClose?: () => void;
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', completed: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700', review: 'bg-purple-100 text-purple-700',
  archived: 'bg-zinc-100 text-zinc-500',
};
const priorityColors: Record<string, string> = {
  urgent: 'text-red-500', high: 'text-orange-500', medium: 'text-yellow-500', low: 'text-zinc-400',
};
const deliverableStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700', revision_requested: 'bg-purple-100 text-purple-700',
};

export const SharedProjectView: React.FC<SharedProjectViewProps> = ({ projectId, onClose }) => {
  const [data, setData] = useState<SharedProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
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
        setError('No tenés acceso a este proyecto o no existe.');
        return;
      }
      setData(result as SharedProjectData);
    } catch (err: any) {
      setError(err.message || 'Error cargando proyecto');
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
      alert('Error al comentar: ' + (err.message || 'Error'));
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
      alert('Error: ' + (err.message || 'Error'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-8 h-8 border-2 border-zinc-300 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Sin acceso</h2>
          <p className="text-sm text-zinc-500 mb-6">{error || 'No se encontraron datos.'}</p>
          <button onClick={handleLogout} className="text-sm text-emerald-600 hover:underline">Cerrar sesión</button>
        </div>
      </div>
    );
  }

  const { project, share_role, tasks, files, team, comments, deliverables } = data;
  const canInteract = share_role === 'collaborator' || share_role === 'editor';
  const mainTasks = tasks.filter(t => !t.parent_task_id);
  const completedCount = tasks.filter(t => t.completed).length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Resumen' },
    { id: 'tasks', label: 'Tareas', count: mainTasks.length },
    { id: 'files', label: 'Archivos', count: files.length },
    { id: 'comments', label: 'Comentarios', count: comments.length },
    { id: 'deliverables', label: 'Entregables', count: deliverables.length },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-light tracking-wider text-zinc-900 dark:text-zinc-100" style={{ fontFamily: 'serif' }}>
              livv<span className="text-emerald-500">~</span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="text-sm text-zinc-500">Proyecto compartido</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
              share_role === 'editor' ? 'bg-emerald-100 text-emerald-700' :
              share_role === 'collaborator' ? 'bg-blue-100 text-blue-700' :
              'bg-zinc-100 text-zinc-500'
            }`}>
              {share_role === 'editor' ? 'Editor' : share_role === 'collaborator' ? 'Colaborador' : 'Visualización'}
            </span>
            <button onClick={handleLogout} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Project Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{project.title}</h1>
              {project.client_name && (
                <p className="text-sm text-zinc-500">{project.client_company || project.client_name}</p>
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[project.status] || 'bg-zinc-100 text-zinc-500'}`}>
              {project.status}
            </span>
          </div>
          {project.description && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{project.description}</p>
          )}
          {/* Progress bar */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-zinc-500">{progress}%</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1.5 text-zinc-400">({tab.count})</span>}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 mb-1">Tareas completadas</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{completedCount}/{tasks.length}</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 mb-1">Archivos</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{files.length}</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 mb-1">Equipo</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{team.length}</div>
            </div>

            {/* Team members */}
            {team.length > 0 && (
              <div className="md:col-span-3 bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Equipo</h3>
                <div className="flex flex-wrap gap-3">
                  {team.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        {(m.name || m.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{m.name || m.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent tasks */}
            <div className="md:col-span-3 bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Tareas recientes</h3>
              <div className="space-y-2">
                {mainTasks.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      t.completed ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {t.completed && <Icons.Check size={10} className="text-white" />}
                    </div>
                    <span className={`text-sm flex-1 ${t.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {t.title}
                    </span>
                    <span className={`text-xs ${priorityColors[t.priority] || 'text-zinc-400'}`}>{t.priority}</span>
                  </div>
                ))}
                {mainTasks.length === 0 && <p className="text-xs text-zinc-400">Sin tareas</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {mainTasks.map(t => {
              const subtasks = tasks.filter(s => s.parent_task_id === t.id);
              return (
                <div key={t.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      t.completed ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {t.completed && <Icons.Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${t.completed ? 'text-zinc-400 line-through' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        {t.title}
                      </div>
                      {t.description && <p className="text-xs text-zinc-400 mt-0.5 truncate">{t.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold uppercase ${priorityColors[t.priority] || ''}`}>{t.priority}</span>
                      {t.due_date && (
                        <span className="text-[10px] text-zinc-400">{new Date(t.due_date).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {subtasks.length > 0 && (
                    <div className="ml-8 mt-2 space-y-1.5">
                      {subtasks.map(s => (
                        <div key={s.id} className="flex items-center gap-2">
                          <div className={`w-3.5 h-3.5 rounded-full border ${s.completed ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300'}`}>
                            {s.completed && <Icons.Check size={8} className="text-white" />}
                          </div>
                          <span className={`text-xs ${s.completed ? 'text-zinc-400 line-through' : 'text-zinc-600 dark:text-zinc-400'}`}>{s.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {mainTasks.length === 0 && <div className="p-8 text-center text-sm text-zinc-400">Sin tareas</div>}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {files.map(f => (
              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Icons.File size={16} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.name}</div>
                  <div className="text-[10px] text-zinc-400">
                    {f.type || 'archivo'} {f.size ? `· ${(f.size / 1024).toFixed(0)}KB` : ''}
                  </div>
                </div>
                <Icons.External size={14} className="text-zinc-300" />
              </a>
            ))}
            {files.length === 0 && <div className="p-8 text-center text-sm text-zinc-400">Sin archivos</div>}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4">
            {/* Comment list */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
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
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{c.author_name}</span>
                          {c.is_external && <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">Externo</span>}
                          <span className="text-[10px] text-zinc-400">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.content}</p>
                        {replies.map(r => (
                          <div key={r.id} className="mt-2 ml-4 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{r.author_name}</span>
                              <span className="text-[10px] text-zinc-400">{new Date(r.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">{r.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {comments.length === 0 && <div className="p-8 text-center text-sm text-zinc-400">Sin comentarios todavía</div>}
            </div>

            {/* New comment input */}
            {canInteract && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Escribí un comentario..."
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-zinc-400">
                    Comentando en: {commentEntity.type === 'project' ? 'Proyecto general' : commentEntity.type}
                  </span>
                  <button
                    onClick={handleSubmitComment}
                    disabled={!newComment.trim() || submittingComment}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                  >
                    {submittingComment ? 'Enviando...' : 'Enviar comentario'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'deliverables' && (
          <div className="space-y-3">
            {deliverables.map(d => (
              <div key={d.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{d.title}</h4>
                    {d.description && <p className="text-xs text-zinc-500 mt-0.5">{d.description}</p>}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${deliverableStatusColors[d.status] || 'bg-zinc-100 text-zinc-500'}`}>
                    {d.status === 'pending' ? 'Pendiente' : d.status === 'approved' ? 'Aprobado' :
                     d.status === 'rejected' ? 'Rechazado' : 'Revisión solicitada'}
                  </span>
                </div>

                {d.review_comment && (
                  <div className="mt-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">Comentario de revisión:</span> {d.review_comment}
                  </div>
                )}

                {canInteract && d.status === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    {reviewingId === d.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          placeholder="Comentario de revisión (opcional)..."
                          rows={2}
                          className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs resize-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleReview(d.id, 'approved')}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
                            Aprobar
                          </button>
                          <button onClick={() => handleReview(d.id, 'revision_requested')}
                            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">
                            Pedir revisión
                          </button>
                          <button onClick={() => handleReview(d.id, 'rejected')}
                            className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">
                            Rechazar
                          </button>
                          <button onClick={() => { setReviewingId(null); setReviewComment(''); }}
                            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReviewingId(d.id)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        Revisar entregable
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {deliverables.length === 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
                <p className="text-sm text-zinc-400">Sin entregables pendientes</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
