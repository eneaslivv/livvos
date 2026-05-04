import React, { useState, useEffect, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DebugPanel } from './components/DebugPanel';
import { Layout } from './components/Layout';
import { PageView, AppMode, NavParams } from './types';
import { ensureAuthSession } from './lib/auth';
import { supabase, cleanupLocalStorage } from './lib/supabase';

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
import { PresenceProvider } from './context/PresenceContext';
import { LiveCursors } from './components/presence/LiveCursors';
import { NotificationToaster } from './components/NotificationToaster';
import { retryDynamicImport, isChunkLoadError, clearChunkReloadFlag } from './lib/lazyWithRetry';

const loadHome = () => retryDynamicImport(() => import('./pages/Home').then(m => ({ default: m.Home })), 'Home');
const loadProjects = () => retryDynamicImport(() => import('./pages/Projects').then(m => ({ default: m.Projects })), 'Projects');
const loadDocs = () => retryDynamicImport(() => import('./pages/Docs').then(m => ({ default: m.Docs })), 'Docs');
const loadCalendar = () => retryDynamicImport(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })), 'Calendar');
const loadClients = () => retryDynamicImport(() => import('./pages/Clients').then(m => ({ default: m.Clients })), 'Clients');
const loadTeamClients = () => retryDynamicImport(() => import('./pages/TeamClients').then(m => ({ default: m.TeamClients })), 'TeamClients');
const loadActivity = () => retryDynamicImport(() => import('./pages/Activity').then(m => ({ default: m.Activity })), 'Activity');
const loadSales = () => retryDynamicImport(() => import('./pages/Sales').then(m => ({ default: m.Sales })), 'Sales');
const loadFinance = () => retryDynamicImport(() => import('./pages/Finance').then(m => ({ default: m.Finance })), 'Finance');
const loadTeam = () => retryDynamicImport(() => import('./pages/Team').then(m => ({ default: m.Team })), 'Team');
const loadAuth = () => retryDynamicImport(() => import('./pages/Auth').then(m => ({ default: m.Auth })), 'Auth');
const loadAcceptInvite = () => retryDynamicImport(() => import('./pages/AcceptInvite').then(m => ({ default: m.AcceptInvite })), 'AcceptInvite');
const loadAcceptConnection = () => retryDynamicImport(() => import('./pages/AcceptConnection').then(m => ({ default: m.AcceptConnection })), 'AcceptConnection');
const loadTenantSettings = () => retryDynamicImport(() => import('./pages/TenantSettings').then(m => ({ default: m.TenantSettings })), 'TenantSettings');
const loadProposalPublic = () => retryDynamicImport(() => import('./pages/ProposalPublic').then(m => ({ default: m.ProposalPublic })), 'ProposalPublic');
const loadClientPortal = () => retryDynamicImport(() => import('./pages/ClientPortal').then(m => ({ default: m.ClientPortal })), 'ClientPortal');
const loadGoogleCallback = () => retryDynamicImport(() => import('./pages/GoogleCallback').then(m => ({ default: m.GoogleCallback })), 'GoogleCallback');
const loadAcceptProjectShare = () => retryDynamicImport(() => import('./pages/AcceptProjectShare').then(m => ({ default: m.AcceptProjectShare })), 'AcceptProjectShare');
const loadSharedProjectView = () => retryDynamicImport(() => import('./pages/SharedProjectView').then(m => ({ default: m.SharedProjectView })), 'SharedProjectView');
const loadPublicPortalView = () => retryDynamicImport(() => import('./pages/PublicPortalView').then(m => ({ default: m.PublicPortalView })), 'PublicPortalView');
const loadSharedDocument = () => retryDynamicImport(() => import('./pages/SharedDocument').then(m => ({ default: m.SharedDocument })), 'SharedDocument');
const loadContentCms = () => retryDynamicImport(() => import('./pages/ContentCms').then(m => ({ default: m.ContentCms })), 'ContentCms');
const loadPlatformAdmin = () => retryDynamicImport(() => import('./pages/PlatformAdmin').then(m => ({ default: m.PlatformAdmin })), 'PlatformAdmin');

