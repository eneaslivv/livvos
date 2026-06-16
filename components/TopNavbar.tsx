
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

/**
 * Pages reachable from the mobile "More" sheet. The 5-tab bottom bar
 * (Home · Tasks · Aurora · Projects · Finances) only covers the daily
 * drivers; everything else lives here so it stays discoverable without a
 * 6th tab. `module`/`action` gate the row via useRBAC().hasPermission.
 */
type MoreItem = {
    id: PageView;
    label: string;
    icon: keyof typeof Icons;
    module?: string;
    action?: string;
    match?: PageView[];
};
const MORE_ITEMS: MoreItem[] = [
    { id: 'sales_dashboard', label: 'Sales', icon: 'Chart', module: 'sales', action: 'view', match: ['sales_dashboard', 'sales_pipeline', 'sales_leads', 'sales_analytics'] },
    { id: 'build_hub', label: 'Growth OS', icon: 'Layers', module: 'build', action: 'view', match: ['build_hub', 'growth_dashboard', 'agent', 'strategy_hub', 'content_engine', 'products', 'strategy_toolkit', 'team_scaling'] },
    { id: 'team_clients', label: 'Clients', icon: 'Users', module: 'clients', action: 'view', match: ['team_clients', 'team', 'clients'] },
    { id: 'activity', label: 'Activity', icon: 'Activity', module: 'activity', action: 'view' },
    { id: 'docs', label: 'Docs', icon: 'Docs', module: 'documents', action: 'view' },
    { id: 'tenant_settings', label: 'Settings', icon: 'Settings' },
];

export const TopNavbar: React.FC<TopNavbarProps> = ({ pageTitle, currentPage, currentMode, navParams, onOpenSearch, onNavigate, onOpenNewTask }) => {
    const { user, hasPermission } = useRBAC();
    const { currentTenant } = useTenant();
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [showMore, setShowMore] = useState(false);
    // Local mirror so the sheet's Light/Dark label flips immediately on tap.
    // Seeded from the live DOM class (same source Layout uses).
    const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
    const tenantLogo = isDarkMode && currentTenant?.logo_url_dark ? currentTenant.logo_url_dark : (currentTenant?.logo_url || currentTenant?.logo_url_dark);

    // Mirrors Layout.toggleTheme: flip the `dark` class on <html> + persist to
    // localStorage('theme'). Kept self-contained so the More sheet needs no
    // extra prop drilling; Layout re-reads the same source on next mount.
    const toggleTheme = () => {
        const next = !isDarkMode;
        if (next) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
        setIsDarkMode(next);
    };

    // Items the current user is allowed to see (ungated rows always show).
    const visibleMoreItems = MORE_ITEMS.filter(it => !it.module || hasPermission(it.module, it.action || 'view'));
    const isMoreActive = visibleMoreItems.some(it => (it.match || [it.id]).includes(currentPage));

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

                    {/* Mobile-only "More" — opens a bottom-sheet grid of the
                        pages that aren't in the 5-tab bottom bar. Hidden on
                        md+ where the side nav covers everything. */}
                    <button
                        onClick={() => setShowMore(true)}
                        title="More"
                        aria-label="More pages"
                        className={`md:hidden flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                            isMoreActive
                                ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Icons.Grid size={16} strokeWidth={isMoreActive ? 2.2 : 1.8} />
                    </button>

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

            {/* Mobile "More" bottom-sheet — extra pages + search + theme.
                Warm editorial tokens, dark-safe. */}
            <AnimatePresence>
                {showMore && (
                    <div className="md:hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
                            onClick={() => setShowMore(false)}
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 z-[61] rounded-t-3xl shadow-2xl"
                            style={{
                                background: 'var(--os-panel)',
                                borderTop: '1px solid var(--os-border-2)',
                                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                            }}
                        >
                            {/* Drag handle */}
                            <div className="flex justify-center pt-3 pb-2">
                                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--os-border-2)' }} />
                            </div>

                            {/* Search — thumb-reach entry to the command palette. */}
                            <div className="px-4 pb-3">
                                <button
                                    onClick={() => { setShowMore(false); onOpenSearch(); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-colors active:opacity-80"
                                    style={{ background: 'var(--os-surface)', color: 'var(--os-fg-3)' }}
                                >
                                    <Icons.Search size={17} strokeWidth={2} />
                                    <span className="text-[13px] font-medium">Search tasks, projects, clients…</span>
                                </button>
                            </div>

                            {/* Page grid */}
                            <div className="px-4 pb-3 grid grid-cols-4 gap-2">
                                {visibleMoreItems.map(item => {
                                    const IconComponent = Icons[item.icon];
                                    const active = (item.match || [item.id]).includes(currentPage);
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => { onNavigate(item.id); setShowMore(false); }}
                                            className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all active:opacity-80"
                                            style={{
                                                background: active ? 'var(--os-surface)' : 'transparent',
                                                color: active ? 'var(--os-fg-0)' : 'var(--os-fg-2)',
                                            }}
                                        >
                                            <IconComponent size={22} strokeWidth={active ? 2.4 : 1.8} />
                                            <span className="text-[11px] font-medium">{item.label}</span>
                                        </button>
                                    );
                                })}

                                {/* Theme toggle */}
                                <button
                                    onClick={toggleTheme}
                                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all active:opacity-80"
                                    style={{ color: 'var(--os-fg-2)' }}
                                >
                                    {isDarkMode ? <Icons.Sun size={22} strokeWidth={1.8} /> : <Icons.Moon size={22} strokeWidth={1.8} />}
                                    <span className="text-[11px] font-medium">{isDarkMode ? 'Light' : 'Dark'}</span>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </header>
    );
};
