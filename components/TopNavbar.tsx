
import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { ConfigurationModal } from './config/ConfigurationModal';
import { NotificationBell } from './NotificationBell';
import { UnifiedNewPopover } from './layout/UnifiedNewPopover';
import { PresenceAvatars } from './presence/PresenceAvatars';
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
        <header className="w-full px-3 md:px-4 bg-zinc-50/60 dark:bg-black/60 backdrop-blur-2xl rounded-full">
            <div className="flex items-center justify-between h-9 w-full">

                {/* Left: Logo + Search Bar */}
                <div className="flex items-center gap-2.5 min-w-0">
                    {tenantLogo && (
                        <img
                            src={tenantLogo}
                            alt={currentTenant?.name || ''}
                            className="h-5 max-w-[72px] object-contain shrink-0 md:hidden"
                        />
                    )}
                    <div
                        onClick={onOpenSearch}
                        className="group relative flex items-center gap-1.5 px-2.5 py-1 bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 rounded-md cursor-text transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 w-48"
                    >
                        <Icons.Search size={12} className="text-zinc-400 shrink-0" strokeWidth={2} />
                        <span className="text-[12px] text-zinc-400">Search</span>
                        <span className="ml-auto text-[9px] text-zinc-400 dark:text-zinc-500 px-1 py-px rounded bg-zinc-100 dark:bg-zinc-800 shrink-0 font-mono">⌘K</span>
                    </div>
                    <span className="hidden lg:block text-[10px] font-medium text-zinc-400/70 dark:text-zinc-500/70 uppercase tracking-[0.12em] select-none">
                        {pageTitle === 'home' ? 'Dashboard' : pageTitle.replace('_', ' ')}
                    </span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1">

                    {/* Live presence (who's online in this tenant) */}
                    <div className="hidden sm:flex items-center pr-1 mr-1 border-r border-zinc-200/70 dark:border-zinc-800/70">
                        <div className="pr-1.5">
                            <PresenceAvatars currentPage={currentPage} />
                        </div>
                    </div>

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
                        className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="w-6 h-6 rounded-md bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <span className="hidden md:block text-[12px] text-zinc-600 dark:text-zinc-300">{user?.name || 'User'}</span>
                    </button>

                </div>
            </div>
            <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} onNavigate={onNavigate} />
        </header>
    );
};
