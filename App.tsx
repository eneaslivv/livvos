import React, { useState, useEffect, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DebugPanel } from './components/DebugPanel';
import { Layout } from './components/Layout';
import { PageView, AppMode } from './types';
import { ensureAuthSession } from './lib/auth';
import { supabase } from './lib/supabase';

// Updated Context Providers with security and enhanced features
import { RBACProvider, useRBAC } from './context/RBACContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { SecurityProvider } from './context/SecurityContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { TeamProvider } from './context/TeamContext';
import { ClientsProvider } from './context/ClientsContext';
import { CalendarProvider } from './context/CalendarContext';
import { DocumentsProvider } from './context/DocumentsContext';
import { FinanceProvider } from './context/FinanceContext';
import { ProjectsProvider } from './context/ProjectsContext';
import { AnalyticsProvider } from './context/AnalyticsContext';
import { SystemProvider } from './context/SystemContext';

const loadHome = () => import('./pages/Home').then(module => ({ default: module.Home }));
const loadProjects = () => import('./pages/Projects').then(module => ({ default: module.Projects }));
const loadDocs = () => import('./pages/Docs').then(module => ({ default: module.Docs }));
const loadCalendar = () => import('./pages/Calendar').then(module => ({ default: module.Calendar }));
const loadClients = () => import('./pages/Clients').then(module => ({ default: module.Clients }));
const loadTeamClients = () => import('./pages/TeamClients').then(module => ({ default: module.TeamClients }));
const loadActivity = () => import('./pages/Activity').then(module => ({ default: module.Activity }));
const loadSales = () => import('./pages/Sales').then(module => ({ default: module.Sales }));
const loadFinance = () => import('./pages/Finance').then(module => ({ default: module.Finance }));
const loadTeam = () => import('./pages/Team').then(module => ({ default: module.Team }));
const loadAuth = () => import('./pages/Auth').then(module => ({ default: module.Auth }));
const loadAcceptInvite = () => import('./pages/AcceptInvite').then(module => ({ default: module.AcceptInvite }));
const loadTenantSettings = () => import('./pages/TenantSettings').then(module => ({ default: module.TenantSettings }));
const loadProposalPublic = () => import('./pages/ProposalPublic').then(module => ({ default: module.ProposalPublic }));
const loadClientPortal = () => import('./pages/ClientPortal').then(module => ({ default: module.ClientPortal }));
const loadGoogleCallback = () => import('./pages/GoogleCallback').then(module => ({ default: module.GoogleCallback }));

const Home = React.lazy(loadHome);
const Projects = React.lazy(loadProjects);
const Docs = React.lazy(loadDocs);
const Calendar = React.lazy(loadCalendar);
const Clients = React.lazy(loadClients);
const TeamClients = React.lazy(loadTeamClients);
const Activity = React.lazy(loadActivity);
const Sales = React.lazy(loadSales);
const Finance = React.lazy(loadFinance);
const Team = React.lazy(loadTeam);
const Auth = React.lazy(loadAuth);
const AcceptInvite = React.lazy(loadAcceptInvite);
const TenantSettings = React.lazy(loadTenantSettings);
const ProposalPublic = React.lazy(loadProposalPublic);
const ClientPortal = React.lazy(loadClientPortal);
const GoogleCallback = React.lazy(loadGoogleCallback);

const scheduleIdle = (callback: () => void) => {
  if (typeof window === 'undefined') return;
  const idle = (window as any).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(callback, { timeout: 1500 });
  } else {
    setTimeout(callback, 400);
  }
};

const PageFallback = () => (
  <div className="flex items-center justify-center h-[calc(100vh-120px)]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-400"></div>
  </div>
);

const ContentSkeleton = () => (
  <div className="animate-pulse space-y-6 py-6">
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-3">
        <div className="h-4 w-40 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-10 w-72 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="h-9 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-8 space-y-6">
        <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-44 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="xl:col-span-4 space-y-5">
        <div className="h-32 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
  </div>
);

const ListSkeleton = () => (
  <div className="animate-pulse space-y-6 py-6">
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-9 w-56 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="h-9 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-16 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
  </div>
);

