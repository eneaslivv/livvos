import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { defaultBranding, TenantBranding, mergeBranding } from '../config/whitelabel';

interface TenantConfig {
    id: string;
    tenant_id: string;
    branding: Partial<TenantBranding>;
    sales_enabled: boolean;
    team_enabled: boolean;
    notifications_enabled: boolean;
    max_users: number;
    max_projects: number;
}

export const TenantSettings: React.FC = () => {
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [branding, setBranding] = useState<TenantBranding>(defaultBranding);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        loadTenantConfig();
    }, []);

    const loadTenantConfig = async () => {
        try {
            // Get current user's tenant config
            const { data, error } = await supabase.rpc('get_tenant_branding');

            if (error) throw error;

            if (data) {
                setBranding(mergeBranding(data));
            }
        } catch (err) {
            console.error('Error loading tenant config:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            // Update tenant_config branding
            const { error } = await supabase
                .from('tenant_config')
                .update({ branding })
                .eq('tenant_id', config?.tenant_id);

            if (error) throw error;

            setMessage({ text: 'Configuración guardada exitosamente', type: 'success' });
        } catch (err: any) {
            setMessage({ text: err.message || 'Error al guardar', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const updateBranding = (key: keyof TenantBranding, value: any) => {
        setBranding(prev => ({ ...prev, [key]: value }));
    };

    const updateFeature = (key: keyof TenantBranding['features'], value: boolean) => {
        setBranding(prev => ({
            ...prev,
            features: { ...prev.features, [key]: value }
        }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        Configuración del Tenant
                    </h1>
                    <p className="text-zinc-500 mt-1">
                        Personaliza la apariencia y funcionalidades de tu workspace
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                    {saving ? (
                        <Icons.Loader size={16} className="animate-spin" />
                    ) : (
                        <Icons.Save size={16} />
                    )}
                    Guardar cambios
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-lg ${message.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}>
                    {message.text}
                </div>
            )}

            {/* Branding Section */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <Icons.Palette size={20} />
                    Identidad de marca
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Nombre de la aplicación
                        </label>
                        <input
                            type="text"
                            value={branding.name}
                            onChange={e => updateBranding('name', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    {/* Logo URL */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            URL del Logo
                        </label>
                        <input
                            type="text"
                            value={branding.logo}
                            onChange={e => updateBranding('logo', e.target.value)}
                            placeholder="/logo.svg"
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </section>

            {/* Colors Section */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <Icons.Droplet size={20} />
                    Colores
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    {/* Primary Color */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Color primario
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={branding.primaryColor}
                                onChange={e => updateBranding('primaryColor', e.target.value)}
                                className="w-10 h-10 rounded-lg cursor-pointer border-0"
                            />
                            <input
                                type="text"
                                value={branding.primaryColor}
                                onChange={e => updateBranding('primaryColor', e.target.value)}
                                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-mono"
                            />
                        </div>
                    </div>

                    {/* Secondary Color */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Color secundario
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={branding.secondaryColor}
                                onChange={e => updateBranding('secondaryColor', e.target.value)}
                                className="w-10 h-10 rounded-lg cursor-pointer border-0"
                            />
                            <input
                                type="text"
                                value={branding.secondaryColor}
                                onChange={e => updateBranding('secondaryColor', e.target.value)}
                                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-mono"
                            />
                        </div>
                    </div>

                    {/* Accent Color */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Color de acento
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={branding.accentColor}
                                onChange={e => updateBranding('accentColor', e.target.value)}
                                className="w-10 h-10 rounded-lg cursor-pointer border-0"
                            />
                            <input
                                type="text"
                                value={branding.accentColor}
                                onChange={e => updateBranding('accentColor', e.target.value)}
                                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* Preview */}
                <div className="mt-6 p-4 rounded-lg" style={{
                    background: `linear-gradient(135deg, ${branding.gradientFrom}, ${branding.gradientTo})`
                }}>
                    <p className="text-white font-medium text-center">Preview del gradiente</p>
                </div>
            </section>

            {/* Features Section */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <Icons.Sparkles size={20} />
                    Funcionalidades
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(branding.features).map(([key, enabled]) => (
                        <label
                            key={key}
                            className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={e => updateFeature(key as keyof TenantBranding['features'], e.target.checked)}
                                className="w-5 h-5 rounded border-zinc-300 text-indigo-500 focus:ring-indigo-500"
                            />
                        </label>
                    ))}
                </div>
            </section>

            {/* Create Tenant Section */}
            <section className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6">
                <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                    <Icons.Plus size={20} />
                    Crear nuevo Tenant
                </h2>
                <p className="text-indigo-700 dark:text-indigo-300 text-sm mb-4">
                    Para crear un nuevo tenant, ejecuta la siguiente función en SQL:
                </p>
                <code className="block p-4 bg-zinc-900 text-green-400 rounded-lg text-sm font-mono overflow-x-auto">
                    SELECT create_tenant_with_config('Mi Empresa', 'mi-empresa-slug');
                </code>
            </section>
        </div>
    );
};
