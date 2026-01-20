/**
 * White-Label Configuration
 * 
 * This file provides the default branding configuration that can be
 * overridden by tenant-specific settings from the database.
 */

export interface TenantBranding {
    // Identity
    name: string;
    logo: string;
    logoMark: string; // Small logo for sidebar/favicon
    favicon: string;

    // Colors
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;

    // Gradients
    gradientFrom: string;
    gradientTo: string;

    // Theme overrides
    darkMode: {
        primary: string;
        secondary: string;
        accent: string;
    };

    // Feature flags
    features: {
        salesModule: boolean;
        teamManagement: boolean;
        clientPortal: boolean;
        notifications: boolean;
        aiAssistant: boolean;
    };

    // Custom URLs
    supportEmail: string;
    docsUrl: string;
    privacyUrl: string;
    termsUrl: string;
}

/**
 * Default branding configuration
 * Used when no tenant-specific config is found
 */
export const defaultBranding: TenantBranding = {
    // Identity
    name: 'LIVV OS',
    logo: '/livv-logo.svg',
    logoMark: '/livv-mark.svg',
    favicon: '/favicon.ico',

    // Colors (Indigo/Purple theme)
    primaryColor: '#6366f1', // indigo-500
    secondaryColor: '#8b5cf6', // violet-500
    accentColor: '#ec4899', // pink-500

    // Gradients
    gradientFrom: '#6366f1',
    gradientTo: '#8b5cf6',

    // Dark mode colors
    darkMode: {
        primary: '#818cf8', // indigo-400
        secondary: '#a78bfa', // violet-400
        accent: '#f472b6', // pink-400
    },

    // All features enabled by default
    features: {
        salesModule: true,
        teamManagement: true,
        clientPortal: true,
        notifications: true,
        aiAssistant: true,
    },

    // Support URLs
    supportEmail: 'support@livv.io',
    docsUrl: 'https://docs.livv.io',
    privacyUrl: 'https://livv.io/privacy',
    termsUrl: 'https://livv.io/terms',
};

/**
 * Get branding CSS variables for injection into the document
 */
export function getBrandingCssVars(branding: TenantBranding): Record<string, string> {
    return {
        '--brand-primary': branding.primaryColor,
        '--brand-secondary': branding.secondaryColor,
        '--brand-accent': branding.accentColor,
        '--brand-gradient-from': branding.gradientFrom,
        '--brand-gradient-to': branding.gradientTo,
        '--brand-primary-dark': branding.darkMode.primary,
        '--brand-secondary-dark': branding.darkMode.secondary,
        '--brand-accent-dark': branding.darkMode.accent,
    };
}

/**
 * Merge tenant config with defaults
 * Tenant config takes precedence, defaults fill gaps
 */
export function mergeBranding(
    tenantConfig: Partial<TenantBranding> | null
): TenantBranding {
    if (!tenantConfig) return defaultBranding;

    return {
        ...defaultBranding,
        ...tenantConfig,
        darkMode: {
            ...defaultBranding.darkMode,
            ...(tenantConfig.darkMode || {}),
        },
        features: {
            ...defaultBranding.features,
            ...(tenantConfig.features || {}),
        },
    };
}
