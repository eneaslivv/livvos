
import React, { useState } from 'react';
import { Icons } from './ui/Icons';
import { useRBAC } from '../context/RBACContext';
import { ConfigurationModal } from './config/ConfigurationModal';
import { NotificationBell } from './NotificationBell';

interface TopNavbarProps {
    pageTitle: string;
    onOpenSearch: () => void;
    onOpenTask: () => void;
    onNavigate?: (page: string) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ pageTitle, onOpenSearch, onOpenTask, onNavigate }) => {
    const { user } = useRBAC();
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    return (
        <header className="sticky top-0 z-40 w-full px-4 md:px-8 bg-zinc-50/80 dark:bg-black/80 backdrop-blur-xl border-b border-zinc-200/40 dark:border-zinc-800/40">
            <div className="flex items-center justify-between h-14 max-w-[1600px] mx-auto w-full">

                {/* Left: Search Bar */}
                <div className="flex items-center gap-4 min-w-0">
                    <div
                        onClick={onOpenSearch}
                        className="group relative flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-text transition-all hover:border-zinc-300 dark:hover:border-zinc-700 w-56"
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

                    {/* Create Task Button */}
                    <button
                        onClick={onOpenTask}
                        className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[11px] font-semibold tracking-wide hover:opacity-90 transition-opacity"
                    >
                        <Icons.Plus size={12} strokeWidth={2.5} />
                        New Task
                    </button>

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

                    {/* Mobile Create Task */}
                    <button
                        onClick={onOpenTask}
                        className="md:hidden p-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg transition-opacity hover:opacity-90"
                    >
                        <Icons.Plus size={18} />
                    </button>

                </div>
            </div>
            <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
        </header>
    );
};
