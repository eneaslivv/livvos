import React, { useEffect, useMemo, useState } from 'react';
import PortalApp from './livv-client view-control/App';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DashboardData, Milestone, LogEntry, TaskItem, MessageItem } from './livv-client view-control/types';

type ClientRecord = {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  avatar_url?: string | null;
};

type ProjectRecord = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  client_id?: string | null;
};

type TaskRecord = {
  id: string;
  title?: string | null;
  completed?: boolean | null;
  start_date?: string | null;
  due_date?: string | null;
  created_at?: string | null;
};

type FinanceRecord = {
  total_agreed?: number | null;
  total_collected?: number | null;
};

type ClientDocument = {
  id: string;
  name: string;
  doc_type?: string | null;
  url?: string | null;
  size_label?: string | null;
};

type ClientCredential = {
  id: string;
  service: string;
  username?: string | null;
  secret?: string | null;
};

type FileRecord = {
  id: string;
  name: string;
  type?: string | null;
  size?: number | null;
  url: string;
};

type ClientTaskRecord = {
  id: string;
  title?: string | null;
  completed?: boolean | null;
  priority?: string | null;
  due_date?: string | null;
  created_at?: string | null;
};

type ClientHistoryRecord = {
  id: string;
  action_description?: string | null;
  action_date?: string | null;
  user_name?: string | null;
  action_type?: string | null;
};

type ClientMessageRecord = {
  id: string;
  message?: string | null;
  sender_name?: string | null;
  sender_type?: string | null;
  created_at?: string | null;
};

