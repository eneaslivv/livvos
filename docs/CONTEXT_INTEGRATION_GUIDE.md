# Context Integration Guide

## Overview

This guide provides comprehensive instructions for integrating and working with the eneas-os context provider system. The enhanced contexts support multi-tenant SaaS operations with robust security, analytics, and agent orchestration.

## Quick Start

### 1. Basic Usage

```tsx
import React from 'react';
import { 
  useRBAC, 
  useTenant, 
  useNotifications,
  useAnalytics 
} from './contexts';

function MyComponent() {
  const { hasPermission } = useRBAC();
  const { hasFeature } = useTenant();
  const { createNotification } = useNotifications();
  const { trackPageView } = useAnalytics();

  // Check permissions
  const canEdit = hasPermission('projects', 'edit');
  
  // Check tenant features
  const analyticsEnabled = hasFeature('analytics');
  
  // Create notification
  const notifyUser = () => {
    createNotification({
      type: 'system',
      title: 'Welcome!',
      message: 'You have access to this feature',
      priority: 'medium',
      action_required: false,
      category: 'welcome'
    });
  };

  // Track page view
  useEffect(() => {
    trackPageView('/my-component');
  }, []);

  return (
    <div>
      {canEdit && <button>Edit</button>}
      {analyticsEnabled && <Analytics />}
    </div>
  );
}
```

### 2. Protected Routes

```tsx
import { ProtectedRoute } from './components';

function AppRoutes() {
  return (
    <Routes>
      <Route 
        path="/projects" 
        element={
          <ProtectedRoute permission={{ module: 'projects', action: 'view' }}>
            <Projects />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute role="admin">
            <AdminPanel />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}
```

## Context-Specific Integrations

### RBACContext - Authentication & Authorization

#### Permission Checking
```tsx
function SecureComponent() {
  const { hasPermission, hasRole, isAdmin, checkAccess } = useRBAC();

  // Direct permission check
  const canView = hasPermission('projects', 'view');
  
  // Role check
  const isManager = hasRole('manager');
  
  // Admin check
  const canManage = isAdmin();
  
  // Detailed access check
  const { allowed, reason } = checkAccess('projects', 'delete');
  
  if (!allowed) {
    return <AccessDenied reason={reason} />;
  }
  
  return <ProjectManagement />;
}
```

#### Role Management
```tsx
function RoleManagement() {
  const { 
    createRole, 
    updateRole, 
    deleteRole, 
    assignRoleToUser,
    getUserRoles 
  } = useRBAC();

  const handleCreateRole = async () => {
    try {
      const newRole = await createRole({
        name: 'custom-role',
        description: 'A custom role',
        is_system: false
      });
      
      console.log('Role created:', newRole);
    } catch (error) {
      console.error('Failed to create role:', error);
    }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    await assignRoleToUser(userId, roleId);
  };

  return <RoleManagementUI onCreateRole={handleCreateRole} />;
}
```

### TenantContext - Multi-Tenant Configuration

#### Feature Management
```tsx
function FeatureToggle() {
  const { 
    hasFeature, 
    updateFeatures, 
    isWithinResourceLimit,
    getResourceUsage 
  } = useTenant();

  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    setAiEnabled(hasFeature('ai_assistant'));
  }, [hasFeature]);

  const toggleFeature = async () => {
    await updateFeatures({ ai_assistant: !aiEnabled });
  };

  // Check resource limits
  const storageUsage = getResourceUsage('max_storage_mb');
  const canUploadFile = isWithinResourceLimit('max_storage_mb');

  return (
    <div>
      <label>
        <input 
          type="checkbox" 
          checked={aiEnabled} 
          onChange={toggleFeature} 
        />
        Enable AI Assistant
      </label>
      
      <StorageUsage usage={storageUsage} />
      
      {!canUploadFile && (
        <Alert>Storage limit reached. Please upgrade your plan.</Alert>
      )}
    </div>
  );
}
```

