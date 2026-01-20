import React, { useState, useRef, useEffect } from 'react';
import { Icons } from './ui/Icons';
import { useNotifications, Notification } from '../context/NotificationsContext';

interface NotificationBellProps {
    onNavigate?: (path: string) => void;
}

const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
        case 'lead':
            return <Icons.Mail size={14} className="text-purple-500" />;
        case 'task':
            return <Icons.Check size={14} className="text-emerald-500" />;
        case 'project':
            return <Icons.Briefcase size={14} className="text-blue-500" />;
        case 'invite':
            return <Icons.Users size={14} className="text-amber-500" />;
        case 'activity':
            return <Icons.Activity size={14} className="text-rose-500" />;
        default:
            return <Icons.Bell size={14} className="text-zinc-500" />;
    }
};

const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
};

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            await markAsRead(notification.id);
        }
        if (notification.link && onNavigate) {
            // Convert link like '/sales_leads' to page name like 'sales_leads'
            const pageName = notification.link.replace('/', '');
            onNavigate(pageName as any);
        }
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                title="Notifications"
            >
                <Icons.Bell
                    size={20}
                    className="text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors"
                />

                {/* Unread Badge */}
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full animate-in zoom-in duration-200">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-[360px] overflow-y-auto">
                        {isLoading ? (
                            <div className="p-8 text-center text-zinc-400">
                                <div className="animate-spin w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full mx-auto mb-2" />
                                Loading...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icons.Bell size={24} className="text-zinc-400" />
                                </div>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">No notifications yet</p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                    We'll notify you when something happens
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {notifications.slice(0, 10).map((notification) => (
                                    <button
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex gap-3 ${!notification.read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                                            }`}
                                    >
                                        {/* Icon */}
                                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                            {getNotificationIcon(notification.type)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm truncate ${!notification.read ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                    {notification.title}
                                                </p>
                                                {!notification.read && (
                                                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                            {notification.message && (
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                                                    {notification.message}
                                                </p>
                                            )}
                                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                                                {getTimeAgo(notification.created_at)}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 10 && (
                        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                            <button
                                onClick={() => {
                                    // Could navigate to full notifications page
                                    setIsOpen(false);
                                }}
                                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 w-full text-center"
                            >
                                View all {notifications.length} notifications
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
