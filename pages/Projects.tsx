import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { useProjects, Project, ProjectStatus } from '../context/ProjectsContext';
import { errorLogger } from '../lib/errorLogger';
import { logActivity } from '../lib/activity';
import { supabase } from '../lib/supabase';



import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';

const StatusBadge = ({ status }: { status: ProjectStatus }) => {
  const colors = {
    [ProjectStatus.Active]: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    [ProjectStatus.Pending]: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    [ProjectStatus.Review]: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/20',
    [ProjectStatus.Completed]: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
    [ProjectStatus.Archived]: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider border ${colors[status]}`}>
      {status}
    </span>
  );
};

export const Projects: React.FC = () => {
  const { projects, loading, error, createProject, updateProject } = useProjects();
  const { members } = useTeam();
  const { user: currentUser } = useAuth();

  // Log inicial del componente
  useEffect(() => {
    errorLogger.log('Projects component montado', {
      loading,
      error,
      projectsCount: projects?.length
    });
  }, [loading, error, projects?.length]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'timeline' | 'files' | 'settings'>('overview');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isClientPreviewMode, setIsClientPreviewMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState<Record<number, string>>({});
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const selectedProject = projects.find(p => p.id === selectedId) || projects[0];

  // Log cuando cambian los datos
  useEffect(() => {
    errorLogger.log('Projects data updated', {
      projectsCount: projects.length,
      selectedProject: selectedProject?.id,
      activeTab
    });
  }, [projects.length, selectedProject?.id, activeTab]);

  const handleCreateProject = async (data: Partial<Project>) => {
    try {
      errorLogger.log('Creando nuevo proyecto', data);
      const newProject = await createProject({
        title: data.title || 'New Project',
        description: data.description || '',
        progress: 0,
        status: data.status || ProjectStatus.Active,
        client: data.client || 'TBD',
        clientName: data.clientName || data.client || 'TBD',
        clientAvatar: 'XX',
        deadline: data.deadline || new Date().toISOString().slice(0, 10),
        nextSteps: 'Kick-off',
        tags: data.tags || [],
        team: data.team || [],
        tasksGroups: data.tasksGroups || [],
        files: [],
        activity: [],
        color: data.color || '#3b82f6',
      });

      errorLogger.log('Proyecto creado exitosamente');
      await logActivity({
        action: 'created project',
        target: newProject.title,
        project_title: newProject.title,
        type: 'project_created',
        details: 'New project added'
      })
    } catch (err) {
      errorLogger.error('Error creando proyecto', err);
      alert('Error al crear el proyecto. Por favor intenta de nuevo.');
    }
  };

  const handleUpdateProject = async (updates: Partial<Project>) => {
    try {
      errorLogger.log('Actualizando proyecto', { id: selectedProject.id, updates });
      if (!selectedProject) return;
      const updatedProject = await updateProject(selectedProject.id, updates);

      errorLogger.log('Proyecto actualizado exitosamente');
      await logActivity({
        action: 'updated project',
        target: updatedProject.title,
        project_title: updatedProject.title,
        type: 'status_change',
        details: 'Project settings updated'
      })
    } catch (err) {
      errorLogger.error('Error actualizando proyecto', err);
      alert('Error al actualizar el proyecto. Por favor intenta de nuevo.');
    }
  };

  useEffect(() => {
    if (!selectedId && projects.length) {
      errorLogger.log('Seleccionando primer proyecto por defecto');
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);

  // Manejo de errores
  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Error al cargar proyectos</h2>
          <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }

  // Manejo de estados de carga
  if (loading && projects.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] p-6">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-zinc-100 mx-auto mb-4"></div>
            <p className="text-zinc-600 dark:text-zinc-400">Cargando proyectos...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleAddGroup = async () => {
    if (!selectedProject || !newGroupName.trim()) return
    const updated = [...selectedProject.tasksGroups, { name: newGroupName.trim(), tasks: [] }]
    await updateProject(selectedProject.id, { tasksGroups: updated })
    setNewGroupName('')
    await logActivity({
      action: 'added phase',
      target: newGroupName.trim(),
      project_title: selectedProject.title,
      type: 'project_update',
    })
  }

  const handleAddTask = async (groupIdx: number) => {
    if (!selectedProject) return
    const title = newTaskTitle[groupIdx]?.trim()
    if (!title) return
    const updated = selectedProject.tasksGroups.map((g, i) =>
      i === groupIdx ? { ...g, tasks: [...g.tasks, { id: crypto.randomUUID(), title, done: false, assignee: currentUser?.id || 'Unknown' }] } : g
    )
    await updateProject(selectedProject.id, { tasksGroups: updated })
    setNewTaskTitle(prev => ({ ...prev, [groupIdx]: '' }))
    await logActivity({
      action: 'added task',
      target: title,
      project_title: selectedProject.title,
      type: 'project_update',
    })
  }

  const handleToggleTask = async (groupIdx: number, taskId: string) => {
    if (!selectedProject) return
    const updated = selectedProject.tasksGroups.map((g, i) =>
      i === groupIdx
        ? { ...g, tasks: g.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
        : g
    )
    await updateProject(selectedProject.id, { tasksGroups: updated })
    const task = selectedProject.tasksGroups[groupIdx].tasks.find(t => t.id === taskId)
    if (task) {
      await logActivity({
        action: task.done ? 'reopened task' : 'completed task',
        target: task.title,
        project_title: selectedProject.title,
        type: 'task_completed',
      })
    }
  }

  const handleInviteMember = async () => {
    if (!selectedProject || !inviteEmail.trim()) return
    const { data: profiles, error: profileErr } = await supabase.from('profiles').select('user_id,email').eq('email', inviteEmail.trim()).limit(1)
    if (profileErr) {
      alert('Error buscando usuario: ' + profileErr.message)
      return
    }
    if (!profiles || profiles.length === 0) {
      alert('No existe un usuario con ese email. Pídeles que inicien sesión al menos una vez.')
      return
    }
    const memberId = profiles[0].user_id
    const { error: insertErr } = await supabase.from('project_members').insert({ project_id: selectedProject.id, member_id: memberId })
    if (insertErr) {
      alert('Error invitando: ' + insertErr.message)
      return
    }
    setInviteEmail('')
    setIsShareModalOpen(false)
    await logActivity({
      action: 'invited',
      target: inviteEmail.trim(),
      project_title: selectedProject.title,
      type: 'project_update',
      details: 'Member added to project'
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {isClientPreviewMode && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-900 p-8 animate-in fade-in">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedProject.title}</h1>
              <button onClick={() => setIsClientPreviewMode(false)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                <Icons.Close size={20} />
              </button>
            </div>
            <div className="prose prose-zinc dark:prose-invert max-w-none">
              <p>{selectedProject.description}</p>
              <p>Status: <StatusBadge status={selectedProject.status} /></p>
              <p>Progress: {selectedProject.progress}%</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Projects</h2>
            <div className="flex items-center gap-2">
              <input
                value={newProjectTitle}
                onChange={e => setNewProjectTitle(e.target.value)}
                placeholder="Nuevo proyecto"
                className="px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded"
              />
              <button
                onClick={() => handleCreateProject({ title: newProjectTitle })}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <Icons.Plus size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-2 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 px-3 py-2">
                No hay proyectos aún
              </div>
            ) : projects.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`group p-3 rounded-lg border cursor-pointer transition-all ${selectedId === p.id
                    ? 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600 shadow-sm ring-1 ring-zinc-50 dark:ring-zinc-800'
                    : 'bg-transparent border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                  }`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`text-sm font-medium truncate ${selectedId === p.id ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>{p.title}</span>
                  {p.progress === 100 ? <Icons.Check size={14} className="text-emerald-500" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600"></div>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{p.client}</span>
                  <span className="text-[10px] text-zinc-400 font-mono">{p.progress}%</span>
                </div>
                {selectedId === p.id && (
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
                    <div className="bg-zinc-900 dark:bg-zinc-200 h-full rounded-full transition-all duration-500" style={{ width: `${p.progress}%` }}></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-start shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-mono text-zinc-400 uppercase">{selectedProject ? `PRJ-${selectedProject.id.slice(0, 8)}` : 'PRJ-—'}</span>
                {selectedProject && <StatusBadge status={selectedProject.status} />}
              </div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedProject ? selectedProject.title : 'Sin proyecto seleccionado'}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {selectedProject && (
                  <>
                    <span className="flex items-center gap-1.5"><Icons.Users size={14} /> {selectedProject.client}</span>
                    <span className="flex items-center gap-1.5"><Icons.Calendar size={14} /> Due {selectedProject.deadline}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsShareModalOpen(true)} className="px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800">Share</button>
              <button onClick={() => setIsClientPreviewMode(true)} className="px-3 py-1.5 text-sm bg-zinc-900 text-white rounded-md hover:bg-zinc-800">Client View</button>
            </div>
          </div>

          {isShareModalOpen && selectedProject && (
            <div className="px-8 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="max-w-md p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Invite to project</h3>
                  <button onClick={() => setIsShareModalOpen(false)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"><Icons.Close size={16} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="email@domain.com"
                    className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm"
                  />
                  <button onClick={handleInviteMember} className="px-3 py-2 text-sm bg-zinc-900 text-white rounded-md">Invite</button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">El usuario debe haber iniciado sesión al menos una vez para existir en perfiles.</p>
              </div>
            </div>
          )}

          <div className="px-8 py-4 border-b border-zinc-100 dark:border-zinc-800 flex gap-4 text-sm">
            {(['overview', 'tasks', 'timeline', 'files', 'settings'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 border-b-2 capitalize transition-colors ${activeTab === tab
                    ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-medium'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 p-8 overflow-y-auto">
            {activeTab === 'overview' && selectedProject && (
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                  <div className="p-5 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Description</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{selectedProject.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <div className="text-xs text-zinc-400 uppercase font-bold tracking-wider mb-2">Progress</div>
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">{selectedProject.progress}%</div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${selectedProject.progress}%` }}></div>
                      </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <div className="text-xs text-zinc-400 uppercase font-bold tracking-wider mb-2">Tasks Open</div>
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                        {selectedProject.tasksGroups.flatMap(g => g.tasks).filter(t => !t.done).length}
                      </div>
                      <div className="text-xs text-zinc-400">Across {selectedProject.tasksGroups.length} phases</div>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 space-y-6">
                  <div className="p-5 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Team</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                      {selectedProject.team.map(userId => {
                        const member = members.find(m => m.id === userId);
                        if (!member) return null;

                        return (
                          <div key={member.id} className="flex items-center gap-3">
                            <div className="relative w-8 h-8">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                                {member.avatar_url ? (
                                  <img src={member.avatar_url} alt={member.name || ''} className="w-full h-full object-cover" />
                                ) : (
                                  (member.name || member.email).substring(0, 2).toUpperCase()
                                )}
                              </div>
                            </div>
                            <div className="overflow-hidden">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{member.name || member.email}</div>
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{member.role}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && selectedProject && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="New phase name"
                    className="px-3 py-2 border rounded-md text-sm bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  />
                  <button
                    onClick={handleAddGroup}
                    className="px-3 py-2 text-sm bg-zinc-900 text-white rounded-md"
                  >
                    Add Phase
                  </button>
                </div>
                {selectedProject.tasksGroups.map((group, gIdx) => (
                  <div key={gIdx} className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.name}</h3>
                      <span className="text-xs text-zinc-400">{group.tasks.filter(t => t.done).length}/{group.tasks.length}</span>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {group.tasks.map(task => (
                        <div key={task.id} className="group px-5 py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/30">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => handleToggleTask(gIdx, task.id)}
                              className="rounded border-zinc-300"
                            />
                            <span className={`text-sm ${task.done ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{task.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {task.dueDate && (
                              <div className="text-[10px] text-zinc-400 font-mono bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 rounded">
                                {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </div>
                            )}
                            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                              {(() => {
                                const assignee = members.find(m => m.id === task.assignee);
                                if (assignee?.avatar_url) {
                                  return <img src={assignee.avatar_url} alt={assignee.name || ''} className="w-full h-full rounded-full object-cover" />;
                                }
                                return (assignee?.name || task.assignee || '?').substring(0, 2).toUpperCase();
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="px-5 py-3 flex items-center gap-2">
                        <input
                          value={newTaskTitle[gIdx] ?? ''}
                          onChange={e => setNewTaskTitle(prev => ({ ...prev, [gIdx]: e.target.value }))}
                          placeholder="New task title"
                          className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm"
                        />
                        <button
                          onClick={() => handleAddTask(gIdx)}
                          className="px-3 py-2 text-sm bg-zinc-900 text-white rounded-md"
                        >
                          Add Task
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'timeline' && selectedProject && (
              <div className="p-6 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">Timeline</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Timeline view coming soon...</p>
              </div>
            )}

            {activeTab === 'files' && selectedProject && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedProject.files.map((file, i) => (
                  <div key={i} className="group p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-600 transition-all cursor-pointer flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-950 rounded-lg flex items-center justify-center text-zinc-400 mb-3 group-hover:scale-110 transition-transform">
                      <Icons.File size={24} />
                    </div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate w-full mb-1">{file.name}</div>
                    <div className="text-xs text-zinc-400">{file.size} • {file.date}</div>
                  </div>
                ))}
                <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors min-h-[160px]">
                  <Icons.Upload size={24} className="mb-2" />
                  <span className="text-sm">Upload File</span>
                </div>
              </div>
            )}

            {activeTab === 'settings' && selectedProject && (
              <div className="max-w-2xl space-y-6">
                <div className="p-6 bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
                      <input
                        type="text"
                        value={selectedProject.title}
                        onChange={e => handleUpdateProject({ title: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                      <textarea
                        rows={3}
                        value={selectedProject.description}
                        onChange={e => handleUpdateProject({ description: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Status</label>
                      <select
                        value={selectedProject.status}
                        onChange={e => handleUpdateProject({ status: e.target.value as ProjectStatus })}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      >
                        {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};