export const ClientPortalView: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('CLIENT PORTAL');
  const [projectSubtitle, setProjectSubtitle] = useState<string>('LIVV CLIENT ACCESS');
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const clientIdParam = params.get('clientId');
  const projectIdParam = params.get('projectId');

  useEffect(() => {
    const loadPortal = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);

      try {
        let client: ClientRecord | null = null;
        let project: ProjectRecord | null = null;

        if (projectIdParam) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id,title,description,status,created_at,client_id')
            .eq('id', projectIdParam)
            .single();
          project = projectData as ProjectRecord | null;
          if (project?.client_id) {
            const { data: clientData } = await supabase
              .from('clients')
              .select('id,name,email,company,avatar_url')
              .eq('id', project.client_id)
              .single();
            client = clientData as ClientRecord | null;
          }
        }

        if (!client && clientIdParam) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('id,name,email,company,avatar_url')
            .eq('id', clientIdParam)
            .single();
          client = clientData as ClientRecord | null;
        }

        if (!client) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('id,name,email,company,avatar_url')
            .eq('auth_user_id', user.id)
            .single();
          client = clientData as ClientRecord | null;
        }

        if (!client) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('id,name,email,company,avatar_url')
            .eq('email', user.email)
            .single();
          client = clientData as ClientRecord | null;
        }

        if (!project && client?.id) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id,title,description,status,created_at,client_id')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          project = projectData as ProjectRecord | null;
        }

        if (!client) {
          setError('No client record found for this user.');
          setLoading(false);
          return;
        }

        const projectId = project?.id || null;

        const [{ data: tasksData }, { data: financesData }, { data: logsData }, { data: docsData }, { data: credsData }, { data: filesData }, { data: projectFilesData }, { data: clientTasksData }, { data: clientHistoryData }, { data: clientMessagesData }] = await Promise.all([
          projectId
            ? supabase.from('tasks').select('id,title,completed,start_date,due_date,created_at,client_id').eq('project_id', projectId)
            : client?.id
            ? supabase.from('tasks').select('id,title,completed,start_date,due_date,created_at,client_id').eq('client_id', client.id)
            : Promise.resolve({ data: [] }),
          projectId
            ? supabase.from('finances').select('total_agreed,total_collected').eq('project_id', projectId).maybeSingle()
            : Promise.resolve({ data: null }),
          project?.title
            ? supabase.from('activity_logs').select('id,action,created_at,project_title').eq('project_title', project.title).order('created_at', { ascending: false }).limit(5)
            : Promise.resolve({ data: [] }),
          client?.id
            ? supabase.from('client_documents').select('id,name,doc_type,url,size_label').eq('client_id', client.id).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          client?.id
            ? supabase.from('client_credentials').select('id,service,username,secret').eq('client_id', client.id)
            : Promise.resolve({ data: [] }),
          client?.id
            ? supabase.from('files').select('id,name,type,size,url').eq('client_id', client.id).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          projectId
            ? supabase.from('files').select('id,name,type,size,url').eq('project_id', projectId).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          // CRM data: client tasks, history, messages
          client?.id
            ? supabase.from('client_tasks').select('id,title,completed,priority,due_date,created_at').eq('client_id', client.id).order('created_at', { ascending: true })
            : Promise.resolve({ data: [] }),
          client?.id
            ? supabase.from('client_history').select('id,action_description,action_date,user_name,action_type').eq('client_id', client.id).order('action_date', { ascending: false }).limit(10)
            : Promise.resolve({ data: [] }),
          client?.id
            ? supabase.from('client_messages').select('id,message,sender_name,sender_type,created_at').eq('client_id', client.id).order('created_at', { ascending: false }).limit(20)
            : Promise.resolve({ data: [] })
        ]);

        const tasks = (tasksData || []) as TaskRecord[];
        const finances = (financesData || {}) as FinanceRecord;

        const totalTasks = tasks.length || 1;
        const completedTasks = tasks.filter(task => task.completed).length;
        const progress = Math.min(100, Math.round((completedTasks / totalTasks) * 100));

        const startDate = project?.created_at
          ? new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'TBD';

        const dueDates = tasks.map(t => t.due_date || t.start_date).filter(Boolean) as string[];
        const eta = dueDates.length ? dueDates.sort().slice(-1)[0] : project?.created_at || new Date().toISOString();
        const etaDate = eta ? new Date(eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';

        const milestones: Milestone[] = tasks
          .slice(0, 5)
          .map((task, index) => ({
            id: task.id,
            title: task.title || `Milestone ${index + 1}`,
            description: 'Project task milestone',
            status: task.completed ? 'completed' : index === 0 ? 'current' : 'future'
          }));

        const logs: LogEntry[] = (logsData || []).map((log: any) => ({
          id: log.id,
          timestamp: new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          message: log.action || 'Project update'
        }));

        const assets = (docsData || []).map((doc: ClientDocument) => ({
          id: doc.id,
          name: doc.name,
          type: doc.doc_type || 'Document',
          size: doc.size_label || '—',
          url: doc.url || undefined
        }));

        const fileAssets = (filesData || []).map((doc: FileRecord) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type || 'File',
          size: doc.size ? `${Math.round(doc.size / 1024)} KB` : '—',
          url: doc.url || undefined
        }));

        const projectFileAssets = (projectFilesData || []).map((doc: FileRecord) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type || 'File',
          size: doc.size ? `${Math.round(doc.size / 1024)} KB` : '—',
          url: doc.url || undefined
        }));

        const credentials = (credsData || []).map((cred: ClientCredential) => ({
          id: cred.id,
          service: cred.service,
          user: cred.username || undefined,
          pass: cred.secret || undefined
        }));

        // Map CRM client tasks
        const clientTasks: TaskItem[] = (clientTasksData || []).map((t: ClientTaskRecord) => ({
          id: t.id,
          title: t.title || 'Task',
          completed: t.completed || false,
          priority: t.priority || undefined,
          dueDate: t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined
        }));

        // Merge CRM history into logs
        const historyLogs: LogEntry[] = (clientHistoryData || []).map((h: ClientHistoryRecord) => ({
          id: `h-${h.id}`,
          timestamp: h.action_date ? new Date(h.action_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent',
          message: `${h.user_name || 'Team'}: ${h.action_description || 'Activity'}`
        }));
        const mergedLogs = [...logs, ...historyLogs].sort((a, b) => 0); // keep interleaved order

        // Map CRM messages
        const clientMessages: MessageItem[] = (clientMessagesData || []).map((m: ClientMessageRecord) => ({
          id: m.id,
          message: m.message || '',
          senderName: m.sender_name || 'Team',
          senderType: (m.sender_type === 'client' ? 'client' : 'user') as 'user' | 'client',
          timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''
        }));

        const dashboard: DashboardData = {
          progress,
          startDate,
          etaDate,
          onTrack: true,
          budget: {
            total: Number(finances?.total_agreed || 0),
            paid: Number(finances?.total_collected || 0)
          },
          milestones: milestones.length ? milestones : [
            { id: 'm1', title: 'Project kickoff', description: 'Initial project setup.', status: 'current' }
          ],
          logs: mergedLogs.length ? mergedLogs : [
            { id: 'l1', timestamp: 'Today', message: 'Portal connected to live project data.' }
          ],
          assets: [...assets, ...fileAssets, ...projectFileAssets],
          credentials,
          tasks: clientTasks,
          messages: clientMessages
        };

        setProjectTitle(project?.title || client.company || client.name || 'Client Portal');
        setProjectSubtitle(project?.status || 'Project in progress');
        setClientLogo(client.avatar_url || null);
        setData(dashboard);
      } catch (err: any) {
        setError(err.message || 'Failed to load client portal data');
      } finally {
        setLoading(false);
      }
    };

    loadPortal();
  }, [user, clientIdParam, projectIdParam]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Cargando portal...</div>;
  }

  if (error || !data) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">{error || 'No data available'}</div>;
  }

  return (
    <PortalApp
      initialData={data}
      projectTitle={projectTitle}
      projectSubtitle={projectSubtitle}
      clientLogo={clientLogo}
      forceOnboarded
      disableLoading
      hideCreatorToggle
    />
  );
};
