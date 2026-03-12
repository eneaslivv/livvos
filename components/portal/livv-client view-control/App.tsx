
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  MessageSquare,
  UserCog,
  Eye,
  LogOut,
  Moon,
  Sun
} from 'lucide-react';
import { DashboardData } from './types';

// Components
import TimelinePulse from './components/TimelinePulse';
import LiveRoadmap from './components/LiveRoadmap';
import InvestmentTracker from './components/InvestmentTracker';
import Vault from './components/Vault';
import LegalAssets from './components/LegalAssets';
import ResourcesPanel from './components/ResourcesPanel';
import SystemLogs from './components/SystemLogs';
import ProjectTasks from './components/ProjectTasks';
import Onboarding from './components/Onboarding';
import ChatSupport from './components/ChatSupport';
import PreferencesPanel from './components/PreferencesPanel';
import CreatorPanel from './components/CreatorPanel';

const INITIAL_DATA: DashboardData = {
  progress: 74,
  startDate: "Feb 1, 2026",
  etaDate: "Mar 15, 2026",
  onTrack: true,
  budget: {
    total: 245000,
    paid: 180000,
    nextPayment: { amount: 32500, dueDate: '2026-03-01', concept: 'Phase 3 Delivery' },
    payments: [
      { id: 'p1', concept: 'Initial Deposit', amount: 73500, dueDate: '2026-02-01', paidDate: '2026-02-01', status: 'paid', number: 1 },
      { id: 'p2', concept: 'Phase 1 Delivery — Backend', amount: 48750, dueDate: '2026-02-10', paidDate: '2026-02-10', status: 'paid', number: 2 },
      { id: 'p3', concept: 'Phase 2 Delivery — Integrations', amount: 57750, dueDate: '2026-02-20', paidDate: '2026-02-22', status: 'paid', number: 3 },
      { id: 'p4', concept: 'Phase 3 Delivery — Frontend', amount: 32500, dueDate: '2026-03-01', status: 'pending', number: 4 },
      { id: 'p5', concept: 'Final Delivery + QA', amount: 32500, dueDate: '2026-03-15', status: 'pending', number: 5 },
    ],
  },
  milestones: [
    { id: '1', title: 'Architecture', description: 'System design and infrastructure setup.', status: 'completed', owner: 'team' },
    { id: '2', title: 'Backend Development', description: 'APIs, database and business logic.', status: 'completed', owner: 'team' },
    { id: '3', title: 'Design & Frontend', description: 'User interface, visual design and experience.', status: 'current', owner: 'team', eta: 'Mar 5' },
    { id: '4', title: 'Client Review', description: 'Design and functionality approval before QA.', status: 'future', owner: 'client', clientAction: 'Review and approve deliverables' },
    { id: '5', title: 'Testing & Launch', description: 'Final testing and deployment to production.', status: 'future', owner: 'team', eta: 'Mar 15' },
  ],
  logs: [
    { id: '1', timestamp: 'Today', message: 'Authentication module and user roles completed', type: 'milestone' },
    { id: '2', timestamp: 'Yesterday', message: 'New dashboard design approved by the team', type: 'update' },
    { id: '3', timestamp: 'Feb 22', message: 'Payment of $32,500 received — Phase 2', type: 'payment' },
    { id: '4', timestamp: 'Feb 20', message: 'Payment gateway integration completed', type: 'delivery' },
    { id: '5', timestamp: 'Feb 18', message: 'Awaiting final logo approval from the client', type: 'review' },
  ]
};

interface ClientPortalAppProps {
  initialData?: DashboardData;
  projectTitle?: string;
  projectSubtitle?: string;
  clientLogo?: string | null;
  forceOnboarded?: boolean;
  disableLoading?: boolean;
  hideCreatorToggle?: boolean;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  onLogout?: () => void;
  onProjectSwitch?: (projectId: string) => void;
  selectedProjectId?: string;
  hiddenResourceTabs?: ('finance' | 'access' | 'docs')[];
  roleBadge?: React.ReactNode;
  hideSupport?: boolean;
}

