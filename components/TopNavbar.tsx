
import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { ConfigurationModal } from './config/ConfigurationModal';
import { NotificationBell } from './NotificationBell';
import { UnifiedNewPopover } from './layout/UnifiedNewPopover';
import type { PageView, NavParams } from '../types';

interface TopNavbarProps {
    pageTitle: string;
    currentPage: PageView;
    navParams?: NavParams;
    onOpenSearch: () => void;
    onNavigate: (page: PageView, params?: NavParams) => void;
    onOpenNewTask: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ pageTitle, currentPage, navParams, onOpenSearch, onNavigate, onOpenNewTask }) => {
    const { user } = useRBAC();
    const { currentTenant } = useTenant();
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const isDarkMode = document.documentElement.classList.contains('dark');
    const tenantLogo = isDarkMode && currentTenant?.logo_url_dark ? currentTenant.logo_url_dark : (currentTenant?.logo_url || currentTenant?.logo_url_dark);

    return (
        <header className="w-full px-4 md:px-5 bg-zinc-50/60 dark:bg-black/60 backdrop-blur-2xl rounded-full">
            <div className="flex items-center justify-between h-11 w-full">

                {/* Left: Logo + Search Bar */}
                <div className="flex items-center gap-3 min-w-0">
                    {tenantLogo && (
                        <img
                            src={tenantLogo}
                            alt={currentTenant?.name || ''}
                            className="h-6 max-w-[80px] object-contain shrink-0 md:hidden"
                        />
                    )}
                    <div
                        onClick={onOpenSearch}
                        className="group relative flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full cursor-text transition-all hover:border-zinc-300 dark:hover:border-zinc-700 w-56"
                    >
                        <Icons.Search size={13} className="text-zinc-400 shrink-0" />
                        <span className="text-xs text-zinc-400 font-medium">Search...</span>
                        <span className="ml-auto text-[9px] font-semibold text-zinc-400 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded shrink-0">⌘K</span>
                    </div>
                    <span className="hidden lg:block text-[11px] font-semibold text-zinc-400/60 dark:text-zinc-500/60 uppercase tracking-widest select-none">
                        {pageTitle === 'home' ? 'Dashboard' : pageTitle.replace('_', ' ')}
                    </span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">

                    {/* Unified "+ New" (⌘N) */}
                    <UnifiedNewPopover
                        variant="topbar"
                        currentPage={currentPage}
                        currentClientId={navParams?.clientId}
                        currentProjectId={navParams?.projectId}
                        onNavigate={onNavigate}
                        onOpenNewTask={onOpenNewTask}
                    />

                    {/* Notifications */}
                    <NotificationBell onNavigate={onNavigate} />

                    {/* User Menu */}
                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-0.5"
                    >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-zinc-50 dark:ring-black">
                            {user?.name?.[0] || 'U'}
                        </div>
                        <span className="hidden md:block text-xs font-medium text-zinc-700 dark:text-zinc-200">{user?.name || 'User'}</span>
                    </button>

                </div>
            </div>
            <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} onNavigate={onNavigate} />
        </header>
    );
};
