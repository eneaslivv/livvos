import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
    TenantBranding,
    defaultBranding,
    mergeBranding,
    getBrandingCssVars
} from '../config/whitelabel';

interface TenantContextType {
    branding: TenantBranding;
    isLoading: boolean;
    tenantId: string | null;
    /** Check if a feature is enabled */
    hasFeature: (feature: keyof TenantBranding['features']) => boolean;
    /** Apply branding CSS variables to document */
    applyBranding: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

/**
 * Tenant Context Provider
 * 
 * Loads tenant-specific branding from database and provides it to the app.
 * Falls back to default branding if no tenant config exists.
 */
export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [tenantConfig, setTenantConfig] = useState<Partial<TenantBranding> | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch tenant config from database
    useEffect(() => {
        const fetchTenantConfig = async () => {
            setIsLoading(true);

            try {
                // First, try to get tenant_id from user's profile
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('tenant_id')
                        .eq('id', user.id)
                        .single();

                    if (profile?.tenant_id) {
                        setTenantId(profile.tenant_id);

                        // Fetch tenant config
                        const { data: config } = await supabase
                            .from('tenant_config')
                            .select('*')
                            .eq('tenant_id', profile.tenant_id)
                            .single();

                        if (config) {
                            // Parse the branding JSON if stored as string
                            const branding = typeof config.branding === 'string'
                                ? JSON.parse(config.branding)
                                : config.branding;

                            setTenantConfig(branding);
                        }
                    }
                }
            } catch (error) {
                // Tenant config is optional, use defaults
                console.log('Using default branding (no tenant config found)');
            } finally {
                setIsLoading(false);
            }
        };

        fetchTenantConfig();
    }, [user]);

    // Merge tenant config with defaults
    const branding = useMemo(() => mergeBranding(tenantConfig), [tenantConfig]);

    // Check if feature is enabled
    const hasFeature = (feature: keyof TenantBranding['features']): boolean => {
        return branding.features[feature] ?? true;
    };

    // Apply branding CSS variables to document
    const applyBranding = () => {
        const cssVars = getBrandingCssVars(branding);
        const root = document.documentElement;

        Object.entries(cssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    };

    // Apply branding on mount and when branding changes
    useEffect(() => {
        applyBranding();
    }, [branding]);

    // Update document title with tenant name
    useEffect(() => {
        if (branding.name && branding.name !== 'LIVV OS') {
            document.title = branding.name;
        }
    }, [branding.name]);

    return (
        <TenantContext.Provider
            value={{
                branding,
                isLoading,
                tenantId,
                hasFeature,
                applyBranding,
            }}
        >
            {children}
        </TenantContext.Provider>
    );
};

export const useTenant = () => {
    const context = useContext(TenantContext);
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return context;
};

/**
 * Hook for accessing branding directly
 * Shorthand for useTenant().branding
 */
export const useBranding = (): TenantBranding => {
    const { branding } = useTenant();
    return branding;
};
