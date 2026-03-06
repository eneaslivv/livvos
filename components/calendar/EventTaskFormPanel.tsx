import React from 'react';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';

interface ContentPlatformConfig {
  label: string;
  color: string;
}

interface ContentStatusConfig {
  id: 'draft' | 'ready' | 'published';
  label: string;
  color: string;
}

interface TeamMember {
  id: string;
  name: string | null;
  email?: string;
  status: string;
  avatar_url?: string | null;
}

interface ProjectOption {
  id: string;
  title: string;
  client_id?: string;
}

interface ClientOption {
  id: string;
  name: string;
}

export interface EventTaskFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  showNewEventForm: boolean;
  showNewTaskForm: boolean;
  calendarMode: 'schedule' | 'content';
  // Event data
  newEventData: {
    title: string;
    description: string;
    start_date: string;
    start_time: string;
    duration: number;
    type: string;
    color: string;
    location: string;
  };
  setNewEventData: React.Dispatch<React.SetStateAction<any>>;
  // Content data
  newContentData: {
    title: string;
    description: string;
    start_date: string;
    start_time: string;
    duration: number;
    platform: string;
    channel: string;
    asset_type: string;
    status: string;
  };
  setNewContentData: React.Dispatch<React.SetStateAction<any>>;
  // Task data
  newTaskData: {
    title: string;
    description: string;
    start_date: string;
    start_time: string;
    priority: string;
    status: string;
    duration: number;
    project_id: string;
    client_id: string;
    assignee_id: string;
  };
  setNewTaskData: React.Dispatch<React.SetStateAction<any>>;
  // Handlers
  onCreateEvent: () => void;
  onCreateContent: () => void;
  onCreateTask: () => void;
  // Config
  contentPlatforms: Record<string, ContentPlatformConfig>;
  contentStatuses: ContentStatusConfig[];
  projectOptions: ProjectOption[];
  clients: ClientOption[];
  teamMembers: TeamMember[];
  userId?: string;
}