#### Branding Management
```tsx
function BrandingManager() {
  const { branding, updateBranding } = useTenant();

  const updateColors = async (primaryColor: string) => {
    await updateBranding({
      colors: {
        ...branding.colors,
        primary: primaryColor
      }
    });
  };

  return (
    <div>
      <h2>{branding.name}</h2>
      <ColorPicker 
        color={branding.colors.primary}
        onChange={updateColors}
      />
    </div>
  );
}
```

### SecurityContext - Security & Credential Management

#### Credential Management
```tsx
function CredentialManager() {
  const { 
    createCredential, 
    getCredentials, 
    deleteCredential,
    checkCredentialAccess 
  } = useSecurity();

  const handleCreateCredential = async (type: string, data: any) => {
    try {
      const credential = await createCredential({
        type,
        name: `${type} Service`,
        data,
        project_id: 'project-id' // Optional
      });
      
      console.log('Credential created and encrypted:', credential);
    } catch (error) {
      console.error('Failed to create credential:', error);
    }
  };

  const canAccessCredential = async (credentialId: string) => {
    return await checkCredentialAccess(credentialId);
  };

  return (
    <CredentialForm onSubmit={handleCreateCredential} />
  );
}
```

### NotificationsContext - Real-time Communication

#### Advanced Notifications
```tsx
function NotificationCenter() {
  const { 
    notifications, 
    unreadCount,
    createNotification,
    createBatchNotification,
    bulkMarkAsRead,
    getNotificationsByType 
  } = useNotifications();

  const handleSystemAlert = async () => {
    await createNotification({
      type: 'security',
      title: 'Security Alert',
      message: 'Suspicious activity detected',
      priority: 'urgent',
      action_required: true,
      action_url: '/security',
      action_text: 'Review Activity',
      category: 'security'
    });
  };

  const handleBatchNotification = async () => {
    await createBatchNotification({
      title: 'System Maintenance',
      message: 'Scheduled maintenance tonight',
      priority: 'high',
      action_required: true,
      category: 'maintenance'
    }, ['user-1', 'user-2', 'user-3']);
  };

  const securityNotifications = getNotificationsByType('security');

  return (
    <div>
      <Badge count={unreadCount}>
        <NotificationIcon />
      </Badge>
      
      <NotificationList notifications={notifications} />
      
      <button onClick={handleSystemAlert}>
        Send Security Alert
      </button>
    </div>
  );
}
```

### AnalyticsContext - Metrics and Insights

#### Analytics Integration
```tsx
function AnalyticsDashboard() {
  const { 
    trackPageView, 
    recordMetric, 
    calculateKPIs,
    getAnalytics,
    generateReport 
  } = useAnalytics();

  // Track page views
  useEffect(() => {
    trackPageView('/analytics-dashboard');
  }, []);

  // Record custom metrics
  const recordUserAction = async (action: string) => {
    await recordMetric(`user_${action}`, 1, 'count', {
      page: '/analytics-dashboard',
      timestamp: new Date().toISOString()
    });
  };

  // Generate KPI report
  const generateKPIReport = async () => {
    const kpis = await calculateKPIs();
    console.log('Current KPIs:', kpis);
  };

  // Export analytics data
  const exportData = async () => {
    const report = await generateReport('monthly', '2024-01-01', '2024-01-31');
    const blob = await exportData('csv', report);
    
    // Download file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analytics-report.csv';
    a.click();
  };

  return (
    <Dashboard>
      <KPICards onRefresh={generateKPIReport} />
      <AnalyticsChart />
      <ExportButton onExport={exportData} />
    </Dashboard>
  );
}
```

### SystemContext - System Operations