const Home = React.lazy(loadHome);
const Projects = React.lazy(loadProjects);
const Docs = React.lazy(loadDocs);
const Calendar = React.lazy(loadCalendar);
const TeamClients = React.lazy(loadTeamClients);
const Activity = React.lazy(loadActivity);
const Sales = React.lazy(loadSales);
const Finance = React.lazy(loadFinance);
const Auth = React.lazy(loadAuth);
const AcceptInvite = React.lazy(loadAcceptInvite);
const AcceptConnection = React.lazy(loadAcceptConnection);
const TenantSettings = React.lazy(loadTenantSettings);
const ProposalPublic = React.lazy(loadProposalPublic);
const ClientPortal = React.lazy(loadClientPortal);
const GoogleCallback = React.lazy(loadGoogleCallback);
const AcceptProjectShare = React.lazy(loadAcceptProjectShare);
const SharedProjectView = React.lazy(loadSharedProjectView);
const PublicPortalView = React.lazy(loadPublicPortalView);
const SharedDocument = React.lazy(loadSharedDocument);
const ContentCms = React.lazy(loadContentCms);
const PlatformAdmin = React.lazy(loadPlatformAdmin);

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
  feature?: string;
  children: React.ReactNode;
}> = ({ permission, role, feature, children }) => {
  const { hasPermission, hasRole, user, isInitialized } = useRBAC();
  const { hasFeature } = useTenant();

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

  // Check feature gating
  if (feature && !hasFeature(feature as any)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-4">
          <span className="text-2xl">~</span>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">No disponible</h2>
        <p className="text-zinc-500 mt-2">Esta funcionalidad no esta incluida en tu plan actual.</p>
        <p className="text-zinc-400 text-sm mt-1">Contacta al administrador para habilitarla.</p>
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

// Per-page error boundary with retry support
class PageErrorBoundary extends React.Component<
  { page: string; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { page: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(`[${this.props.page}] ErrorBoundary:`, error, info.componentStack);
    }
    // Stale-chunk recovery: after a deploy, old dynamic chunks 404. Force a
    // hard cache-busting reload, but throttle it (one per 30s window) so
    // consecutive failures don't loop AND a NEW deploy in the same tab
    // still triggers a fresh recovery instead of giving up.
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const key = `__chunk_reload__:page:${this.props.page}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      const tooRecent = last && Date.now() - last < 30_000;
      if (!tooRecent) {
        sessionStorage.setItem(key, String(Date.now()));
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('_v', String(Date.now()));
          window.location.replace(url.toString());
        } catch {
          window.location.reload();
        }
      }
    }
  }
  componentDidMount() {
    // Clear our throttle on a clean mount — the page loaded successfully,
    // so the NEXT deploy's first stale-chunk error should reload again.
    clearChunkReloadFlag(this.props.page);
  }
  componentDidUpdate(_prev: Readonly<{ page: string; children: React.ReactNode }>, prevState: Readonly<{ hasError: boolean }>) {
    if (prevState.hasError && !this.state.hasError) {
      clearChunkReloadFlag(this.props.page);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full mb-3">
            <span className="text-xl">!</span>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Error loading {this.props.page}</h3>
          <p className="text-sm text-zinc-500 mt-1">Something went wrong in this section.</p>
          {import.meta.env.DEV && this.state.error && (
            <p className="text-xs text-red-500 mt-1 font-mono max-w-md truncate">{this.state.error.message}</p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm rounded-lg transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Keep-alive page slot: mounts once, stays mounted, hidden via CSS when inactive.
// Each page gets its own ErrorBoundary so a crash in one doesn't bring down the app.
const KeepAlivePage: React.FC<{
  page: PageView;
  active: boolean;
  children: React.ReactNode;
}> = ({ page, active, children }) => (
  <div style={active ? undefined : { display: 'none' }}>
    <PageErrorBoundary page={page}>
      <Suspense fallback={getSkeletonForPage(page)}>
        {children}
      </Suspense>
    </PageErrorBoundary>
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
  handleNavigate: (p: PageView, params?: NavParams) => void;
  handleSwitchMode: (m: AppMode) => void;
  showDebug: boolean;
  navParams: NavParams | null;
}> = ({ currentPage, appMode, handleNavigate, handleSwitchMode, showDebug, navParams }) => {
  const { isInitialized, hasRole } = useRBAC();
  const { isLoading: tenantLoading, currentTenant, isViewingAsTenant } = useTenant();

  // Safety timeout: force ready after 8s to avoid permanent skeleton
  const [forceReady, setForceReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isInitialized || tenantLoading) {
        if (import.meta.env.DEV) console.warn('[AppContent] Force-ready after timeout — RBAC/Tenant took too long');
        setForceReady(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Wait for both RBAC + Tenant before rendering pages
  const isReady = (isInitialized && !tenantLoading && !!currentTenant) || forceReady;

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
        loadContentCms,
      ].forEach(loader => loader());
    });
  }, []);

  // For client_portal, no Layout wrapper — skip RBAC/Tenant wait entirely
  if (currentPage === 'client_portal') {
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
      navParams={navParams}
      onNavigate={handleNavigate}
      onSwitchMode={handleSwitchMode}
    >
      {!isReady ? (
        getSkeletonForPage(currentPage)
      ) : (
        <>
          {/* Platform Admin: Viewing as another tenant banner */}
          {isViewingAsTenant && (
            <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Viewing as: <span className="font-bold">{currentTenant?.name}</span>
              </p>
              <button
                onClick={async () => {
                  await supabase.rpc('platform_return_to_home_tenant')
                  window.location.reload()
                }}
                className="px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-800 rounded-lg hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
              >
                Return to Home
              </button>
            </div>
          )}

          {/* Home */}
          {visitedPages.has('home') && (
            <KeepAlivePage page="home" active={currentPage === 'home'}>
              <Home onNavigate={handleNavigate} />
            </KeepAlivePage>
          )}

          {/* Projects */}
          {visitedPages.has('projects') && (
            <KeepAlivePage page="projects" active={currentPage === 'projects'}>
              <ProtectedRoute permission={{ module: 'projects', action: 'view' }} feature="projects_module">
                <Projects navProjectId={navParams?.projectId} />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Team / Clients (shared TeamClients component) */}
          {hasVisitedTeamClients && (
            <KeepAlivePage page="clients" active={isTeamClientsActive}>
              <ProtectedRoute permission={{ module: 'team', action: 'view' }} feature="team_management">
                <TeamClients initialTab={getTeamClientsTab(currentPage)} onNavigate={handleNavigate} />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Calendar */}
          {visitedPages.has('calendar') && (
            <KeepAlivePage page="calendar" active={currentPage === 'calendar'}>
              <ProtectedRoute permission={{ module: 'calendar', action: 'view' }} feature="calendar_integration">
                <Calendar />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Docs */}
          {visitedPages.has('docs') && (
            <KeepAlivePage page="docs" active={currentPage === 'docs'}>
              <ProtectedRoute permission={{ module: 'documents', action: 'view' }} feature="documents_module">
                <Docs />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Activity */}
          {visitedPages.has('activity') && (
            <KeepAlivePage page="activity" active={currentPage === 'activity'}>
              <ProtectedRoute permission={{ module: 'activity', action: 'view' }}>
                <Activity />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Finance */}
          {visitedPages.has('finance') && (
            <KeepAlivePage page="finance" active={currentPage === 'finance'}>
              <ProtectedRoute permission={{ module: 'finance', action: 'view' }} feature="finance_module">
                <Finance />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Sales (shared Sales component with dynamic view) */}
          {hasVisitedSales && (
            <KeepAlivePage page="sales_dashboard" active={isSalesActive}>
              <ProtectedRoute permission={{ module: 'sales', action: 'view_dashboard' }} feature="sales_module">
                <Sales view={getSalesView(currentPage)} onNavigate={handleNavigate} />
              </ProtectedRoute>
            </KeepAlivePage>
          )}

          {/* Content CMS */}
          {visitedPages.has('content_cms') && (
            <KeepAlivePage page="content_cms" active={currentPage === 'content_cms'}>
              <ProtectedRoute role="owner">
                <ContentCms onNavigate={handleNavigate} />
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

          {/* Platform Admin */}
          {visitedPages.has('platform_admin') && (
            <KeepAlivePage page="platform_admin" active={currentPage === 'platform_admin'}>
              <PlatformAdmin />
            </KeepAlivePage>
          )}
        </>
      )}
    </Layout>
  );
};

// Run cleanup again at App module load (supabase.ts already runs it once at import)
cleanupLocalStorage();

const LAST_PAGE_KEY = 'eneas:lastPage';
const LAST_MODE_KEY = 'eneas:lastMode';
const VALID_PAGES: ReadonlySet<PageView> = new Set<PageView>([
  'home', 'projects', 'clients', 'team', 'team_clients', 'calendar', 'docs',
  'activity', 'finance', 'sales_dashboard', 'sales_leads', 'sales_analytics',
  'tenant_settings', 'client_portal', 'shared_project', 'content_cms', 'platform_admin',
]);

const readLastPage = (): PageView => {
  try {
    const stored = window.localStorage.getItem(LAST_PAGE_KEY);
    if (stored && VALID_PAGES.has(stored as PageView)) return stored as PageView;
  } catch {}
  return 'home';
};

const readLastMode = (): AppMode => {
  try {
    const stored = window.localStorage.getItem(LAST_MODE_KEY);
    if (stored === 'os' || stored === 'sales') return stored;
  } catch {}
  return 'os';
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageView>(readLastPage);
  const [appMode, setAppMode] = useState<AppMode>(readLastMode);
  const [showDebug, setShowDebug] = useState(false);
  const [navParams, setNavParams] = useState<NavParams | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Check for invite URL
  const isInvite = window.location.pathname === '/accept-invite';
  const isAcceptConnection = window.location.pathname === '/accept-connection';
  const proposalToken = new URLSearchParams(window.location.search).get('proposal');
  const portalFlag = new URLSearchParams(window.location.search).get('portal');
  const sharedProjectToken = new URLSearchParams(window.location.search).get('shared_project');
  const viewSharedProjectId = new URLSearchParams(window.location.search).get('view_shared_project');
  const publicPortalToken = new URLSearchParams(window.location.search).get('public_portal');
  const sharedDocMatch = window.location.hash.match(/^#shared-doc\/(.+)$/);
  const sharedDocToken = sharedDocMatch ? sharedDocMatch[1] : null;
  // Google OAuth callback detection
  const urlParams = new URLSearchParams(window.location.search);
  const googleCode = urlParams.get('code');
  const googleScope = urlParams.get('scope');
  const isGoogleCallback = !!(googleCode && googleScope?.includes('calendar'));

  // Logging de navegación para debugging
  useEffect(() => {
    if (import.meta.env.DEV) console.log('Navigation changed:', {
      currentPage,
      appMode,
      timestamp: new Date().toISOString()
    });
  }, [currentPage, appMode]);

  // Persistir página y modo para que F5 mantenga la ubicación
  useEffect(() => {
    try { window.localStorage.setItem(LAST_PAGE_KEY, currentPage); } catch {}
  }, [currentPage]);
  useEffect(() => {
    try { window.localStorage.setItem(LAST_MODE_KEY, appMode); } catch {}
  }, [appMode]);

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
          try {
            window.localStorage.removeItem(LAST_PAGE_KEY);
            window.localStorage.removeItem(LAST_MODE_KEY);
          } catch {}
        }

        // Log auth state changes for security monitoring + activity feed.
        // logUserSignIn is idempotent — it only fires on true fresh sign-ins
        // (last_sign_in_at within 60s) and dedupes via sessionStorage, so
        // page reloads don't inflate the count.
        if (_event === 'SIGNED_IN') {
          if (import.meta.env.DEV) console.log('User signed in:', session?.user?.email);
          // Defer a tick so the profile row is settled before the insert.
          setTimeout(() => {
            import('./lib/activity').then(m => m.logUserSignIn(session)).catch(() => {});
          }, 250);
        } else if (_event === 'SIGNED_OUT') {
          if (import.meta.env.DEV) console.log('User signed out');
          import('./lib/activity').then(m => m.logUserSignOut()).catch(() => {});
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
    if (import.meta.env.DEV) console.log('Switching mode:', mode);
    setAppMode(mode);
    if (mode === 'sales') {
      setCurrentPage('sales_dashboard');
    } else {
      setCurrentPage('home');
    }
  };

  // Handle Navigation with error handling
  const handleNavigate = (page: PageView, params?: NavParams) => {
    try {
      if (import.meta.env.DEV) console.log('Navigating to:', page, params);
      setCurrentPage(page);
      setNavParams(params || null);
    } catch (error) {
      console.error('❌ Error al navegar:', error);
    }
  };

  // Clear navParams after target page consumes them
  useEffect(() => {
    if (navParams) {
      const timer = setTimeout(() => setNavParams(null), 150);
      return () => clearTimeout(timer);
    }
  }, [navParams]);

  if (isInvite) {
    return (
      <Suspense fallback={<PageFallback />}>
        <AcceptInvite />
      </Suspense>
    );
  }

  if (isAcceptConnection) {
    return (
      <Suspense fallback={<PageFallback />}>
        <AcceptConnection />
      </Suspense>
    );
  }

  if (sharedDocToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <SharedDocument token={sharedDocToken} />
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

  if (sharedProjectToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <AcceptProjectShare
          token={sharedProjectToken}
          onAccepted={(projectId: string) => {
            window.history.replaceState({}, '', `?view_shared_project=${projectId}`);
            window.location.reload();
          }}
        />
      </Suspense>
    );
  }

  if (publicPortalToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <PublicPortalView token={publicPortalToken} />
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

  if (viewSharedProjectId) {
    return (
      <Suspense fallback={<PageFallback />}>
        <SharedProjectView
          projectId={viewSharedProjectId}
          onClose={() => {
            window.history.replaceState({}, '', window.location.pathname);
            window.location.reload();
          }}
        />
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
                <PresenceProvider currentPage={currentPage}>
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
                                  navParams={navParams}
                                />
                                <NotificationToaster onNavigate={(p) => handleNavigate(p as PageView)} />
                                <LiveCursors currentPage={currentPage} />
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
                </PresenceProvider>
              </TeamProvider>
            </NotificationsProvider>
          </SecurityProvider>
        </RBACProvider>
      </TenantProvider>
    </ErrorBoundary>
  );
};

export default App;
