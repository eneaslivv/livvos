
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  MessageSquare,
  Activity,
  UserCog,
  Eye,
  Share2
} from 'lucide-react';
import { DashboardData, Milestone } from './types';

// Components
import TimelinePulse from './components/TimelinePulse';
import LiveRoadmap from './components/LiveRoadmap';
import InvestmentTracker from './components/InvestmentTracker';
import Vault from './components/Vault';
import LegalAssets from './components/LegalAssets';
import SystemLogs from './components/SystemLogs';
import Onboarding from './components/Onboarding';
import ChatSupport from './components/ChatSupport';
import PreferencesPanel from './components/PreferencesPanel';
import CreatorPanel from './components/CreatorPanel';
import ClientTasks from './components/ClientTasks';
import ClientMessages from './components/ClientMessages';

const INITIAL_DATA: DashboardData = {
  progress: 74,
  startDate: "Oct 12, 2023",
  etaDate: "Jan 15, 2024",
  onTrack: true,
  budget: {
    total: 245000,
    paid: 180000,
  },
  milestones: [
    { id: '1', title: 'Phase 0: Architecture', description: 'Core system design and cloud infra provisioning.', status: 'completed' },
    { id: '2', title: 'Phase 1: Secure Core', description: 'Zero Knowledge Proof implementation and testing.', status: 'completed' },
    { id: '3', title: 'Phase 2: UI Engineering', description: 'Building the luxury frontend and high-speed API layers.', status: 'current' },
    { id: '4', title: 'Phase 3: Stress Testing', description: 'Performance auditing and penetration testing.', status: 'future' },
    { id: '5', title: 'Phase 4: Global Rollout', description: 'Production deployment to multi-region nodes.', status: 'future' },
  ],
  logs: [
    { id: '1', timestamp: '10:45 AM', message: 'Mainnet deployment protocol initialized by Core Team' },
    { id: '2', timestamp: 'Yesterday', message: 'Liquidity pools synchronized with Treasury system' },
    { id: '3', timestamp: 'Nov 20', message: 'New security patch v4.2.1 applied to Vault environment' },
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
}

const App: React.FC<ClientPortalAppProps> = ({
  initialData,
  projectTitle: projectTitleProp,
  projectSubtitle: projectSubtitleProp,
  clientLogo: clientLogoProp,
  forceOnboarded = true,
  disableLoading = true,
  hideCreatorToggle = true
}) => {
  const [data, setData] = useState<DashboardData>(initialData || INITIAL_DATA);
  const [projectTitle, setProjectTitle] = useState(projectTitleProp || "MISSION CONTROL");
  const [projectSubtitle, setProjectSubtitle] = useState(projectSubtitleProp || "AETHELGARD CLOUD / LIVV-X-9982");
  const [isOnboarded, setIsOnboarded] = useState(forceOnboarded ? true : false);
  const [loading, setLoading] = useState(disableLoading ? false : true);
  const [clientLogo, setClientLogo] = useState<string | null>(clientLogoProp || null);
  const [mode, setMode] = useState<'client' | 'creator'>(hideCreatorToggle ? 'client' : 'client');
  
  // Feature states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  useEffect(() => {
    if (disableLoading) {
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [disableLoading]);

  useEffect(() => {
    if (initialData) setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (projectTitleProp) setProjectTitle(projectTitleProp);
  }, [projectTitleProp]);

  useEffect(() => {
    if (projectSubtitleProp) setProjectSubtitle(projectSubtitleProp);
  }, [projectSubtitleProp]);

  useEffect(() => {
    if (clientLogoProp) setClientLogo(clientLogoProp);
  }, [clientLogoProp]);

  useEffect(() => {
    if (forceOnboarded) setIsOnboarded(true);
  }, [forceOnboarded]);

  const handleOnboardingComplete = (logo?: string) => {
    if (logo) setClientLogo(logo);
    setIsOnboarded(true);
  };

  const handleUpdateData = (newData: Partial<DashboardData>) => {
    setData(prev => ({ ...prev, ...newData }));
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#ede5d8] flex flex-col items-center justify-center">
        <div className="relative">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
            className="w-20 h-20 border border-brand-dark/10 rounded-full flex items-center justify-center"
          >
            <div className="w-10 h-10 border-2 border-brand-accent rounded-lg animate-pulse-soft" />
          </motion.div>
        </div>
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 text-center"
        >
          <h2 className="mono text-[10px] text-brand-dark/40 uppercase tracking-[0.5em] mb-2 font-bold">Synchronizing Client Access</h2>
          <p className="text-brand-accent text-[8px] uppercase tracking-widest font-black italic">LIVV PROTOCOL v2.4</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#ede5d8] selection:bg-brand-accent/20">
      {/* Creator Floating Toggle */}
      {!hideCreatorToggle && (
        <div className="fixed bottom-8 left-8 z-[100]">
          <button 
            onClick={() => setMode(mode === 'client' ? 'creator' : 'client')}
            className="flex items-center gap-3 px-6 py-4 bg-brand-dark text-brand-light rounded-full shadow-2xl hover:bg-brand-accent transition-all group"
          >
            {mode === 'client' ? <UserCog size={18} /> : <Eye size={18} />}
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {mode === 'client' ? 'Enter Creator Mode' : 'Exit Creator Mode'}
            </span>
          </button>
        </div>
      )}

      <div className="max-w-[1500px] mx-auto p-4 md:p-12 lg:p-16">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-16 gap-8 border-b border-brand-dark/5 pb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="w-10 h-10 bg-brand-dark rounded-xl flex items-center justify-center text-brand-light font-black text-lg shadow-2xl shadow-brand-dark/20 relative z-10 border-2 border-brand-cream">L</div>
                {clientLogo && (
                   <motion.div 
                    initial={{ x: -10, opacity: 0 }} 
                    animate={{ x: 0, opacity: 1 }}
                    className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center overflow-hidden border-2 border-brand-cream shadow-xl z-20"
                   >
                     <img src={clientLogo} alt="Client Logo" className="w-full h-full object-cover" />
                   </motion.div>
                )}
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-brand-dark uppercase">{projectTitle}</h1>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-brand-dark/40 text-[10px] uppercase tracking-[0.4em] mono font-bold">
                {projectSubtitle}
              </p>
              <div className="flex items-center gap-2 px-3 py-1 bg-white border border-brand-dark/5 rounded-full">
                <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />
                <span className="text-[9px] mono font-bold uppercase tracking-widest opacity-60">Status: Optimal</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {mode === 'creator' && (
              <button 
                onClick={() => setIsCreatorOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-brand-accent text-white rounded-2xl hover:shadow-xl hover:shadow-brand-accent/20 transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <Settings size={14} />
                <span>Configure Client View</span>
              </button>
            )}
            <button 
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-brand-dark/10 rounded-2xl hover:bg-brand-grey transition-all text-[10px] font-bold uppercase tracking-widest text-brand-dark"
            >
              <Settings size={14} className="opacity-50" />
              <span>Preferences</span>
            </button>
            <button 
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-2 px-8 py-3 bg-brand-accent text-brand-light rounded-2xl hover:shadow-xl hover:shadow-brand-accent/20 transition-all text-[10px] font-black uppercase tracking-[0.2em]"
            >
              <MessageSquare size={14} />
              <span>Priority Support</span>
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {!isOnboarded ? (
            <Onboarding onComplete={handleOnboardingComplete} />
          ) : (
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { 
                  opacity: 1,
                  transition: { staggerChildren: 0.12 }
                }
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-8"
            >
              <div className="md:col-span-8 lg:col-span-8">
                <TimelinePulse data={data} />
              </div>
              <div className="md:col-span-4 lg:col-span-4">
                <LiveRoadmap milestones={data.milestones} />
              </div>
              <div className="md:col-span-6 lg:col-span-4">
                <InvestmentTracker budget={data.budget} />
              </div>
              <div className="md:col-span-6 lg:col-span-4">
                <Vault credentials={data.credentials} />
              </div>
              <div className="md:col-span-12 lg:col-span-4">
                <LegalAssets assets={data.assets} />
              </div>
              {(data.tasks && data.tasks.length > 0) && (
                <div className="md:col-span-6">
                  <ClientTasks tasks={data.tasks} />
                </div>
              )}
              {(data.messages && data.messages.length > 0) && (
                <div className="md:col-span-6">
                  <ClientMessages messages={data.messages} />
                </div>
              )}
              {(data.tasks && data.tasks.length > 0 && (!data.messages || data.messages.length === 0)) && (
                <div className="md:col-span-6" />
              )}
              <div className="md:col-span-12">
                <SystemLogs logs={data.logs} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-24 flex flex-col items-center gap-6">
          <div className="h-[1px] w-24 bg-brand-dark/10" />
          <div className="text-center pb-16">
            <p className="text-brand-dark/30 text-[9px] uppercase tracking-[0.6em] font-black mb-3">
              LIVV ENGINEERING SOLUTIONS &copy; 2024
            </p>
            <div className="flex items-center gap-4 justify-center opacity-20">
              <div className="w-1.5 h-1.5 bg-brand-dark rounded-full" />
              <div className="w-1.5 h-1.5 bg-brand-dark rounded-full" />
              <div className="w-1.5 h-1.5 bg-brand-dark rounded-full" />
            </div>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {isChatOpen && (
          <ChatSupport onClose={() => setIsChatOpen(false)} />
        )}
        {isConfigOpen && (
          <PreferencesPanel onClose={() => setIsConfigOpen(false)} />
        )}
        {isCreatorOpen && mode === 'creator' && (
          <CreatorPanel 
            data={data}
            title={projectTitle}
            subtitle={projectSubtitle}
            onUpdateTitle={setProjectTitle}
            onUpdateSubtitle={setProjectSubtitle}
            onUpdateData={handleUpdateData}
            onUpdateLogo={setClientLogo}
            onClose={() => setIsCreatorOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