#### System Monitoring
```tsx
function SystemDashboard() {
  const { 
    systemHealth, 
    agents, 
    executeSkill,
    getAgentStatus,
    runSystemDiagnostics 
  } = useSystem();

  const handleSkillExecution = async (agentId: string, skill: string) => {
    try {
      const execution = await executeSkill(agentId, skill, {
        userId: 'current-user',
        timestamp: Date.now()
      });
      
      console.log('Skill execution started:', execution);
    } catch (error) {
      console.error('Skill execution failed:', error);
    }
  };

  const runDiagnostics = async () => {
    const diagnostics = await runSystemDiagnostics();
    console.log('System diagnostics:', diagnostics);
  };

  return (
    <div>
      <HealthStatus status={systemHealth?.status} />
      
      <AgentStatus agents={agents} />
      
      <button onClick={() => handleSkillExecution('project-agent', 'create-project')}>
        Execute Project Creation
      </button>
      
      <button onClick={runDiagnostics}>
        Run Diagnostics
      </button>
    </div>
  );
}
```

## Performance Integration

### Performance Monitoring
```tsx
import { usePerformanceMonitor, PerformanceBoundary } from './lib/performanceMonitor';

function MyPerformanceComponent() {
  const { measureFunction, startTiming, endTiming, getSummary } = usePerformanceMonitor('MyComponent');

  const handleHeavyOperation = async () => {
    await measureFunction('heavy-operation', async () => {
      // Simulate heavy work
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'Operation completed';
    });
  };

  const handleTimedOperation = () => {
    const timing = startTiming('timed-operation');
    // Do work
    setTimeout(() => {
      endTiming(timing);
    }, 500);
  };

  return (
    <PerformanceBoundary contextName="MyComponent">
      <button onClick={handleHeavyOperation}>
        Heavy Operation
      </button>
      <button onClick={handleTimedOperation}>
        Timed Operation
      </button>
      
      <PerformanceMetrics summary={getSummary()} />
    </PerformanceBoundary>
  );
}
```

## Security Best Practices

### 1. Permission Checking
```tsx
// ✅ Good: Specific permission checks
function EditButton({ projectId }) {
  const { hasPermission } = useRBAC();
  
  if (!hasPermission('projects', 'edit')) {
    return null;
  }
  
  return <button>Edit Project</button>;
}

// ❌ Bad: Bypassing permissions
function BadEditButton({ projectId }) {
  return <button>Edit Project</button>; // No permission check!
}
```

### 2. Data Access
```tsx
// ✅ Good: Tenant-aware queries
function TenantProjectList() {
  const { currentTenant } = useTenant();
  
  const fetchProjects = async () => {
    // Automatically filtered by tenant_id through RLS
    const { data } = await supabase
      .from('projects')
      .select('*');
    
    return data;
  };
}

// ❌ Bad: Cross-tenant data access
function BadProjectList() {
  const fetchProjects = async () => {
    // Danger: Could access other tenants' data
    const { data } = await supabase
      .from('projects')
      .select('*')
      .neq('tenant_id', 'current-tenant-id'); // Bypassing RLS!
    
    return data;
  };
}
```

### 3. Error Handling
```tsx
// ✅ Good: Proper error boundaries and logging
function SecureComponent() {
  const { logSecurityEvent } = useSecurity();
  
  const handleAction = async () => {
    try {
      await sensitiveOperation();
    } catch (error) {
      // Log security events
      await logSecurityEvent('operation_failed', {
        operation: 'sensitive_operation',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error; // Re-throw for UI handling
    }
  };
}

// ❌ Bad: Silent failures
function BadSecureComponent() {
  const handleAction = async () => {
    try {
      await sensitiveOperation();
    } catch (error) {
      // Swallowing security-related errors
      console.error(error);
    }
  };
}
```

## Testing Integration

### 1. Context Testing
```tsx
import { renderHook, act } from '@testing-library/react';
import { RBACProvider, useRBAC } from './contexts';

function TestWrapper({ children }) {
  return (
    <RBACProvider>
      {children}
    </RBACProvider>
  );
}

describe('RBAC Integration', () => {
  it('should check permissions correctly', async () => {
    const { result } = renderHook(() => useRBAC(), {
      wrapper: TestWrapper
    });

    // Test permission checking
    expect(result.current.hasPermission('projects', 'view')).toBe(false);
    
    // Simulate login
    await act(async () => {
      // Mock login logic
    });

    // Test after login
    expect(result.current.hasPermission('projects', 'view')).toBe(true);
  });
});
```

