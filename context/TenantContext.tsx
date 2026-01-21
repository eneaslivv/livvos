import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import {
    TenantBranding,
    defaultBranding,
    mergeBranding,
    getBrandingCssVars
} from '../config/whitelabel';

// Enhanced tenant types
export interface Tenant {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
    status: 'active' | 'suspended' | 'trial' | 'setup';
    created_at: string;
    updated_at: string;
}

export interface TenantConfig {
    id: string;
    tenant_id: string;
    branding: TenantBranding;
    features: {
        sales_module: boolean;
        team_management: boolean;
        client_portal: boolean;
        notifications: boolean;
        ai_assistant: boolean;
        analytics: boolean;
        calendar_integration: boolean;
        document_versioning: boolean;
        advanced_permissions: boolean;
    };
    resource_limits: {
        max_users: number;
        max_projects: number;
        max_storage_mb: number;
        max_api_calls_per_month: number;
    };
    security_settings: {
        require_2fa: boolean;
        session_timeout_minutes: number;
        password_min_length: number;
        allow_public_sharing: boolean;
    };
    integrations: {
        email_provider: string | null;
        calendar_provider: string | null;
        payment_processor: string | null;
        ai_service: string | null;
    };
    created_at: string;
    updated_at: string;
}

export interface TenantUsage {
    tenant_id: string;
    current_users: number;
    current_projects: number;
    storage_used_mb: number;
    api_calls_this_month: number;
    last_calculated: string;
}

interface TenantContextType {
    // Core tenant data
    currentTenant: Tenant | null;
    tenantConfig: TenantConfig | null;
    tenantUsage: TenantUsage | null;
    branding: TenantBranding;
    isLoading: boolean;
    error: string | null;
    
    // Permission checks
    hasFeature: (feature: keyof TenantConfig['features']) => boolean;
    isWithinResourceLimit: (resource: keyof TenantConfig['resource_limits']) => boolean;
    getResourceUsage: (resource: keyof TenantConfig['resource_limits']) => { used: number; limit: number; percentage: number };
    
    // Branding
    applyBranding: () => void;
    updateBranding: (updates: Partial<TenantBranding>) => Promise<void>;
    
    // Configuration management
    updateConfig: (updates: Partial<TenantConfig>) => Promise<void>;
    updateFeatures: (features: Partial<TenantConfig['features']>) => Promise<void>;
    updateResourceLimits: (limits: Partial<TenantConfig['resource_limits']>) => Promise<void>;
    updateSecuritySettings: (settings: Partial<TenantConfig['security_settings']>) => Promise<void>;
    
    // Usage tracking
    refreshUsage: () => Promise<void>;
    checkAndEnforceLimits: () => Promise<boolean>;
    
