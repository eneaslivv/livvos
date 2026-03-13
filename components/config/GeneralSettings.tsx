import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';

export const GeneralSettings: React.FC = () => {
  const { currentTenant, updateTenant } = useTenant();
  const [workspaceName, setWorkspaceName] = useState('Eneas OS');
  const [logo, setLogo] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [deployHookUrl, setDeployHookUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);
  const [savingDeploy, setSavingDeploy] = useState(false);

  useEffect(() => {
    if (currentTenant?.website_url) setWebsiteUrl(currentTenant.website_url);
    if (currentTenant?.preview_url) setPreviewUrl(currentTenant.preview_url);
    if (currentTenant?.deploy_hook_url) setDeployHookUrl(currentTenant.deploy_hook_url);
  }, [currentTenant]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">General Settings</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage your workspace profile and branding.
        </p>
      </div>

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

        <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo</label>
            <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center">
                    {logo ? (
                        <img src={logo} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                        <Icons.Image className="text-zinc-400" size={24} />
                    )}
                </div>
                <button className="px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    Upload Logo
                </button>
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
