import React from 'react';
import { Icons } from '../ui/Icons';
import { Project, ProjectStatus } from '../../context/ProjectsContext';
import { Client } from '../../context/ClientsContext';
import { TeamMember } from '../../context/TeamContext';
import { ColorPalette } from '../ui/ColorPalette';

export interface SettingsTabProps {
  project: Project;
  clients: Client[];
  members: TeamMember[];
  onUpdateProject: (updates: Partial<Project>) => void;
  onDeleteProject: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  project,
  clients,
  members,
  onUpdateProject,
  onDeleteProject,
}) => {
  return (
    <div className="max-w-2xl space-y-6">
      {/* General */}
      <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">General</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Title</label>
            <input type="text" value={project.title} onChange={e => onUpdateProject({ title: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Description</label>
            <textarea rows={3} value={project.description} onChange={e => onUpdateProject({ description: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Status</label>
              <select value={project.status} onChange={e => onUpdateProject({ status: e.target.value as ProjectStatus })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600">
                {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Deadline</label>
              <input type="date" value={project.deadline} onChange={e => onUpdateProject({ deadline: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ColorPalette
                label="Color"
                value={project.color}
                onChange={(color: string | null) => onUpdateProject({ color: color || '#3b82f6' })}
                allowClear={false}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Progress</label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100} value={project.progress}
                  onChange={e => onUpdateProject({ progress: parseInt(e.target.value) })}
                  className="flex-1 accent-zinc-900 dark:accent-zinc-100" />
                <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300 tabular-nums w-10 text-right">{project.progress}%</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Budget</label>
              <input type="number" min={0} step={100} value={project.budget || ''} placeholder="0"
                onChange={e => onUpdateProject({ budget: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Currency</label>
              <select value={project.currency || 'USD'} onChange={e => onUpdateProject({ currency: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="ARS">ARS</option>
                <option value="BRL">BRL</option>
                <option value="GBP">GBP</option>
                <option value="MXN">MXN</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Client */}
      <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Client</h3>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Assigned Client</label>
          <select
            value={project.client_id || ''}
            onChange={e => {
              const cid = e.target.value || null;
              const client = clients.find(c => c.id === cid);
              onUpdateProject({
                client_id: cid,
                client: client?.name || 'TBD',
                clientName: client?.name || 'TBD',
              } as any);
            }}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
          >
            <option value="">No client (personal project)</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
          </select>
        </div>
      </div>

      {/* Team */}
      <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Team Members</h3>
        <div className="space-y-3 mb-4">
          {project.team.length === 0 && (
            <p className="text-xs text-zinc-400">No team members assigned yet.</p>
          )}
          {project.team.map(userId => {
            const member = members.find(m => m.id === userId);
            if (!member) return null;
            return (
              <div key={member.id} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                    {member.avatar_url ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" /> : (member.name || member.email).substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{member.name || member.email}</div>
                    <div className="text-[10px] text-zinc-400">{member.role}</div>
                  </div>
                </div>
                <button
                  onClick={() => onUpdateProject({ team: project.team.filter(id => id !== userId) })}
                  className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all"
                >
                  <Icons.Close size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Add Member</label>
          <select
            value=""
            onChange={e => {
              if (!e.target.value) return;
              if (project.team.includes(e.target.value)) return;
              onUpdateProject({ team: [...project.team, e.target.value] });
            }}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
          >
            <option value="">Select a team member...</option>
            {members.filter(m => !project.team.includes(m.id)).map(m => (
              <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Tags</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {project.tags.map((tag, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium rounded-full group">
              {tag}
              <button onClick={() => onUpdateProject({ tags: project.tags.filter((_, idx) => idx !== i) })}
                className="text-zinc-400 hover:text-red-500 transition-colors">
                <Icons.Close size={12} />
              </button>
            </span>
          ))}
          {project.tags.length === 0 && <span className="text-xs text-zinc-400">No tags</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Add tag..."
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val && !project.tags.includes(val)) {
                  onUpdateProject({ tags: [...project.tags, val] });
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
            className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-6 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/30">
        <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">Danger Zone</h3>
        <p className="text-xs text-red-600/70 dark:text-red-400/70 mb-4">These actions are irreversible. Proceed with caution.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onUpdateProject({ status: ProjectStatus.Archived })}
            className="px-4 py-2 text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
          >
            Archive Project
          </button>
          <button
            onClick={onDeleteProject}
            className="px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
};
