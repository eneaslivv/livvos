/**
 * NotificationBell — clickable badge in the top navbar.
 *
 * Used to render its own dropdown; that's been replaced by
 * NotificationsDrawer (a full-height side panel) so users can see
 * everything at a glance, filter, and act without dismissing.  This
 * file now only handles the badge + open/close state.
 *
 * Deep-linking: notifications carry `link` (e.g. '/calendar?task=<uuid>').
 * The drawer parses it and forwards `taskId` via NavParams so the App
 * router opens the matching task drawer.
 */
import React, { useState, useCallback } from 'react';
import { Icons } from './ui/Icons';
import { useNotifications } from '../context/NotificationsContext';
import { NotificationsDrawer, type DrawerNavParams } from './NotificationsDrawer';
import type { PageView, NavParams } from '../types';

interface NotificationBellProps {
    onNavigate?: (path: PageView, params?: NavParams) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
    const { unreadCount } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);

    const handleDrawerNavigate = useCallback((page: string, params?: DrawerNavParams) => {
        if (!onNavigate) return;
        // The drawer feeds a path-style page name (no leading slash). The App
        // router uses a string union for valid pages, so we cast — invalid
        // links just fall through to a no-op page change in App.tsx.
        onNavigate(page as PageView, params as NavParams);
    }, [onNavigate]);

    return (
        <>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="relative p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                title="Notifications"
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
            >
                <Icons.Bell
                    size={16}
                    strokeWidth={2}
                    className="text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors"
                />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 min-w-[14px] h-[14px] flex items-center justify-center px-0.5 text-[9px] font-semibold text-white bg-rose-500 rounded-full animate-in zoom-in duration-200">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            <NotificationsDrawer
                open={isOpen}
                onClose={() => setIsOpen(false)}
                onNavigate={handleDrawerNavigate}
            />
        </>
    );
};