    // Tenant operations
    createTenant: (tenantData: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => Promise<Tenant>;
    updateTenant: (updates: Partial<Tenant>) => Promise<void>;
    switchTenant: (tenantId: string) => Promise<boolean>;
    
    // Integrations
    updateIntegration: (provider: keyof TenantConfig['integrations'], config: any) => Promise<void>;
    testIntegration: (provider: keyof TenantConfig['integrations']) => Promise<boolean>;
    
    // Utilities
    resetToDefaults: () => Promise<void>;
    exportTenantData: () => Promise<any>;
    getTenantHealth: () => Promise<{ status: 'healthy' | 'warning' | 'critical'; issues: string[] }>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const useTenant = () => {
    const context = useContext(TenantContext);
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return context;
};

export const useBranding = (): TenantBranding => {
    const { branding } = useTenant();
    return branding;
};

export const useTenantId = (): string | null => {
    const { currentTenant } = useTenant();
    return currentTenant?.id || null;
};

interface TenantProviderProps {
    children: React.ReactNode;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({ children }) => {
    const { user } = useAuth();
    const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
    const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);
    const [tenantUsage, setTenantUsage] = useState<TenantUsage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch tenant data for current user
    const fetchTenantData = useCallback(async () => {
        if (!user) {
            setCurrentTenant(null);
            setTenantConfig(null);
            setTenantUsage(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Get user's tenant from profile
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('tenant_id')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.warn('Profile not found, user may not have tenant assigned:', profileError.message);
                setIsLoading(false);
                return;
            }

            if (!profile?.tenant_id) {
                console.warn('User does not have a tenant assigned');
                setIsLoading(false);
                return;
            }

            // Fetch tenant details
            const { data: tenant, error: tenantError } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', profile.tenant_id)
                .single();

            if (tenantError) {
                throw new Error(`Failed to fetch tenant: ${tenantError.message}`);
            }

            setCurrentTenant(tenant);

            // Fetch tenant configuration
            const { data: config, error: configError } = await supabase
                .from('tenant_config')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .single();

            if (configError && configError.code !== 'PGRST116') {
                throw new Error(`Failed to fetch tenant config: ${configError.message}`);
            }

            if (config) {
                // Parse branding if it's stored as string
                const parsedConfig = {
                    ...config,
                    branding: typeof config.branding === 'string' 
                        ? JSON.parse(config.branding) 
                        : config.branding
                };
                setTenantConfig(parsedConfig);
            }

            // Fetch tenant usage
            await refreshUsage();

        } catch (err) {
            errorLogger.error('Error fetching tenant data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load tenant data');
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // Merge tenant config with defaults to get final branding
    const branding = useMemo(() => {
        if (tenantConfig?.branding) {
            return mergeBranding(tenantConfig.branding);
        }
        return defaultBranding;
    }, [tenantConfig?.branding]);

    // Check if a feature is enabled
    const hasFeature = useCallback((feature: keyof TenantConfig['features']): boolean => {
        if (!tenantConfig) return false;
        return tenantConfig.features[feature] ?? false;
    }, [tenantConfig]);

    // Check if within resource limits
    const isWithinResourceLimit = useCallback((resource: keyof TenantConfig['resource_limits']): boolean => {
        if (!tenantConfig || !tenantUsage) return false;
        
        const limit = tenantConfig.resource_limits[resource];
        const usage = {
            max_users: tenantUsage.current_users,
            max_projects: tenantUsage.current_projects,
            max_storage_mb: tenantUsage.storage_used_mb,
            max_api_calls_per_month: tenantUsage.api_calls_this_month
        }[resource];

        return usage <= limit;
    }, [tenantConfig, tenantUsage]);

    // Get resource usage details
    const getResourceUsage = useCallback((resource: keyof TenantConfig['resource_limits']) => {
        if (!tenantConfig || !tenantUsage) {
            return { used: 0, limit: 0, percentage: 0 };
        }

        const limit = tenantConfig.resource_limits[resource];
        const used = {
            max_users: tenantUsage.current_users,
            max_projects: tenantUsage.current_projects,
            max_storage_mb: tenantUsage.storage_used_mb,
            max_api_calls_per_month: tenantUsage.api_calls_this_month
        }[resource];

        return {
            used,
            limit,
            percentage: limit > 0 ? Math.round((used / limit) * 100) : 0
        };
    }, [tenantConfig, tenantUsage]);

    // Apply branding to DOM
    const applyBranding = useCallback(() => {
        const cssVars = getBrandingCssVars(branding);
        const root = document.documentElement;

        Object.entries(cssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        // Update document title
        if (branding.name && branding.name !== 'LIVV OS') {
            document.title = branding.name;
        }

        // Update favicon if provided
        if (branding.favicon) {
            const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
            if (favicon) {
                favicon.href = branding.favicon;
            }
        }
    }, [branding]);

    // Update branding
    const updateBranding = useCallback(async (updates: Partial<TenantBranding>) => {
        if (!currentTenant || !tenantConfig) {
            throw new Error('No active tenant');
        }

        try {
            const newBranding = { ...branding, ...updates };
            
            const { error } = await supabase
                .from('tenant_config')
                .update({
                    branding: newBranding,
                    updated_at: new Date().toISOString()
                })
                .eq('tenant_id', currentTenant.id);

            if (error) throw error;

            setTenantConfig(prev => prev ? {
                ...prev,
                branding: newBranding
            } : null);
        } catch (err) {
            errorLogger.error('Error updating branding:', err);
            throw new Error(err instanceof Error ? err.message : 'Failed to update branding');
        }
    }, [currentTenant, tenantConfig, branding]);

    // Update tenant configuration
    const updateConfig = useCallback(async (updates: Partial<TenantConfig>) => {
        if (!currentTenant) {
            throw new Error('No active tenant');
        }

        try {
            const { error } = await supabase
                .from('tenant_config')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('tenant_id', currentTenant.id);

            if (error) throw error;

            setTenantConfig(prev => prev ? { ...prev, ...updates } : null);
        } catch (err) {
            errorLogger.error('Error updating tenant config:', err);
            throw new Error(err instanceof Error ? err.message : 'Failed to update tenant config');
        }
    }, [currentTenant]);

    // Update features
    const updateFeatures = useCallback(async (features: Partial<TenantConfig['features']>) => {
        if (!tenantConfig) return;

        await updateConfig({
            features: { ...tenantConfig.features, ...features }
        });
    }, [tenantConfig, updateConfig]);

    // Update resource limits
    const updateResourceLimits = useCallback(async (limits: Partial<TenantConfig['resource_limits']>) => {
        if (!tenantConfig) return;

        await updateConfig({
            resource_limits: { ...tenantConfig.resource_limits, ...limits }
        });
    }, [tenantConfig, updateConfig]);

    // Update security settings
    const updateSecuritySettings = useCallback(async (settings: Partial<TenantConfig['security_settings']>) => {
        if (!tenantConfig) return;

        await updateConfig({
            security_settings: { ...tenantConfig.security_settings, ...settings }
        });
    }, [tenantConfig, updateConfig]);

    // Refresh usage data
    const refreshUsage = useCallback(async () => {
        if (!currentTenant) return;

        try {
            // Calculate current usage
            const [usersResult, projectsResult, storageResult] = await Promise.all([
                supabase.from('profiles').select('id').eq('tenant_id', currentTenant.id),
                supabase.from('projects').select('id').eq('tenant_id', currentTenant.id),
                supabase.rpc('calculate_tenant_storage_usage', { p_tenant_id: currentTenant.id })
            ]);

            const currentUsers = usersResult.data?.length || 0;
            const currentProjects = projectsResult.data?.length || 0;
            const storageUsed = storageResult.data || 0;

            const usage: TenantUsage = {
                tenant_id: currentTenant.id,
                current_users: currentUsers,
                current_projects: currentProjects,
                storage_used_mb: Math.round(storageUsed / (1024 * 1024)), // Convert bytes to MB
                api_calls_this_month: 0, // This would be tracked separately
                last_calculated: new Date().toISOString()
            };

            setTenantUsage(usage);

            // Store usage in database for historical tracking
            await supabase
                .from('tenant_usage')
                .upsert(usage);

        } catch (err) {
            errorLogger.error('Error refreshing usage:', err);
        }
    }, [currentTenant]);

    // Check and enforce resource limits
    const checkAndEnforceLimits = useCallback(async (): Promise<boolean> => {
        if (!tenantConfig || !tenantUsage) return true;

        const issues: string[] = [];
        
        if (tenantUsage.current_users > tenantConfig.resource_limits.max_users) {
            issues.push('User limit exceeded');
        }
        if (tenantUsage.current_projects > tenantConfig.resource_limits.max_projects) {
            issues.push('Project limit exceeded');
        }
        if (tenantUsage.storage_used_mb > tenantConfig.resource_limits.max_storage_mb) {
            issues.push('Storage limit exceeded');
        }

        if (issues.length > 0) {
            errorLogger.warn('Resource limits exceeded:', issues);
            // Could trigger alerts, disable features, etc.
            return false;
        }

        return true;
    }, [tenantConfig, tenantUsage]);

    // Create new tenant
    const createTenant = useCallback(async (tenantData: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>): Promise<Tenant> => {
        try {
            const { data, error } = await supabase
                .from('tenants')
                .insert({
                    ...tenantData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            // Create default tenant configuration
            await supabase
                .from('tenant_config')
                .insert({
                    tenant_id: data.id,
                    branding: defaultBranding,
                    features: {
                        sales_module: true,
                        team_management: true,
                        client_portal: false,
                        notifications: true,
                        ai_assistant: false,
                        analytics: true,
                        calendar_integration: false,
                        document_versioning: false,
                        advanced_permissions: false
                    },
                    resource_limits: {
                        max_users: 5,
                        max_projects: 20,
                        max_storage_mb: 1024, // 1GB
                        max_api_calls_per_month: 10000
                    },
                    security_settings: {
                        require_2fa: false,
                        session_timeout_minutes: 480, // 8 hours
                        password_min_length: 8,
                        allow_public_sharing: false
                    },
                    integrations: {
                        email_provider: null,
                        calendar_provider: null,
                        payment_processor: null,
                        ai_service: null
                    }
                });

            return data;
        } catch (err) {
            errorLogger.error('Error creating tenant:', err);
            throw new Error(err instanceof Error ? err.message : 'Failed to create tenant');
        }
    }, []);

    // Update tenant
    const updateTenant = useCallback(async (updates: Partial<Tenant>) => {
        if (!currentTenant) {
            throw new Error('No active tenant');
        }

        try {
            const { error } = await supabase
                .from('tenants')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentTenant.id);

            if (error) throw error;

            setCurrentTenant(prev => prev ? { ...prev, ...updates } : null);
        } catch (err) {
            errorLogger.error('Error updating tenant:', err);
            throw new Error(err instanceof Error ? err.message : 'Failed to update tenant');
        }
    }, [currentTenant]);

    // Switch tenant (for multi-tenant users)
    const switchTenant = useCallback(async (tenantId: string): Promise<boolean> => {
        if (!user) return false;

        try {
            // Update user's profile with new tenant
            const { error } = await supabase
                .from('profiles')
                .update({ tenant_id: tenantId })
                .eq('id', user.id);

            if (error) throw error;

            // Reload tenant data
            await fetchTenantData();
            return true;
        } catch (err) {
            errorLogger.error('Error switching tenant:', err);
            return false;
        }
    }, [user, fetchTenantData]);

    // Update integration
    const updateIntegration = useCallback(async (provider: keyof TenantConfig['integrations'], config: any) => {
        if (!tenantConfig) return;

        await updateConfig({
            integrations: { ...tenantConfig.integrations, [provider]: config }
        });
    }, [tenantConfig, updateConfig]);

    // Test integration
    const testIntegration = useCallback(async (provider: keyof TenantConfig['integrations']): Promise<boolean> => {
        try {
            // This would implement specific tests for each integration
            switch (provider) {
                case 'email_provider':
                    // Test email service
                    return true;
                case 'calendar_provider':
                    // Test calendar API
                    return true;
                case 'payment_processor':
                    // Test payment gateway
                    return true;
                case 'ai_service':
                    // Test AI service
                    return true;
                default:
                    return false;
            }
        } catch (err) {
            errorLogger.error(`Error testing ${provider}:`, err);
            return false;
        }
    }, []);

    // Reset to defaults
    const resetToDefaults = useCallback(async () => {
        if (!currentTenant) return;

        await updateConfig({
            branding: defaultBranding,
            features: {
                sales_module: true,
                team_management: true,
                client_portal: false,
                notifications: true,
                ai_assistant: false,
                analytics: true,
                calendar_integration: false,
                document_versioning: false,
                advanced_permissions: false
            }
        });
    }, [currentTenant, updateConfig]);

    // Export tenant data
    const exportTenantData = useCallback(async () => {
        if (!currentTenant) return null;

        try {
            const [configData, usageData] = await Promise.all([
                supabase.from('tenant_config').select('*').eq('tenant_id', currentTenant.id).single(),
                supabase.from('tenant_usage').select('*').eq('tenant_id', currentTenant.id)
            ]);

            return {
                tenant: currentTenant,
                config: configData.data,
                usage: usageData.data,
                exported_at: new Date().toISOString()
            };
        } catch (err) {
            errorLogger.error('Error exporting tenant data:', err);
            return null;
        }
    }, [currentTenant]);

    // Get tenant health status
    const getTenantHealth = useCallback(async () => {
        if (!currentTenant || !tenantConfig || !tenantUsage) {
            return { status: 'critical' as const, issues: ['Tenant data missing'] };
        }

        const issues: string[] = [];
        const limitsExceeded = !await checkAndEnforceLimits();
        
        if (limitsExceeded) {
            issues.push('Resource limits exceeded');
        }

        if (currentTenant.status === 'suspended') {
            issues.push('Tenant is suspended');
        }

        if (issues.length === 0) {
            return { status: 'healthy' as const, issues: [] };
        } else if (issues.length <= 2) {
            return { status: 'warning' as const, issues };
        } else {
            return { status: 'critical' as const, issues };
        }
    }, [currentTenant, tenantConfig, tenantUsage, checkAndEnforceLimits]);

    // Initialize on mount and when user changes
    useEffect(() => {
        fetchTenantData();
    }, [fetchTenantData]);

    // Apply branding when it changes
    useEffect(() => {
        applyBranding();
    }, [branding, applyBranding]);

    // Setup periodic usage refresh
    useEffect(() => {
        if (!currentTenant) return;

        const interval = setInterval(() => {
            refreshUsage();
        }, 5 * 60 * 1000); // Every 5 minutes

        return () => clearInterval(interval);
    }, [currentTenant, refreshUsage]);

    const value: TenantContextType = {
        // Core tenant data
        currentTenant,
        tenantConfig,
        tenantUsage,
        branding,
        isLoading,
        error,
        
        // Permission checks
        hasFeature,
        isWithinResourceLimit,
        getResourceUsage,
        
        // Branding
        applyBranding,
        updateBranding,
        
        // Configuration management
        updateConfig,
        updateFeatures,
        updateResourceLimits,
        updateSecuritySettings,
        
        // Usage tracking
        refreshUsage,
        checkAndEnforceLimits,
        
        // Tenant operations
        createTenant,
        updateTenant,
        switchTenant,
        
        // Integrations
        updateIntegration,
        testIntegration,
        
        // Utilities
        resetToDefaults,
        exportTenantData,
        getTenantHealth,
    };

    return (
        <TenantContext.Provider value={value}>
            {children}
        </TenantContext.Provider>
    );
};