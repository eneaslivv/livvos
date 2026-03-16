import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';
import { supabase } from '../../lib/supabase';

export const GeneralSettings: React.FC = () => {
  const { currentTenant, updateTenant } = useTenant();
  const [workspaceName, setWorkspaceName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [deployHookUrl, setDeployHookUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);
  const [savingDeploy, setSavingDeploy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState<'light' | 'dark' | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentTenant?.name) setWorkspaceName(currentTenant.name);
    if (currentTenant?.website_url) setWebsiteUrl(currentTenant.website_url);
    if (currentTenant?.preview_url) setPreviewUrl(currentTenant.preview_url);
    if (currentTenant?.deploy_hook_url) setDeployHookUrl(currentTenant.deploy_hook_url);
  }, [currentTenant]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, variant: 'light' | 'dark') => {
    const file = e.target.files?.[0];
    if (!file || !currentTenant) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ text: 'Logo must be under 2MB', type: 'error' });
      e.target.value = '';
      return;
    }
    setUploadingLogo(variant);
    setMessage(null);
    try {
      const ext = file.name.split('.').pop();
      const suffix = variant === 'dark' ? '-dark' : '';
      const path = `logos/${currentTenant.id}${suffix}.${ext}`;
      await supabase.storage.from('documents').remove([path]);
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
      const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      const field = variant === 'dark' ? 'logo_url_dark' : 'logo_url';
      await updateTenant({ [field]: logoUrl });
      setMessage({ text: `${variant === 'dark' ? 'Dark' : 'Light'} logo uploaded`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err?.message || 'Error uploading logo', type: 'error' });
    } finally {
      setUploadingLogo(null);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = async (variant: 'light' | 'dark') => {
    if (!currentTenant) return;
    setUploadingLogo(variant);
    try {
      const suffix = variant === 'dark' ? '-dark' : '';
      const { data: files } = await supabase.storage.from('documents').list('logos', {
        search: `${currentTenant.id}${suffix}`,
      });
      if (files?.length) {
        await supabase.storage.from('documents').remove(files.map(f => `logos/${f.name}`));
      }
      const field = variant === 'dark' ? 'logo_url_dark' : 'logo_url';
      await updateTenant({ [field]: null as any });
      setMessage({ text: `${variant === 'dark' ? 'Dark' : 'Light'} logo removed`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err?.message || 'Error removing logo', type: 'error' });
    } finally {
      setUploadingLogo(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">General Settings</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your workspace profile and branding.
        </p>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6">
        <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Workspace Name</label>
            <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
            />
        </div>

        {/* Logo — Light & Dark */}
        <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo</label>
            <p className="text-xs text-zinc-400">
              Upload separate logos for light and dark mode. PNG, JPG, WebP or SVG. Max 2MB.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Light */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-1.5">
                  <Icons.Sun size={13} /> Light mode
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white flex items-center justify-center overflow-hidden shrink-0">
                    {currentTenant?.logo_url ? (
                      <img src={currentTenant.logo_url} alt="Logo light" className="w-full h-full object-contain p-1.5" />
                    ) : (
                      <Icons.Image size={20} className="text-zinc-300" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => lightInputRef.current?.click()}
                      disabled={uploadingLogo === 'light'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      {uploadingLogo === 'light' ? <Icons.Loader size={13} className="animate-spin" /> : <Icons.Upload size={13} />}
                      Upload
                    </button>
                    <input ref={lightInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => handleLogoUpload(e, 'light')} />
                    {currentTenant?.logo_url && (
                      <button type="button" onClick={() => handleRemoveLogo('light')} disabled={!!uploadingLogo} className="text-[11px] text-red-500 hover:text-red-600 text-left disabled:opacity-50">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* Dark */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-1.5">
                  <Icons.Moon size={13} /> Dark mode
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-900 flex items-center justify-center overflow-hidden shrink-0">
                    {currentTenant?.logo_url_dark ? (
                      <img src={currentTenant.logo_url_dark} alt="Logo dark" className="w-full h-full object-contain p-1.5" />
                    ) : currentTenant?.logo_url ? (
                      <img src={currentTenant.logo_url} alt="Logo fallback" className="w-full h-full object-contain p-1.5 invert" />
                    ) : (
                      <Icons.Image size={20} className="text-zinc-600" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => darkInputRef.current?.click()}
                      disabled={uploadingLogo === 'dark'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      {uploadingLogo === 'dark' ? <Icons.Loader size={13} className="animate-spin" /> : <Icons.Upload size={13} />}
                      Upload
                    </button>
                    <input ref={darkInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => handleLogoUpload(e, 'dark')} />
                    {currentTenant?.logo_url_dark && (
                      <button type="button" onClick={() => handleRemoveLogo('dark')} disabled={!!uploadingLogo} className="text-[11px] text-red-500 hover:text-red-600 text-left disabled:opacity-50">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {!currentTenant?.logo_url_dark && currentTenant?.logo_url && (
                  <p className="text-[10px] text-zinc-400 mt-2">Using inverted light logo as fallback</p>
                )}
              </div>
            </div>
        </div>

        <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Website URL</label>
            <p className="text-xs text-zinc-400">Used for the live preview in Content CMS</p>
            <div className="flex items-center gap-2">
                <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://your-website.com"
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
                <button
                    onClick={async () => {
                        setSavingUrl(true);
                        try {
                            await updateTenant({ website_url: websiteUrl || null });
                        } finally {
                            setSavingUrl(false);
                        }
                    }}
                    disabled={savingUrl || websiteUrl === (currentTenant?.website_url || '')}
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                >
                    {savingUrl ? <Icons.Loader size={16} className="animate-spin" /> : 'Save'}
                </button>
            </div>
        </div>

        <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview URL</label>
            <p className="text-xs text-zinc-400">Vercel/staging URL for draft preview in CMS</p>
            <div className="flex items-center gap-2">
                <input
                    type="url"
                    value={previewUrl}
                    onChange={(e) => setPreviewUrl(e.target.value)}
                    placeholder="https://your-site-preview.vercel.app"
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
                <button
                    onClick={async () => {
                        setSavingPreview(true);
                        try {
                            await updateTenant({ preview_url: previewUrl || null });
                        } finally {
                            setSavingPreview(false);
                        }
                    }}
                    disabled={savingPreview || previewUrl === (currentTenant?.preview_url || '')}
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                >
                    {savingPreview ? <Icons.Loader size={16} className="animate-spin" /> : 'Save'}
                </button>
            </div>
        </div>

        <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Deploy Hook URL</label>
            <p className="text-xs text-zinc-400">Vercel/Netlify deploy hook — triggers a rebuild when you publish from the CMS</p>
            <div className="flex items-center gap-2">
                <input
                    type="url"
                    value={deployHookUrl}
                    onChange={(e) => setDeployHookUrl(e.target.value)}
                    placeholder="https://api.vercel.com/v1/integrations/deploy/..."
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono text-xs"
                />
                <button
                    onClick={async () => {
                        setSavingDeploy(true);
                        try {
                            await updateTenant({ deploy_hook_url: deployHookUrl || null });
                        } finally {
                            setSavingDeploy(false);
                        }
                    }}
                    disabled={savingDeploy || deployHookUrl === (currentTenant?.deploy_hook_url || '')}
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                >
                    {savingDeploy ? <Icons.Loader size={16} className="animate-spin" /> : 'Save'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
