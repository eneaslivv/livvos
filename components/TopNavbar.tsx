
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
        <header className="sticky top-0 z-40 w-full pl-4 md:pl-0 pr-4 pt-4 pb-2 pointer-events-none">
            <div className="flex items-center justify-between h-16 px-0 transition-all duration-300">

                {/* Left: Search Bar */}
                <div className="flex-1 flex items-center max-w-xl pointer-events-auto md:ml-6">
                    <div
                        onClick={onOpenSearch}
                        className="group relative w-full max-w-sm flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl cursor-text transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white/80 dark:hover:bg-zinc-900/80"
                    >
                        <Icons.Search size={14} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Search...</span>
                        <div className="absolute right-2 flex items-center gap-1">
                            <span className="text-[9px] font-bold text-zinc-400 bg-transparent border border-zinc-200/50 dark:border-zinc-700/50 px-1.5 py-0.5 rounded">⌘ K</span>
                        </div>
                    </div>
                </div>

                {/* Center: Title (Floating Context) */}
                <div className="hidden lg:block text-sm font-bold text-zinc-400/50 uppercase tracking-widest pointer-events-none select-none">
                    {pageTitle === 'home' ? 'Dashboard' : pageTitle.replace('_', ' ')}
                </div>

                {/* Right: Actions */}
                <div className="flex-1 flex items-center justify-end gap-3 pointer-events-auto">

                    {/* Create Task Button */}
                    <button
                        onClick={onOpenTask}
                        className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-rose-50/90 hover:bg-rose-100 dark:bg-rose-900/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded-full text-xs font-bold uppercase tracking-wider transition-all backdrop-blur-md shadow-sm hover:shadow border border-rose-100/50 dark:border-rose-900/50"
                    >
                        <div className="p-0.5 bg-rose-200 dark:bg-rose-800 rounded-full"><Icons.Plus size={12} /></div>
                        <span className="pr-1">New Task</span>
                    </button>

                    {/* Notifications - Using real NotificationBell */}
                    <NotificationBell onNavigate={onNavigate} />

                    {/* User Menu */}
                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 ml-1"
                    >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-zinc-950">
                            {user?.name?.[0] || 'U'}
                        </div>
                        <span className="hidden md:block text-xs font-medium text-zinc-700 dark:text-zinc-200">{user?.name || 'User'}</span>
                    </button>

                    {/* Mobile Create Task (Only icon) */}
                    <button
                        onClick={onOpenTask}
                        className="md:hidden p-3 bg-rose-500 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all hover:scale-105 active:scale-95"
                    >
                        <Icons.Plus size={20} />
                    </button>

                </div>
            </div>
            <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
        </header>
    );
};