const ProjectsSkeleton = () => (
  <div className="animate-pulse py-6">
    <div className="flex gap-4">
      <div className="w-72 bg-zinc-200 dark:bg-zinc-800/70 rounded-xl p-4 space-y-3">
        <div className="h-4 w-24 rounded-full bg-zinc-300/80 dark:bg-zinc-700/70" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-14 rounded-lg bg-zinc-300/80 dark:bg-zinc-700/70" />
        ))}
      </div>
      <div className="flex-1 bg-zinc-200 dark:bg-zinc-800/70 rounded-xl overflow-hidden">
        <div className="px-8 py-6 border-b border-zinc-300/60 dark:border-zinc-700/60 space-y-3">
          <div className="h-4 w-32 rounded-full bg-zinc-300/80 dark:bg-zinc-700/70" />
          <div className="h-7 w-64 rounded-full bg-zinc-300/80 dark:bg-zinc-700/70" />
          <div className="h-4 w-48 rounded-full bg-zinc-300/80 dark:bg-zinc-700/70" />
        </div>
        <div className="px-8 py-4 border-b border-zinc-300/60 dark:border-zinc-700/60 flex gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-5 w-16 rounded-full bg-zinc-300/80 dark:bg-zinc-700/70" />
          ))}
        </div>
        <div className="p-8 grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <div className="h-32 rounded-xl bg-zinc-300/80 dark:bg-zinc-700/70" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-24 rounded-xl bg-zinc-300/80 dark:bg-zinc-700/70" />
              <div className="h-24 rounded-xl bg-zinc-300/80 dark:bg-zinc-700/70" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-44 rounded-xl bg-zinc-300/80 dark:bg-zinc-700/70" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DocsSkeleton = () => (
  <div className="animate-pulse py-6 space-y-6">
    <div className="flex items-center justify-between">
      <div className="space-y-3">
        <div className="h-6 w-40 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-4 w-64 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-10 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-10 w-36 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-10 w-36 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-28 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
  </div>
);

const TeamSkeleton = () => (
  <div className="animate-pulse py-6 space-y-6">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-6 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-4 w-44 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-9 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-9 w-9 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
        ))}
      </div>
      <div className="h-[520px] rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
  </div>
);

const ClientsSkeleton = () => (
  <div className="animate-pulse py-6 space-y-6">
    <div className="flex items-center justify-between">
      <div className="h-6 w-36 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      <div className="h-10 w-36 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-3">
        <div className="h-8 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
        ))}
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="h-44 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-72 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-52 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-52 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
  </div>
);

const ActivitySkeleton = () => (
  <div className="animate-pulse py-6 space-y-6">
    <div className="flex items-center justify-between">
      <div className="h-8 w-48 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      <div className="flex gap-2">
        <div className="h-8 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-8 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="flex gap-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-6 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="h-36 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
    <div className="space-y-6">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-4">
          <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-3/4 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
            <div className="h-3 w-1/2 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const FinanceSkeleton = () => (
  <div className="animate-pulse space-y-8 py-6">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
      <div className="space-y-3">
        <div className="h-3 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-12 w-80 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-4 w-64 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="flex gap-3">
        <div className="h-11 w-32 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-11 w-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
    <div className="h-12 w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-40 rounded-[2.5rem] bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 h-96 rounded-[3rem] bg-zinc-200 dark:bg-zinc-800/70" />
      <div className="h-96 rounded-[3rem] bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
  </div>
);

const AnalyticsPageSkeleton = () => (
  <div className="animate-pulse space-y-6 py-6">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-4 w-72 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-28 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-9 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
    </div>
    <div className="flex gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-8 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-24 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="h-64 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
      <div className="h-64 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
  </div>
);

const BoardSkeleton = () => (
  <div className="animate-pulse space-y-6 py-6">
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-3">
        <div className="h-4 w-36 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
        <div className="h-9 w-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      </div>
      <div className="h-9 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-[360px] rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
  </div>
);

const CalendarSkeleton = () => (
  <div className="animate-pulse space-y-6 py-6">
    <div className="flex items-center justify-between gap-4">
      <div className="h-9 w-56 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      <div className="h-9 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
    </div>
    <div className="grid grid-cols-7 gap-2">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="h-6 rounded-full bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="grid grid-cols-7 gap-2">
      {Array.from({ length: 35 }).map((_, index) => (
        <div key={index} className="h-24 rounded-xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
  </div>
);

const AnalyticsSkeleton = () => (
  <div className="animate-pulse space-y-6 py-6">
    <div className="h-9 w-52 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
      ))}
    </div>
    <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800/70" />
  </div>
);

