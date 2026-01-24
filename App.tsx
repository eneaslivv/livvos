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

// Updated Context Providers with security and enhanced features
import { RBACProvider, useRBAC } from './context/RBACContext';
import { TenantProvider } from './context/TenantContext';
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
          return (
            <ProtectedRoute permission={{ module: 'projects', action: 'view' }}>
              <Projects />
            </ProtectedRoute>
          );
        case 'clients':
          return (
            <ProtectedRoute permission={{ module: 'team', action: 'view' }}>
              <Clients />
            </ProtectedRoute>
          );
        case 'team':
          return (
            <ProtectedRoute permission={{ module: 'team', action: 'view' }}>
              <Team />
            </ProtectedRoute>
          );
        case 'calendar':
          return (
            <ProtectedRoute permission={{ module: 'calendar', action: 'view' }}>
              <Calendar />
            </ProtectedRoute>
          );

        case 'docs':
          return (
            <ProtectedRoute permission={{ module: 'documents', action: 'view' }}>
              <Docs />
            </ProtectedRoute>
          );
        case 'activity':
          return (
            <ProtectedRoute permission={{ module: 'activity', action: 'view' }}>
              <Activity onNavigate={handleNavigate} />
            </ProtectedRoute>
          );

        // Sales Pages - Passing specific views
        case 'sales_dashboard':
          return (
            <ProtectedRoute permission={{ module: 'sales', action: 'view_dashboard' }}>
              <Sales view="crm" onNavigate={handleNavigate} />
            </ProtectedRoute>
          );
        case 'sales_leads':
          return (
            <ProtectedRoute permission={{ module: 'sales', action: 'view_leads' }}>
              <Sales view="inbox" onNavigate={handleNavigate} />
            </ProtectedRoute>
          );
        case 'sales_analytics':
          return (
            <ProtectedRoute permission={{ module: 'sales', action: 'view_analytics' }}>
              <Sales view="analytics" onNavigate={handleNavigate} />
            </ProtectedRoute>
          );
        case 'tenant_settings':
          return (
            <ProtectedRoute role="owner">
              <TenantSettings />
            </ProtectedRoute>
          );

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
        setIsAuthenticated(!!session);

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
    return <AcceptInvite />;
  }

  if (!isAuthenticated) {
    return <Auth onAuthenticated={() => setIsAuthenticated(true)} />;
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