export const EventTaskFormPanel: React.FC<EventTaskFormPanelProps> = ({
  isOpen,
  onClose,
  showNewEventForm,
  showNewTaskForm,
  calendarMode,
  newEventData,
  setNewEventData,
  newContentData,
  setNewContentData,
  newTaskData,
  setNewTaskData,
  onCreateEvent,
  onCreateContent,
  onCreateTask,
  contentPlatforms,
  contentStatuses,
  projectOptions,
  clients,
  teamMembers,
  userId,
}) => {
  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={showNewEventForm ? (calendarMode === 'content' ? 'New Content' : 'New Event') : 'New Task'}
      width="sm"
    >
      <div className="p-5">
        {showNewEventForm ? (
          <div className="space-y-2.5" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { const title = calendarMode === 'content' ? newContentData.title : newEventData.title; if (title.trim()) { e.preventDefault(); calendarMode === 'content' ? onCreateContent() : onCreateEvent(); } } }}>
            {/* Title */}
            <input
              type="text"
              placeholder={calendarMode === 'content' ? 'Content name...' : 'Event name...'}
              value={calendarMode === 'content' ? newContentData.title : newEventData.title}
              onChange={(e) => calendarMode === 'content'
                ? setNewContentData((prev: any) => ({ ...prev, title: e.target.value }))
                : setNewEventData((prev: any) => ({ ...prev, title: e.target.value }))
              }
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/10 text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
              autoFocus
            />

            {calendarMode === 'content' ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Platform</label>
                  <select
                    value={newContentData.platform}
                    onChange={(e) => setNewContentData((prev: any) => ({ ...prev, platform: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  >
                    {Object.entries(contentPlatforms).map(([key, value]) => (
                      <option key={key} value={key}>{value.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Channel</label>
                  <select
                    value={newContentData.channel}
                    onChange={(e) => setNewContentData((prev: any) => ({ ...prev, channel: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  >
                    <option value="feed">Feed</option>
                    <option value="stories">Stories</option>
                    <option value="reels">Reels</option>
                    <option value="shorts">Shorts</option>
                    <option value="post">Post</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Status</label>
                  <select
                    value={newContentData.status}
                    onChange={(e) => setNewContentData((prev: any) => ({ ...prev, status: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  >
                    {contentStatuses.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Type</label>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { value: 'meeting', label: 'Meeting', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                    { value: 'call', label: 'Call', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                    { value: 'deadline', label: 'Deadline', color: 'bg-red-500', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400' },
                    { value: 'work-block', label: 'Block', color: 'bg-purple-500', activeBg: 'bg-purple-50 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-400' },
                    { value: 'note', label: 'Note', color: 'bg-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' },
                  ] as const).map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setNewEventData((prev: any) => ({ ...prev, type: t.value }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                        newEventData.type === t.value
                          ? t.activeBg
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${t.color}`} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {calendarMode !== 'content' && (
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Location</label>
                <input
                  type="text"
                  placeholder="Zoom / Office / Link"
                  value={newEventData.location}
                  onChange={(e) => setNewEventData((prev: any) => ({ ...prev, location: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                />
              </div>
            )}

            {calendarMode === 'content' && (
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Asset</label>
                <input
                  type="text"
                  placeholder="Carousel / Video / Copy"
                  value={newContentData.asset_type}
                  onChange={(e) => setNewContentData((prev: any) => ({ ...prev, asset_type: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Date</label>
                <input
                  type="date"
                  value={calendarMode === 'content' ? newContentData.start_date : newEventData.start_date}
                  onChange={(e) => calendarMode === 'content'
                    ? setNewContentData((prev: any) => ({ ...prev, start_date: e.target.value }))
                    : setNewEventData((prev: any) => ({ ...prev, start_date: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Time</label>
                <input
                  type="time"
                  value={calendarMode === 'content' ? newContentData.start_time : newEventData.start_time}
                  onChange={(e) => calendarMode === 'content'
                    ? setNewContentData((prev: any) => ({ ...prev, start_time: e.target.value }))
                    : setNewEventData((prev: any) => ({ ...prev, start_time: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Duration</label>
                <input
                  type="number"
                  value={calendarMode === 'content' ? newContentData.duration : newEventData.duration}
                  onChange={(e) => calendarMode === 'content'
                    ? setNewContentData((prev: any) => ({ ...prev, duration: parseInt(e.target.value) }))
                    : setNewEventData((prev: any) => ({ ...prev, duration: parseInt(e.target.value) }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  min="15"
                  step="15"
                />
              </div>
            </div>

            <input
              type="text"
              placeholder="Optional notes..."
              value={calendarMode === 'content' ? newContentData.description : newEventData.description}
              onChange={(e) => calendarMode === 'content'
                ? setNewContentData((prev: any) => ({ ...prev, description: e.target.value }))
                : setNewEventData((prev: any) => ({ ...prev, description: e.target.value }))
              }
              className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-500 dark:text-zinc-400 placeholder:text-zinc-400 transition-all"
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-0.5">
              <p className="text-[10px] text-zinc-400">Enter to create</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={calendarMode === 'content' ? onCreateContent : onCreateEvent}
                  disabled={calendarMode === 'content' ? !newContentData.title.trim() : !newEventData.title.trim()}
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-[11px] font-semibold disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5"
                >
                  <Icons.Calendar size={12} />
                  {calendarMode === 'content' ? 'Create' : 'Create Event'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && newTaskData.title.trim()) { e.preventDefault(); onCreateTask(); } }}>
            {/* Title */}
            <input
              type="text"
              placeholder="What needs to be done?"
              value={newTaskData.title}
              onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/10 text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
              autoFocus
            />

            {/* Priority pills */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Priority</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'low', label: 'Low', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                  { value: 'medium', label: 'Medium', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                  { value: 'high', label: 'High', color: 'bg-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' },
                  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400' },
                ] as const).map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setNewTaskData((prev: any) => ({ ...prev, priority: p.value }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                      newTaskData.priority === p.value
                        ? p.activeBg
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + Time + Duration row */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Date</label>
                <input
                  type="date"
                  value={newTaskData.start_date}
                  onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, start_date: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Time</label>
                <input
                  type="time"
                  value={newTaskData.start_time}
                  onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, start_time: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Duration</label>
                <select
                  value={newTaskData.duration}
                  onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, duration: parseInt(e.target.value) }))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1h</option>
                  <option value="90">1.5h</option>
                  <option value="120">2h</option>
                  <option value="180">3h</option>
                  <option value="240">4h</option>
                </select>
              </div>
            </div>

            {/* Status pills */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Status</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'todo', label: 'To do', color: 'bg-zinc-400', activeBg: 'bg-zinc-100 dark:bg-zinc-700/50 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300' },
                  { value: 'in-progress', label: 'In progress', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                  { value: 'done', label: 'Done', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                ] as const).map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setNewTaskData((prev: any) => ({ ...prev, status: s.value }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                      newTaskData.status === s.value
                        ? s.activeBg
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Project + Client */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Project</label>
                <select
                  value={newTaskData.project_id}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const proj = projectOptions.find(p => p.id === pid) as any;
                    setNewTaskData((prev: any) => ({
                      ...prev,
                      project_id: pid,
                      client_id: prev.client_id || proj?.client_id || ''
                    }));
                  }}
                  className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                    newTaskData.project_id
                      ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-400'
                      : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <option value="">No project</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Client</label>
                <select
                  value={newTaskData.client_id}
                  onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, client_id: e.target.value }))}
                  className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                    newTaskData.client_id
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                      : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Assign to</label>
              <select
                value={newTaskData.assignee_id}
                onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, assignee_id: e.target.value }))}
                className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                  newTaskData.assignee_id
                    ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400'
                    : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <option value="">Unassigned</option>
                {teamMembers.filter(m => m.status === 'active').map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === userId ? `${member.name || member.email} (Me)` : (member.name || member.email)}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <input
              type="text"
              placeholder="Optional notes..."
              value={newTaskData.description}
              onChange={(e) => setNewTaskData((prev: any) => ({ ...prev, description: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-500 dark:text-zinc-400 placeholder:text-zinc-400 transition-all"
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-0.5">
              <p className="text-[10px] text-zinc-400">Enter to create</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreateTask}
                  disabled={!newTaskData.title.trim()}
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-[11px] font-semibold disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5"
                >
                  <Icons.Check size={12} />
                  Create Task
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SlidePanel>
  );
};