const getSkeletonForPage = (page: PageView): React.ReactNode => {
  switch (page) {
    case 'home':
      return <ContentSkeleton />;
    case 'projects':
      return <ProjectsSkeleton />;
    case 'docs':
      return <DocsSkeleton />;
    case 'team':
      return <TeamSkeleton />;
    case 'clients':
      return <ClientsSkeleton />;
    case 'team_clients':
      return <TeamSkeleton />;
    case 'activity':
      return <ActivitySkeleton />;
    case 'finance':
      return <FinanceSkeleton />;
    case 'calendar':
      return <CalendarSkeleton />;
    case 'client_portal':
      return <ContentSkeleton />;
    case 'sales_dashboard':
    case 'sales_leads':
      return <BoardSkeleton />;
    case 'sales_analytics':
      return <AnalyticsSkeleton />;
    default:
      return <ContentSkeleton />;
  }
};

// Protected Route Wrapper with enhanced security
const ProtectedRoute: React.FC<{
  permission?: { module: any, action: any };
  role?: string;
  features?: string[];
  children: React.ReactNode;
}> = ({ permission, role, features, children }) => {
  const { hasPermission, hasRole, user, isInitialized } = useRBAC();

  // Wait for RBAC to be initialized
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Check if user is authenticated
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
          <span className="text-2xl">🔐</span>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Authentication Required</h2>
        <p className="text-zinc-500 mt-2">Please sign in to access this page.</p>
      </div>
    );
  }

  // Check role-based access
  if (role && !hasRole(role)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="p-4 bg-amber-100 dark:bg-amber-900 rounded-full mb-4">
          <span className="text-2xl">👤</span>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Role Required</h2>
        <p className="text-zinc-500 mt-2">You need {role} role to access this page.</p>
      </div>
    );
  }

  // Check permission-based access
  if (permission && !hasPermission(permission.module, permission.action)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-4">
          <span className="text-2xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Access Restricted</h2>
        <p className="text-zinc-500 mt-2">You don't have permission to view this page.</p>
        <p className="text-zinc-400 text-sm mt-1">
          Required: {permission.module}:{permission.action}
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

// Keep-alive page slot: mounts once, stays mounted, hidden via CSS when inactive
const KeepAlivePage: React.FC<{
  page: PageView;
  active: boolean;
  children: React.ReactNode;
}> = ({ page, active, children }) => (
  <div style={active ? undefined : { display: 'none' }}>
    <Suspense fallback={getSkeletonForPage(page)}>
      {children}
    </Suspense>
  </div>
);

// Resolve the current sales view from a PageView
const getSalesView = (page: PageView): 'crm' | 'inbox' | 'analytics' => {
  if (page === 'sales_leads') return 'inbox';
  if (page === 'sales_analytics') return 'analytics';
  return 'crm';
};

// Resolve which TeamClients tab to show
const getTeamClientsTab = (page: PageView): 'clients' | 'team' =>
  page === 'clients' ? 'clients' : 'team';

const AppContent: React.FC<{
  currentPage: PageView;
  appMode: AppMode;
  handleNavigate: (p: PageView) => void;
  handleSwitchMode: (m: AppMode) => void;
  showDebug: boolean;
}> = ({ currentPage, appMode, handleNavigate, handleSwitchMode, showDebug }) => {
  const { isInitialized, hasRole } = useRBAC();
  const { isLoading: tenantLoading, currentTenant } = useTenant();

  // Wait for both RBAC + Tenant before rendering pages
  const isReady = isInitialized && !tenantLoading && !!currentTenant;

  // Track which pages have been visited so we mount them lazily but keep them alive
  const [visitedPages, setVisitedPages] = useState<Set<string>>(() => new Set([currentPage]));

  useEffect(() => {
    setVisitedPages(prev => {
      if (prev.has(currentPage)) return prev;
      const next = new Set(prev);
      next.add(currentPage);
      return next;
    });
  }, [currentPage]);

  useEffect(() => {
    if (isReady && hasRole('client') && currentPage !== 'client_portal') {
      handleNavigate('client_portal');
    }
  }, [isReady, hasRole, currentPage, handleNavigate]);

  useEffect(() => {
    scheduleIdle(() => {
      [
        loadProjects,
        loadDocs,
        loadCalendar,
        loadClients,
        loadActivity,
        loadSales,
        loadFinance,
        loadTeam,
        loadTeamClients,
        loadTenantSettings,
        loadClientPortal,
      ].forEach(loader => loader());
    });
  }, []);

  // For client_portal, no Layout wrapper
  if (currentPage === 'client_portal') {
    if (!isReady) return getSkeletonForPage(currentPage);
    return (
      <Suspense fallback={getSkeletonForPage(currentPage)}>
        <ClientPortal />
      </Suspense>
    );
  }

  // Determine which "group" pages have been visited.
  // team/team_clients/clients share one TeamClients instance;
  // sales_dashboard/sales_leads/sales_analytics share one Sales instance.
  const hasVisitedTeamClients = visitedPages.has('clients') || visitedPages.has('team') || visitedPages.has('team_clients');
  const isTeamClientsActive = currentPage === 'clients' || currentPage === 'team' || currentPage === 'team_clients';

  const hasVisitedSales = visitedPages.has('sales_dashboard') || visitedPages.has('sales_leads') || visitedPages.has('sales_analytics');
  const isSalesActive = currentPage === 'sales_dashboard' || currentPage === 'sales_leads' || currentPage === 'sales_analytics';

  return (
    <Layout
      currentPage={currentPage}
      currentMode={appMode}
      onNavigate={handleNavigate}
      onSwitchMode={handleSwitchMode}
    >
      {!isReady ? (
        getSkeletonForPage(currentPage)
      ) : (
        <>
          {/* Home */}
          {visitedPages.has('home') && (
            <KeepAlivePage page="home" active={currentPage === 'home'}>
              <Home onNavigate={handleNavigate} />
            </KeepAlivePage>
          )}

          {/* Projects */}
          {visitedPages.has('projects') && (
            <KeepAlivePage page="projects" active={currentPage === 'projects'}>
              <ProtectedRoute permission={{ module: 'projects', action: 'view' }}>
                <Projects />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Team / Clients (shared TeamClients component) */}
          {hasVisitedTeamClients && (
            <KeepAlivePage page="clients" active={isTeamClientsActive}>
              <ProtectedRoute permission={{ module: 'team', action: 'view' }}>
                <TeamClients initialTab={getTeamClientsTab(currentPage)} />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Calendar */}
          {visitedPages.has('calendar') && (
            <KeepAlivePage page="calendar" active={currentPage === 'calendar'}>
              <ProtectedRoute permission={{ module: 'calendar', action: 'view' }}>
                <Calendar />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Docs */}
          {visitedPages.has('docs') && (
            <KeepAlivePage page="docs" active={currentPage === 'docs'}>
              <ProtectedRoute permission={{ module: 'documents', action: 'view' }}>
                <Docs />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Activity */}
          {visitedPages.has('activity') && (
            <KeepAlivePage page="activity" active={currentPage === 'activity'}>
              <ProtectedRoute permission={{ module: 'activity', action: 'view' }}>
                <Activity onNavigate={handleNavigate} />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Finance */}
          {visitedPages.has('finance') && (
            <KeepAlivePage page="finance" active={currentPage === 'finance'}>
              <ProtectedRoute permission={{ module: 'finance', action: 'view' }}>
                <Finance />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Sales (shared Sales component with dynamic view) */}
          {hasVisitedSales && (
            <KeepAlivePage page="sales_dashboard" active={isSalesActive}>
              <ProtectedRoute permission={{ module: 'sales', action: 'view_dashboard' }}>
                <Sales view={getSalesView(currentPage)} onNavigate={handleNavigate} />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Tenant Settings */}
          {visitedPages.has('tenant_settings') && (
            <KeepAlivePage page="tenant_settings" active={currentPage === 'tenant_settings'}>
              <ProtectedRoute role="owner">
                <TenantSettings />
              </ProtectedRoute>
            </KeepAlivePage>
          )}
        </>
      )}
    </Layout>
  );
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageView>('home');
  const [appMode, setAppMode] = useState<AppMode>('os');
  const [showDebug, setShowDebug] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Check for invite URL
  const isInvite = window.location.pathname === '/accept-invite';
  const proposalToken = new URLSearchParams(window.location.search).get('proposal');
  const portalFlag = new URLSearchParams(window.location.search).get('portal');
  // Google OAuth callback detection
  const urlParams = new URLSearchParams(window.location.search);
  const googleCode = urlParams.get('code');
  const googleScope = urlParams.get('scope');
  const isGoogleCallback = !!(googleCode && googleScope?.includes('calendar'));

  // Logging de navegación para debugging
  useEffect(() => {
    console.log('🧭 Navegación cambiada:', {
      currentPage,
      appMode,
      timestamp: new Date().toISOString()
    });
  }, [currentPage, appMode]);

  useEffect(() => {
    if (portalFlag === 'client') {
      setCurrentPage('client_portal');
      setAppMode('os');
    }
  }, [portalFlag]);

  // Ensure auth
  useEffect(() => {
    if (isInvite) return;

    const initializeAuth = async () => {
      try {
        await ensureAuthSession();
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session);
      } catch (error) {
        console.error('Error initializing auth:', error);
        setIsAuthenticated(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        // Only react to definitive auth events to avoid flash-unmounting
        // the entire app during background token refreshes
        if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
          setIsAuthenticated(true);
        } else if (_event === 'SIGNED_OUT') {
          setIsAuthenticated(false);
        }

        // Log auth state changes for security monitoring
        if (_event === 'SIGNED_IN') {
          console.log('🔓 User signed in:', session?.user?.email);
        } else if (_event === 'SIGNED_OUT') {
          console.log('🔒 User signed out');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [isInvite]);

  // Detectar tecla D para debug (only in development)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd' && process.env.NODE_ENV === 'development') {
        setShowDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // Handle Mode Switch (Reset page to default for that mode)
  const handleSwitchMode = (mode: AppMode) => {
    console.log('🔄 Cambiando modo:', mode);
    setAppMode(mode);
    if (mode === 'sales') {
      setCurrentPage('sales_dashboard');
    } else {
      setCurrentPage('home');
    }
  };

  // Handle Navigation with error handling
  const handleNavigate = (page: PageView) => {
    try {
      console.log('📍 Navegando a:', page);
      setCurrentPage(page);
    } catch (error) {
      console.error('❌ Error al navegar:', error);
    }
  };

  if (isInvite) {
    return (
      <Suspense fallback={<PageFallback />}>
        <AcceptInvite />
      </Suspense>
    );
  }

  if (proposalToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <ProposalPublic token={proposalToken} />
      </Suspense>
    );
  }

  if (isGoogleCallback && googleCode) {
    return (
      <Suspense fallback={<PageFallback />}>
        <GoogleCallback
          code={googleCode}
          onComplete={() => {
            window.history.replaceState({}, '', window.location.pathname);
            window.location.reload();
          }}
        />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Auth onAuthenticated={() => setIsAuthenticated(true)} isClientPortal={portalFlag === 'client'} />
      </Suspense>
    );
  }

  return (
    <ErrorBoundary>
      {/* Complete Context Provider Stack with proper ordering */}
      {/* Complete Context Provider Stack with proper ordering */}
      <TenantProvider>
        <RBACProvider>
          <SecurityProvider>
            <NotificationsProvider>
              <TeamProvider>
                <ClientsProvider>
                  <CalendarProvider>
                    <DocumentsProvider>
                      <FinanceProvider>
                        <ProjectsProvider>
                          <AnalyticsProvider>
                            <SystemProvider>
                              <AppContent
                                currentPage={currentPage}
                                appMode={appMode}
                                handleNavigate={handleNavigate}
                                handleSwitchMode={handleSwitchMode}
                                showDebug={showDebug}
                              />
                              {showDebug && (
                                <DebugPanel visible={showDebug} />
                              )}
                            </SystemProvider>
                          </AnalyticsProvider>
                        </ProjectsProvider>
                      </FinanceProvider>
                    </DocumentsProvider>
                  </CalendarProvider>
                </ClientsProvider>
              </TeamProvider>
            </NotificationsProvider>
          </SecurityProvider>
        </RBACProvider>
      </TenantProvider>
    </ErrorBoundary>
  );
};

export default App;
