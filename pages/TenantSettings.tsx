import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { defaultBranding, TenantBranding, mergeBranding } from '../config/whitelabel';
import { useTenant } from '../context/TenantContext';

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
    const { currentTenant, updateTenant } = useTenant();
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [branding, setBranding] = useState<TenantBranding>(defaultBranding);
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentTenant) return;
        if (file.size > 2 * 1024 * 1024) {
            setMessage({ text: 'Logo must be under 2MB', type: 'error' });
            e.target.value = '';
            return;
        }
        setUploadingLogo(true);
        setMessage(null);
        try {
            const ext = file.name.split('.').pop();
            const path = `logos/${currentTenant.id}.${ext}`;
            await supabase.storage.from('documents').remove([path]);
            const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
            const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
            await updateTenant({ logo_url: logoUrl });
            updateBranding('logo', logoUrl);
            setMessage({ text: 'Logo uploaded successfully', type: 'success' });
        } catch (err: any) {
            setMessage({ text: err?.message || 'Error uploading logo', type: 'error' });
        } finally {
            setUploadingLogo(false);
            e.target.value = '';
        }
    };

    const handleRemoveLogo = async () => {
        if (!currentTenant) return;
        setUploadingLogo(true);
        try {
            const { data: files } = await supabase.storage.from('documents').list('logos', {
                search: currentTenant.id,
            });
            if (files?.length) {
                await supabase.storage.from('documents').remove(files.map(f => `logos/${f.name}`));
            }
            await updateTenant({ logo_url: null as any });
            updateBranding('logo', '');
            setMessage({ text: 'Logo removed', type: 'success' });
        } catch (err: any) {
            setMessage({ text: err?.message || 'Error removing logo', type: 'error' });
        } finally {
            setUploadingLogo(false);
        }
    };

    useEffect(() => {
        loadTenantConfig();
    }, []);

    useEffect(() => {
        if (currentTenant?.website_url) {
            setWebsiteUrl(currentTenant.website_url);
        }
        if (currentTenant?.preview_url) {
            setPreviewUrl(currentTenant.preview_url);
        }
    }, [currentTenant]);

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

            // Save website + preview URLs to tenants table
            await updateTenant({ website_url: websiteUrl || null, preview_url: previewUrl || null });

            setMessage({ text: 'Configuration saved successfully', type: 'success' });
        } catch (err: any) {
            setMessage({ text: err.message || 'Error saving', type: 'error' });
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
        <div className="max-w-4xl mx-auto pt-4 pb-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        Tenant Settings
                    </h1>
                    <p className="text-zinc-500 mt-1">
                        Customize the appearance and features of your workspace
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
                    Save changes
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
                    Brand Identity
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Application name
                        </label>
                        <input
                            type="text"
                            value={branding.name}
                            onChange={e => updateBranding('name', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    {/* Logo Upload */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Logo
                        </label>
                        <div className="flex items-center gap-4">
                            <div className="relative group w-16 h-16 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-800 shrink-0">
                                {(currentTenant?.logo_url || branding.logo) ? (
                                    <img
                                        src={currentTenant?.logo_url || branding.logo}
                                        alt="Logo"
                                        className="w-full h-full object-contain p-1"
                                    />
                                ) : (
                                    <Icons.Image size={24} className="text-zinc-400" />
                                )}
                                <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                    {uploadingLogo ? (
                                        <Icons.Loader size={16} className="text-white animate-spin" />
                                    ) : (
                                        <Icons.Upload size={16} className="text-white" />
                                    )}
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                        className="hidden"
                                        disabled={uploadingLogo}
                                        onChange={handleLogoUpload}
                                    />
                                </label>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-xs text-zinc-400">
                                    PNG, JPG, WebP or SVG. Max 2MB.
                                </p>
                                {(currentTenant?.logo_url || branding.logo) && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveLogo}
                                        disabled={uploadingLogo}
                                        className="text-xs text-red-500 hover:text-red-600 text-left disabled:opacity-50"
                                    >
                                        Remove logo
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Website URL Section */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <Icons.Globe size={20} />
                    Website
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Website URL (Production)
                        </label>
                        <input
                            type="url"
                            value={websiteUrl}
                            onChange={e => setWebsiteUrl(e.target.value)}
                            placeholder="https://your-website.com"
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <p className="text-xs text-zinc-400 mt-2">
                            Live domain — shows only published content
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Preview URL (Staging)
                        </label>
                        <input
                            type="url"
                            value={previewUrl}
                            onChange={e => setPreviewUrl(e.target.value)}
                            placeholder="https://your-project.vercel.app"
                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <p className="text-xs text-zinc-400 mt-2">
                            Vercel/staging URL — shows drafts + published content
                        </p>
                    </div>
                </div>
            </section>

            {/* Colors Section */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <Icons.Droplet size={20} />
                    Colors
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    {/* Primary Color */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                            Primary color
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
                            Secondary color
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
                            Accent color
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
                    <p className="text-white font-medium text-center">Gradient preview</p>
                </div>
            </section>

            {/* Features Section */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                    <Icons.Sparkles size={20} />
                    Features
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
                    Create new Tenant
                </h2>
                <p className="text-indigo-700 dark:text-indigo-300 text-sm mb-4">
                    To create a new tenant, run the following SQL function:
                </p>
                <code className="block p-4 bg-zinc-900 text-green-400 rounded-lg text-sm font-mono overflow-x-auto">
                    SELECT create_tenant_with_config('Mi Empresa', 'mi-empresa-slug');
                </code>
            </section>
        </div>
    );
};
