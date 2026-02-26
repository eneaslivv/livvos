
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  MessageSquare,
  UserCog,
  Eye,
  LogOut
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
    nextPayment: { amount: 32500, dueDate: '2026-03-01', concept: 'Entrega Fase 3' },
    payments: [
      { id: 'p1', concept: 'Anticipo inicial', amount: 73500, dueDate: '2026-02-01', paidDate: '2026-02-01', status: 'paid', number: 1 },
      { id: 'p2', concept: 'Entrega Fase 1 — Backend', amount: 48750, dueDate: '2026-02-10', paidDate: '2026-02-10', status: 'paid', number: 2 },
      { id: 'p3', concept: 'Entrega Fase 2 — Integraciones', amount: 57750, dueDate: '2026-02-20', paidDate: '2026-02-22', status: 'paid', number: 3 },
      { id: 'p4', concept: 'Entrega Fase 3 — Frontend', amount: 32500, dueDate: '2026-03-01', status: 'pending', number: 4 },
      { id: 'p5', concept: 'Entrega Final + QA', amount: 32500, dueDate: '2026-03-15', status: 'pending', number: 5 },
    ],
  },
  milestones: [
    { id: '1', title: 'Arquitectura', description: 'Diseño del sistema y configuración de infraestructura.', status: 'completed', owner: 'team' },
    { id: '2', title: 'Desarrollo Backend', description: 'APIs, base de datos y lógica de negocio.', status: 'completed', owner: 'team' },
    { id: '3', title: 'Diseño & Frontend', description: 'Interfaz de usuario, diseño visual y experiencia.', status: 'current', owner: 'team', eta: 'Mar 5' },
    { id: '4', title: 'Revisión del Cliente', description: 'Aprobación de diseño y funcionalidad antes de QA.', status: 'future', owner: 'client', clientAction: 'Revisar y aprobar los entregables' },
    { id: '5', title: 'Testing & Lanzamiento', description: 'Pruebas finales y despliegue a producción.', status: 'future', owner: 'team', eta: 'Mar 15' },
  ],
  logs: [
    { id: '1', timestamp: 'Hoy', message: 'Se completó el módulo de autenticación y roles de usuario', type: 'milestone' },
    { id: '2', timestamp: 'Ayer', message: 'Nuevo diseño del dashboard aprobado por el equipo', type: 'update' },
    { id: '3', timestamp: 'Feb 22', message: 'Pago de $32,500 recibido — Fase 2', type: 'payment' },
    { id: '4', timestamp: 'Feb 20', message: 'Integración con pasarela de pagos finalizada', type: 'delivery' },
    { id: '5', timestamp: 'Feb 18', message: 'Esperando aprobación del logo final por parte del cliente', type: 'review' },
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
  onLogout
}) => {
  const [data, setData] = useState<DashboardData>(initialData || INITIAL_DATA);
  const [projectTitle, setProjectTitle] = useState(projectTitleProp || "Mi Proyecto");
  const [projectSubtitle, setProjectSubtitle] = useState(projectSubtitleProp || "");
  const [isOnboarded, setIsOnboarded] = useState(forceOnboarded);
  const [loading, setLoading] = useState(!disableLoading);
  const [clientLogo, setClientLogo] = useState<string | null>(clientLogoProp || null);
  const [mode, setMode] = useState<'client' | 'creator'>('client');

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

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
      <div className="h-screen w-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs text-zinc-400 font-medium">Cargando portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 selection:bg-indigo-100">
      {/* Creator Toggle */}
      {!hideCreatorToggle && (
        <div className="fixed bottom-6 left-6 z-[100]">
          <button
            onClick={() => setMode(mode === 'client' ? 'creator' : 'client')}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-full hover:bg-indigo-600 transition-all text-[10px] font-semibold"
          >
            {mode === 'client' ? <UserCog size={14} /> : <Eye size={14} />}
            {mode === 'client' ? 'Modo Editor' : 'Vista Cliente'}
          </button>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3.5">
            {clientLogo ? (
              <img src={clientLogo} alt="" className="w-10 h-10 rounded-xl object-cover border border-zinc-200" />
            ) : (
              <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white font-bold text-base">
                {(clientName || projectTitle).charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">{projectTitle}</h1>
              {projectSubtitle && (
                <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{projectSubtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {clientName && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200/80 rounded-lg mr-1">
                <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center text-white font-semibold text-[10px]">
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-medium text-zinc-500">{clientName}</span>
              </div>
            )}
            {mode === 'creator' && (
              <button
                onClick={() => setIsCreatorOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-all text-[10px] font-semibold"
              >
                <Settings size={13} />
                Configurar
              </button>
            )}
            <button
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all text-[11px] font-semibold"
            >
              <MessageSquare size={14} />
              <span className="hidden sm:inline">Soporte</span>
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 bg-white border border-zinc-200/80 rounded-lg hover:bg-red-50 hover:border-red-200 transition-all text-zinc-400 hover:text-red-500"
                title="Salir"
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

              {/* Row 2: Combined Resources (Finance + Access + Docs) */}
              <div className="md:col-span-12">
                <ResourcesPanel
                  credentials={data.credentials}
                  assets={data.assets}
                  budget={data.budget}
                />
              </div>

              {/* Row 3: Activity */}
              <div className="md:col-span-12">
                <SystemLogs logs={data.logs} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="mt-10 text-center pb-10">
          <p className="text-[10px] text-zinc-300 font-medium">
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