### 2. Performance Testing
```tsx
import { measurePerformance } from './tests/context-utils';

describe('Performance Tests', () => {
  it('should load contexts within acceptable time', async () => {
    const performance = await measurePerformance(async () => {
      // Render all contexts
      render(<App />);
    }, 5);

    expect(performance.average).toBeLessThan(100); // Less than 100ms
  });
});
```

## Migration Guide

### From Previous Context System
1. **Update imports**: Use new context providers
2. **Add permission checks**: Implement RBAC calls
3. **Add tenant filtering**: Ensure proper tenant isolation
4. **Update error handling**: Use new error boundaries
5. **Add performance monitoring**: Wrap components with performance boundaries

### Database Schema Updates
1. **Add tenant_id columns**: For multi-tenant support
2. **Add audit tables**: For security logging
3. **Add analytics tables**: For metrics tracking
4. **Add system tables**: For health monitoring

## Troubleshooting

### Common Issues

#### 1. Permission Errors
```tsx
// Check if RBAC is initialized
const { isInitialized } = useRBAC();
if (!isInitialized) {
  return <Loading />;
}
```

#### 2. Tenant Access Issues
```tsx
// Verify tenant is loaded
const { currentTenant } = useTenant();
if (!currentTenant) {
  return <Error>No tenant assigned</Error>;
}
```

#### 3. Performance Issues
```tsx
// Use performance boundaries
<PerformanceBoundary contextName="MyComponent">
  <MyComponent />
</PerformanceBoundary>
```

### Debug Tools
```tsx
// Enable debug panel (Ctrl+D in development)
// Check context state in browser console
window.debugContexts = {
  rbac: useRBAC(),
  tenant: useTenant(),
  security: useSecurity(),
  // ... other contexts
};
```

## Advanced Patterns

### 1. Context Composition
```tsx
function useComposedLogic() {
  const rbac = useRBAC();
  const tenant = useTenant();
  const notifications = useNotifications();

  return {
    canCreateProject: rbac.hasPermission('projects', 'create') && 
                    tenant.hasFeature('projects'),
    notifyProjectCreated: (projectId: string) => 
      notifications.createNotification({
        type: 'project',
        title: 'Project Created',
        message: `Project ${projectId} has been created`,
        priority: 'medium',
        action_required: false,
        category: 'projects'
      })
  };
}
```

### 2. Optimistic Updates
```tsx
function OptimisticProjectList() {
  const { projects, createProject } = useProjects();
  const [optimisticProjects, setOptimisticProjects] = useState(projects);

  const handleCreateProject = async (projectData) => {
    // Optimistic update
    const tempId = 'temp-' + Date.now();
    const optimisticProject = { ...projectData, id: tempId };
    setOptimisticProjects(prev => [optimisticProject, ...prev]);

    try {
      const realProject = await createProject(projectData);
      // Replace optimistic with real
      setOptimisticProjects(prev => 
        prev.map(p => p.id === tempId ? realProject : p)
      );
    } catch (error) {
      // Rollback optimistic update
      setOptimisticProjects(prev => 
        prev.filter(p => p.id !== tempId)
      );
    }
  };

  return <ProjectList projects={optimisticProjects} />;
}
```

### 3. Real-time Synchronization
```tsx
function RealTimeDashboard() {
  const { subscribeToNotifications } = useNotifications();
  const { subscribeToProjects } = useProjects();

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribeNotifications = subscribeToNotifications();
    const unsubscribeProjects = subscribeToProjects();

    return () => {
      unsubscribeNotifications();
      unsubscribeProjects();
    };
  }, []);

  return <DashboardContent />;
}
```

This integration guide provides comprehensive patterns and examples for working with the enhanced eneas-os context system. Follow these patterns to ensure secure, performant, and maintainable code.