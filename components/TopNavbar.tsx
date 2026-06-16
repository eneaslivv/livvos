
import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { ConfigurationModal } from './config/ConfigurationModal';
import { NotificationBell } from './NotificationBell';
import { UnifiedNewPopover } from './layout/UnifiedNewPopover';
import { PresenceAvatars } from './presence/PresenceAvatars';
import type { PageView, NavParams, AppMode } from '../types';

interface TopNavbarProps {
    pageTitle: string;
    currentPage: PageView;
    currentMode?: AppMode;
    navParams?: NavParams;
    onOpenSearch: () => void;
    onNavigate: (page: PageView, params?: NavParams) => void;
    onOpenNewTask: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ pageTitle, currentPage, currentMode, navParams, onOpenSearch, onNavigate, onOpenNewTask }) => {
    const { user, hasPermission } = useRBAC();
    const { currentTenant } = useTenant();
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const isDarkMode = document.documentElement.classList.contains('dark');
    const tenantLogo = isDarkMode && currentTenant?.logo_url_dark ? currentTenant.logo_url_dark : (currentTenant?.logo_url || currentTenant?.logo_url_dark);

    return (
        <header className="w-full px-3 md:px-4 bg-zinc-50/60 dark:bg-black/60 backdrop-blur-2xl rounded-full">
            <div className="relative flex items-center justify-between h-9 w-full">

                {/* Center: Studio mark → Activity. Absolutely centered so it
                    reads as a central logo. Shows the tenant/agency logo (or
                    an initial) and is the studio's "home base" / activity
                    button — replaces the old Activity item in the side nav. */}
                {hasPermission('activity', 'view') && (
                    <button
                        onClick={() => onNavigate('activity')}
                        title="Studio activity"
                        aria-label="Studio activity"
                        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full overflow-hidden transition-all hover:scale-105 ${
                            currentPage === 'activity' ? '' : 'ring-1 ring-zinc-200 dark:ring-zinc-700 hover:ring-zinc-300 dark:hover:ring-zinc-600'
                        }`}
                        style={currentPage === 'activity' ? { boxShadow: '0 0 0 2px var(--livv-gold, #C4A35A)' } : undefined}
                    >
                        {tenantLogo ? (
                            <img src={tenantLogo} alt={currentTenant?.name || 'Studio'} className="w-full h-full object-cover" />
                        ) : (
                            <span className="w-full h-full flex items-center justify-center text-[11px] font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                                {(currentTenant?.name?.[0] || user?.name?.[0] || 'S').toUpperCase()}
                            </span>
                        )}
                    </button>
                )}

                {/* Left: Search Bar */}
                <div className="flex items-center gap-2.5 min-w-0">
                    {/* Mobile: compact icon button (the fixed w-48 box was
                        overflowing the bar next to the logo + actions).
                        Desktop keeps the full search field with ⌘K hint. */}
                    <div
                        onClick={onOpenSearch}
                        className="group relative flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-2.5 py-1 bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 rounded-md cursor-text transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 w-8 sm:w-48"
                    >
                        <Icons.Search size={12} className="text-zinc-400 shrink-0" strokeWidth={2} />
                        <span className="hidden sm:block text-[12px] text-zinc-400">Search</span>
                        <span className="hidden sm:block ml-auto text-[9px] text-zinc-400 dark:text-zinc-500 px-1 py-px rounded bg-zinc-100 dark:bg-zinc-800 shrink-0 font-mono">⌘K</span>
                    </div>
                    <span className="hidden lg:block text-[10px] font-medium text-zinc-400/70 dark:text-zinc-500/70 uppercase tracking-[0.12em] select-none">
                        {pageTitle === 'home' ? 'Dashboard' : pageTitle.replace('_', ' ')}
                    </span>
                    {/* Master mode badge — high-visibility reminder you're
                        operating cross-tenant. Only renders when in master mode. */}
                    {currentMode === 'master' && (
                        <span
                            className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-300/40"
                            title="Master mode — actions affect every tenant"
                        >
                            <Icons.Shield size={10} /> Master
                        </span>
                    )}
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
