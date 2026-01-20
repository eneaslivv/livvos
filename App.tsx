import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DebugPanel } from './components/DebugPanel';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Projects } from './pages/Projects';
import { Docs } from './pages/Docs';
import { Calendar } from './pages/Calendar';
import { Clients } from './pages/Clients';

import { Activity } from './pages/Activity';
import { Sales } from './pages/Sales';
import { Team } from './pages/Team';
import { PageView, AppMode } from './types';
import { ensureAuthSession } from './lib/auth';
import { Auth } from './pages/Auth';
import { AcceptInvite } from './pages/AcceptInvite';
import { TenantSettings } from './pages/TenantSettings';
import { supabase } from './lib/supabase';
import { ClientsProvider } from './context/ClientsContext';
import { CalendarProvider } from './context/CalendarContext';
import { DocumentsProvider } from './context/DocumentsContext';
import { ProjectsProvider } from './context/ProjectsContext';
import { RBACProvider, useRBAC } from './context/RBACContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { TeamProvider } from './context/TeamContext';
import { TenantProvider } from './context/TenantContext';

// Protected Route Wrapper
const ProtectedRoute: React.FC<{
  permission?: { module: any, action: any };
  children: React.ReactNode;
}> = ({ permission, children }) => {
  const { hasPermission } = useRBAC();

  if (permission && !hasPermission(permission.module, permission.action)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-4">
          <span className="text-2xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Access Restricted</h2>
        <p className="text-zinc-500 mt-2">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
};

const AppContent: React.FC<{
  currentPage: PageView;
  appMode: AppMode;
  handleNavigate: (p: PageView) => void;
  handleSwitchMode: (m: AppMode) => void;
  showDebug: boolean;
}> = ({ currentPage, appMode, handleNavigate, handleSwitchMode, showDebug }) => {

  const renderPage = () => {
    try {
      console.log('🎨 Renderizando página:', currentPage);

      switch (currentPage) {
        // OS Pages
        case 'home':
          return <Home onNavigate={handleNavigate} />;
        case 'projects':
          return <ProtectedRoute permission={{ module: 'projects', action: 'view' }}><Projects /></ProtectedRoute>;
        case 'clients':
          return <ProtectedRoute permission={{ module: 'team', action: 'view' }}><Clients /></ProtectedRoute>;
        case 'team':
          return <ProtectedRoute permission={{ module: 'team', action: 'view' }}><Team /></ProtectedRoute>;
        case 'calendar':
          return <ProtectedRoute permission={{ module: 'calendar', action: 'view' }}><Calendar /></ProtectedRoute>;

        case 'docs':
          return <ProtectedRoute permission={{ module: 'documents', action: 'view' }}><Docs /></ProtectedRoute>;
        case 'activity':
          return <ProtectedRoute permission={{ module: 'activity', action: 'view' }}><Activity onNavigate={handleNavigate} /></ProtectedRoute>;

        // Sales Pages - Passing specific views
        case 'sales_dashboard':
          return <ProtectedRoute permission={{ module: 'sales', action: 'view_dashboard' }}><Sales view="crm" onNavigate={handleNavigate} /></ProtectedRoute>;
        case 'sales_leads':
          return <ProtectedRoute permission={{ module: 'sales', action: 'view_leads' }}><Sales view="inbox" onNavigate={handleNavigate} /></ProtectedRoute>;
        case 'sales_analytics':
          return <ProtectedRoute permission={{ module: 'sales', action: 'view_analytics' }}><Sales view="analytics" onNavigate={handleNavigate} /></ProtectedRoute>;
        case 'tenant_settings':
          return <TenantSettings />;

        default:
          console.warn('⚠️ Página no encontrada:', currentPage);
          return <Home onNavigate={handleNavigate} />;
      }
    } catch (error) {
      console.error('❌ Error en renderPage:', error);
      throw error;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      currentMode={appMode}
      onNavigate={handleNavigate}
      onSwitchMode={handleSwitchMode}
    >
      {renderPage()}
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

  // Logging de navegación para debugging
  useEffect(() => {
    console.log('🧭 Navegación cambiada:', {
      currentPage,
      appMode,
      timestamp: new Date().toISOString()
    });
  }, [currentPage, appMode]);

  // Ensure auth
  useEffect(() => {
    if (isInvite) return;

    ensureAuthSession()
    supabase.auth.getSession().then(res => setIsAuthenticated(!!res.data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthenticated(!!session)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [isInvite])

  // Detectar tecla D para debug
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        setShowDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
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
    return <AcceptInvite />;
  }

  if (!isAuthenticated) {
    return <Auth onAuthenticated={() => setIsAuthenticated(true)} />
  }

  return (
    <ErrorBoundary>
      <RBACProvider>
        <TenantProvider>
          <NotificationsProvider>
            <TeamProvider>
              <ClientsProvider>
                <CalendarProvider>
                  <DocumentsProvider>
                    <ProjectsProvider>
                      <AppContent
                        currentPage={currentPage}
                        appMode={appMode}
                        handleNavigate={handleNavigate}
                        handleSwitchMode={handleSwitchMode}
                        showDebug={showDebug}
                      />
                      <DebugPanel visible={showDebug} />
                    </ProjectsProvider>
                  </DocumentsProvider>
                </CalendarProvider>
              </ClientsProvider>
            </TeamProvider>
          </NotificationsProvider>
        </TenantProvider>
      </RBACProvider>
    </ErrorBoundary>
  );
};

export default App;