const App: React.FC<ClientPortalAppProps> = ({
  initialData,
  projectTitle: projectTitleProp,
  projectSubtitle: projectSubtitleProp,
  clientLogo: clientLogoProp,
  forceOnboarded = true,
  disableLoading = true,
  hideCreatorToggle = true,
  clientId,
  clientName,
  clientEmail,
  onLogout,
  onProjectSwitch,
  selectedProjectId,
  hiddenResourceTabs,
  roleBadge,
  hideSupport
}) => {
  const [data, setData] = useState<DashboardData>(initialData || INITIAL_DATA);
  const [projectTitle, setProjectTitle] = useState(projectTitleProp || "My Project");
  const [projectSubtitle, setProjectSubtitle] = useState(projectSubtitleProp || "");
  const [isOnboarded, setIsOnboarded] = useState(forceOnboarded);
  const [loading, setLoading] = useState(!disableLoading);
  const [clientLogo, setClientLogo] = useState<string | null>(clientLogoProp || null);
  const [mode, setMode] = useState<'client' | 'creator'>('client');

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  // Dark mode
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('portal-theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('portal-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('portal-theme', 'light');
    }
  }, [isDark]);

  useEffect(() => { if (disableLoading) { setLoading(false); return; } const t = setTimeout(() => setLoading(false), 1500); return () => clearTimeout(t); }, [disableLoading]);
  useEffect(() => { if (initialData) setData(initialData); }, [initialData]);
  useEffect(() => { if (projectTitleProp) setProjectTitle(projectTitleProp); }, [projectTitleProp]);
  useEffect(() => { if (projectSubtitleProp) setProjectSubtitle(projectSubtitleProp); }, [projectSubtitleProp]);
  useEffect(() => { if (clientLogoProp) setClientLogo(clientLogoProp); }, [clientLogoProp]);
  useEffect(() => { if (forceOnboarded) setIsOnboarded(true); }, [forceOnboarded]);

  const handleOnboardingComplete = (logo?: string) => { if (logo) setClientLogo(logo); setIsOnboarded(true); };
  const handleUpdateData = (newData: Partial<DashboardData>) => setData(prev => ({ ...prev, ...newData }));

  if (loading) {
    return (
      <div className="h-screen w-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 selection:bg-indigo-100 dark:selection:bg-indigo-900/40 transition-colors duration-300">
      {/* Creator Toggle */}
      {!hideCreatorToggle && (
        <div className="fixed bottom-6 left-6 z-[100]">
          <button
            onClick={() => setMode(mode === 'client' ? 'creator' : 'client')}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-full hover:opacity-90 transition-all text-[10px] font-semibold"
            style={{ backgroundColor: '#2C0405' }}
          >
            {mode === 'client' ? <UserCog size={14} /> : <Eye size={14} />}
            {mode === 'client' ? 'Editor Mode' : 'Client View'}
          </button>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3.5">
            {clientLogo ? (
              <img src={clientLogo} alt="" className="w-10 h-10 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700" />
            ) : (
              <div className="w-10 h-10 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center text-white dark:text-zinc-900 font-bold text-base">
                {(clientName || projectTitle).charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{projectTitle}</h1>
              {projectSubtitle && (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">{projectSubtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all text-zinc-400 dark:text-zinc-300"
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {/* Project selector — only if multiple projects */}
            {data.projects && data.projects.length > 1 && (
              <select
                value={selectedProjectId || data.projects[0]?.id || ''}
                onChange={(e) => onProjectSwitch?.(e.target.value)}
                className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl px-3 py-2 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-300 transition-all cursor-pointer mr-1"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                }}
              >
                {data.projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            )}
            {clientName && (
              <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 rounded-full mr-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-semibold text-[10px]" style={{ backgroundColor: '#2C0405' }}>
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{clientName}</span>
              </div>
            )}
            {roleBadge}
            {mode === 'creator' && (
              <button
                onClick={() => setIsCreatorOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-white rounded-full hover:opacity-90 transition-all text-[10px] font-semibold"
                style={{ backgroundColor: '#2C0405' }}
              >
                <Settings size={13} />
                Configure
              </button>
            )}
            {!hideSupport && (
              <button
                onClick={() => setIsChatOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-white rounded-full hover:opacity-90 transition-all text-[11px] font-semibold"
                style={{ backgroundColor: '#2C0405' }}
              >
                <MessageSquare size={14} />
                <span className="hidden sm:inline">Support</span>
              </button>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60 rounded-full hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-800/50 transition-all text-zinc-400 dark:text-zinc-300 hover:text-red-500"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>

        {/* Dashboard */}
        <AnimatePresence mode="wait">
          {!isOnboarded ? (
            <Onboarding onComplete={handleOnboardingComplete} />
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-4"
            >
              {/* Row 1: Progress + Roadmap */}
              <div className="md:col-span-7">
                <TimelinePulse data={data} />
              </div>
              <div className="md:col-span-5">
                <LiveRoadmap milestones={data.milestones} />
              </div>

              {/* Row 2: Tasks by Stage */}
              {data.tasks && data.tasks.length > 0 && (
                <div className="md:col-span-12">
                  <ProjectTasks tasks={data.tasks} />
                </div>
              )}

              {/* Row 3: Combined Resources (Finance + Access + Docs) */}
              {!(hiddenResourceTabs && hiddenResourceTabs.length >= 3) && (
                <div className="md:col-span-12">
                  <ResourcesPanel
                    credentials={data.credentials}
                    assets={data.assets}
                    budget={data.budget}
                    allProjectsBudget={data.allProjectsBudget}
                    hiddenTabs={hiddenResourceTabs}
                  />
                </div>
              )}

              {/* Row 3: Activity */}
              <div className="md:col-span-12">
                <SystemLogs logs={data.logs} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="mt-10 text-center pb-10">
          <p className="text-[10px] text-zinc-300 dark:text-zinc-700 font-medium">
            Powered by Livv &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isChatOpen && <ChatSupport onClose={() => setIsChatOpen(false)} clientId={clientId} clientName={clientName} />}
        {isConfigOpen && <PreferencesPanel onClose={() => setIsConfigOpen(false)} />}
        {isCreatorOpen && mode === 'creator' && (
          <CreatorPanel
            data={data} title={projectTitle} subtitle={projectSubtitle}
            onUpdateTitle={setProjectTitle} onUpdateSubtitle={setProjectSubtitle}
            onUpdateData={handleUpdateData} onUpdateLogo={setClientLogo}
            onClose={() => setIsCreatorOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
