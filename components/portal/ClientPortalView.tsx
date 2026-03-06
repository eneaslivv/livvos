import React, { useEffect, useMemo, useState } from 'react';
import PortalApp from './livv-client view-control/App';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DashboardData, Milestone, LogEntry, PaymentEntry, PortalTask, PortalProject } from './livv-client view-control/types';

/** Wrap a promise with a timeout — returns fallback on timeout or error */
const safeQuery = <T,>(promise: Promise<{ data: T; error: any }>, fallback: T, ms = 6000): Promise<{ data: T }> =>
  Promise.race([
    promise.then(res => {
      if (res.error) { console.warn('Portal query error:', res.error.message); return { data: fallback }; }
      return { data: res.data ?? fallback };
    }).catch(() => ({ data: fallback })),
    new Promise<{ data: T }>(resolve => setTimeout(() => { console.warn('Portal query timeout'); resolve({ data: fallback }); }, ms))
  ]);

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
  completed_at?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  group_name?: string | null;
  status?: string | null;
  priority?: string | null;
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

export const ClientPortalView: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('CLIENT PORTAL');
  const [projectSubtitle, setProjectSubtitle] = useState<string>('LIVV CLIENT ACCESS');
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | undefined>();
  const [clientName, setClientName] = useState<string | undefined>();
  const [clientEmail, setClientEmail] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  // Auth timeout: if user isn't available after 6s, stop waiting
  useEffect(() => {
    if (user) return; // user available, no timeout needed
    const timer = setTimeout(() => {
      if (!user) {
        console.warn('[Portal] Auth timeout — user not available');
        setLoading(false);
        setError('Could not verify your session. Please try reloading the page.');
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleLogout = async () => {
    // If admin is previewing the portal, just go back to the app (no signout)
    const portalFlag = new URLSearchParams(window.location.search).get('portal');
    if (portalFlag === 'client') {
      window.location.href = '/';
      return;
    }
    await supabase.auth.signOut();
    window.location.href = '/';
  };

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

        // --- Resolve client (with clientId param: single fast lookup) ---
        if (clientIdParam) {
          const { data } = await safeQuery(
            supabase.from('clients').select('id,name,email,company,avatar_url').eq('id', clientIdParam).single(),
            null as ClientRecord | null, 5000
          );
          client = data;
        }

        if (projectIdParam) {
          const { data } = await safeQuery(
            supabase.from('projects').select('id,title,description,status,created_at,client_id').eq('id', projectIdParam).single(),
            null as ProjectRecord | null, 5000
          );
          project = data;
          if (!client && project?.client_id) {
            const { data: cd } = await safeQuery(
              supabase.from('clients').select('id,name,email,company,avatar_url').eq('id', project.client_id).single(),
              null as ClientRecord | null, 5000
            );
            client = cd;
          }
        }

        // If no client yet, try auth_user_id, email, then owner_id (admin)
        if (!client) {
          const { data: cd1 } = await safeQuery(
            supabase.from('clients').select('id,name,email,company,avatar_url').eq('auth_user_id', user.id).single(),
            null as ClientRecord | null, 4000
          );
          client = cd1;
        }
        if (!client && user.email) {
          const { data: cd2 } = await safeQuery(
            supabase.from('clients').select('id,name,email,company,avatar_url').eq('email', user.email).single(),
            null as ClientRecord | null, 4000
          );
          client = cd2;
        }
        if (!client) {
          const { data: cd3 } = await safeQuery(
            supabase.from('clients').select('id,name,email,company,avatar_url').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
            null as ClientRecord | null, 4000
          );
          if (cd3) console.log('[Portal] Admin access:', cd3.name);
          client = cd3;
        }

        // Fetch ALL projects for this client (for project selector)
        let allProjects: ProjectRecord[] = [];
        if (client?.id) {
          const { data: allPd } = await safeQuery(
            supabase.from('projects').select('id,title,description,status,created_at,client_id').eq('client_id', client.id).order('created_at', { ascending: false }),
            [] as ProjectRecord[], 4000
          );
          allProjects = allPd || [];
        }

        if (!project && allProjects.length > 0) {
          // If selectedProjectId is set (user switched), use it
          if (selectedProjectId) {
            project = allProjects.find(p => p.id === selectedProjectId) || allProjects[0];
          } else {
            project = allProjects[0];
          }
        }

        if (!client) {
          setError('Could not find your client record. Your account may still be setting up. Please try again in a few seconds.');
          setLoading(false);
          return;
        }

        // Store client identity for header/chat
        setClientId(client.id);
        setClientName(client.name);
        setClientEmail(client.email || undefined);

        const projectId = project?.id || null;

        const [{ data: tasksData }, { data: financesData }, { data: logsData }, { data: docsData }, { data: credsData }, { data: filesData }, { data: projectFilesData }, { data: incomesData }] = await Promise.all([
          projectId
            ? safeQuery(supabase.from('tasks').select('id,title,completed,completed_at,start_date,due_date,created_at,client_id,group_name,status,priority').eq('project_id', projectId), [] as any[])
            : client?.id
            ? safeQuery(supabase.from('tasks').select('id,title,completed,completed_at,start_date,due_date,created_at,client_id,group_name,status,priority').eq('client_id', client.id), [] as any[])
            : Promise.resolve({ data: [] }),
          projectId
            ? safeQuery(supabase.from('finances').select('total_agreed,total_collected').eq('project_id', projectId).maybeSingle(), null)
            : Promise.resolve({ data: null }),
          project?.title
            ? safeQuery(supabase.from('activity_logs').select('id,action,created_at,project_title').eq('project_title', project.title).order('created_at', { ascending: false }).limit(5), [] as any[])
            : Promise.resolve({ data: [] }),
          client?.id
            ? safeQuery(supabase.from('client_documents').select('id,name,doc_type,url,size_label').eq('client_id', client.id).order('created_at', { ascending: false }), [] as any[])
            : Promise.resolve({ data: [] }),
          client?.id
            ? safeQuery(supabase.from('client_credentials').select('id,service,username,secret').eq('client_id', client.id), [] as any[])
            : Promise.resolve({ data: [] }),
          client?.id
            ? safeQuery(supabase.from('files').select('id,name,type,size,url').eq('client_id', client.id).order('created_at', { ascending: false }), [] as any[])
            : Promise.resolve({ data: [] }),
          projectId
            ? safeQuery(supabase.from('files').select('id,name,type,size,url').eq('project_id', projectId).order('created_at', { ascending: false }), [] as any[])
            : Promise.resolve({ data: [] }),
          projectId
            ? safeQuery(supabase.from('incomes').select('id,concept,total_amount,status,due_date,installments(id,number,amount,due_date,paid_date,status)').eq('project_id', projectId).order('due_date', { ascending: true }), [] as any[])
            : client?.id
            ? safeQuery(supabase.from('incomes').select('id,concept,total_amount,status,due_date,installments(id,number,amount,due_date,paid_date,status)').eq('client_id', client.id).order('due_date', { ascending: true }), [] as any[])
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

        // Build milestones from ALL tasks with proper status
        let foundCurrent = false;
        const milestones: Milestone[] = tasks.map((task, index) => {
          let status: 'completed' | 'current' | 'future';
          if (task.completed) {
            status = 'completed';
          } else if (!foundCurrent) {
            status = 'current';
            foundCurrent = true;
          } else {
            status = 'future';
          }

          const completedAt = task.completed_at
            ? new Date(task.completed_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
            : undefined;

          const eta = task.due_date
            ? new Date(task.due_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
            : undefined;

          return {
            id: task.id,
            title: task.title || `Task ${index + 1}`,
            description: task.group_name || '',
            status,
            eta,
            completedAt,
          };
        });

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

        // Build payment schedule from incomes + installments
        const payments: PaymentEntry[] = [];
        let totalFromIncomes = 0;
        let paidFromInstallments = 0;
        for (const inc of (incomesData || []) as any[]) {
          const installments = (inc.installments || []) as any[];
          if (installments.length > 0) {
            for (const inst of installments) {
              const isPaid = inst.status === 'paid';
              if (isPaid) paidFromInstallments += Number(inst.amount || 0);
              payments.push({
                id: inst.id,
                concept: `${inc.concept || 'Payment'} — Installment ${inst.number || 1}`,
                amount: Number(inst.amount || 0),
                dueDate: inst.due_date || inc.due_date || '',
                paidDate: inst.paid_date || undefined,
                status: inst.status || 'pending',
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
              status: inc.status === 'paid' ? 'paid' : inc.status === 'overdue' ? 'overdue' : 'pending',
            });
          }
          totalFromIncomes += Number(inc.total_amount || 0);
        }
        payments.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

        const budgetTotal = Number(finances?.total_agreed || 0) || totalFromIncomes;
        const budgetPaid = Number(finances?.total_collected || 0) || paidFromInstallments;

        // Determine next payment
        const nextPending = payments.find(p => p.status !== 'paid');
        const nextPayment = nextPending
          ? { amount: nextPending.amount, dueDate: nextPending.dueDate, concept: nextPending.concept }
          : undefined;

        // Map tasks for the ProjectTasks component
        const portalTasks: PortalTask[] = tasks.map(t => ({
          id: t.id,
          title: t.title || 'Untitled',
          completed: !!t.completed,
          completedAt: t.completed_at || undefined,
          startDate: t.start_date || undefined,
          dueDate: t.due_date || undefined,
          groupName: t.group_name || 'General',
          status: t.status || undefined,
          priority: t.priority || undefined,
        }));

        // Map projects for the project selector
        const portalProjects: PortalProject[] = allProjects.map(p => ({
          id: p.id,
          title: p.title || 'Untitled Project',
          status: p.status || undefined,
        }));

        const dashboard: DashboardData = {
          progress,
          startDate,
          etaDate,
          onTrack: true,
          budget: {
            total: budgetTotal,
            paid: budgetPaid,
            nextPayment,
            payments,
          },
          milestones: milestones.length ? milestones : [
            { id: 'm1', title: 'Project Start', description: 'Initial setup', status: 'current' }
          ],
          logs: logs.length ? logs : [
            { id: 'l1', timestamp: 'Today', message: 'Portal connected to live project data.' }
          ],
          assets: [...assets, ...fileAssets, ...projectFileAssets],
          credentials,
          tasks: portalTasks,
          projects: portalProjects,
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
  }, [user, clientIdParam, projectIdParam, selectedProjectId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading portal...</div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Portal Unavailable</h2>
          <p className="text-sm text-zinc-500 mb-6">{error || 'No portal data found.'}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#2C0405] text-white rounded-xl text-sm font-medium hover:bg-[#1a0203] transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleProjectSwitch = (newProjectId: string) => {
    setSelectedProjectId(newProjectId);
    // Update URL param without page reload
    const url = new URL(window.location.href);
    url.searchParams.set('projectId', newProjectId);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <PortalApp
      initialData={data}
      projectTitle={projectTitle}
      projectSubtitle={projectSubtitle}
      clientLogo={clientLogo}
      forceOnboarded
      disableLoading
      hideCreatorToggle
      clientId={clientId}
      clientName={clientName}
      clientEmail={clientEmail}
      onLogout={handleLogout}
      onProjectSwitch={handleProjectSwitch}
      selectedProjectId={selectedProjectId || data.projects?.[0]?.id}
    />
  );
};
