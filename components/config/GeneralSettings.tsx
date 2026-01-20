import React, { useState } from 'react';
import { Icons } from '../ui/Icons';

export const GeneralSettings: React.FC = () => {
  const [workspaceName, setWorkspaceName] = useState('Eneas OS');
  const [logo, setLogo] = useState<string | null>(null);

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
      </div>
    </div>
  );
};
