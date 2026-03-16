import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { Modal } from '../ui/Modal';
import { GeneralSettings } from './GeneralSettings';
import { ServiceManagement } from './ServiceManagement';
import { RoleManagement } from './RoleManagement';
import { PaymentSettings } from './PaymentSettings';
import { UserManagement } from './UserManagement';
import { EmailPreferences } from './EmailPreferences';
import { useRBAC } from '../../context/RBACContext';
import { supabase } from '../../lib/supabase';
import type { PageView } from '../../types';

interface ConfigurationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (page: PageView) => void;
}

type Tab = 'general' | 'services' | 'billing' | 'users' | 'content' | 'roles' | 'email';

export const ConfigurationModal: React.FC<ConfigurationModalProps> = ({ isOpen, onClose, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const { user, roles, hasPermission, isAdmin } = useRBAC();

    const ALL_TABS: { id: Tab; label: string; icon: any; requireAdmin?: boolean; permission?: { module: any; action: any } }[] = [
        { id: 'general', label: 'General', icon: Icons.Settings },
        { id: 'services', label: 'Services', icon: Icons.Grid, requireAdmin: true },
        { id: 'content', label: 'Content', icon: Icons.File, requireAdmin: true },
        { id: 'billing', label: 'Billing', icon: Icons.CreditCard, permission: { module: 'finance', action: 'view' } },
        { id: 'users', label: 'Members', icon: Icons.Users, requireAdmin: true },
        { id: 'roles', label: 'Roles', icon: Icons.Shield, requireAdmin: true },
        { id: 'email', label: 'Email', icon: Icons.Mail },
    ];

    const TABS = ALL_TABS.filter(tab => {
        if (tab.requireAdmin) return isAdmin();
        if (tab.permission) return hasPermission(tab.permission.module, tab.permission.action);
        return true;
    });

    // Reset to first visible tab if current tab got filtered out
    useEffect(() => {
        if (TABS.length > 0 && !TABS.some(t => t.id === activeTab)) {
            setActiveTab(TABS[0].id);
        }
    }, [TABS, activeTab]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="4xl"
        >
            <div className="h-[min(600px,70vh)] flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 bg-zinc-50/50 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
                    <div className="p-6 border-b border-zinc-100 dark:border-zinc-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
                                {user?.name?.[0] || 'E'}
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-zinc-900 dark:text-zinc-100">{user?.name || 'User'}</div>
                                <div className="text-xs text-zinc-500 font-medium">{roles[0]?.name || 'Guest'}</div>
                                {user?.email && (
                                    <div className="text-[10px] text-zinc-400 truncate" title={user.email}>{user.email}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <nav className="flex-1 p-4 space-y-1">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    if (tab.id === 'content' && onNavigate) {
                                        onClose();
                                        onNavigate('content_cms');
                                        return;
                                    }
                                    setActiveTab(tab.id);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id
                                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50'
                                    }`}
                            >
                                <tab.icon size={18} className={activeTab === tab.id ? 'text-indigo-500' : 'text-zinc-400'} />
                                {tab.label}
                                {tab.id === 'content' && <Icons.External size={12} className="ml-auto text-zinc-400" />}
                            </button>
                        ))}
                    </nav>

                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                            onClick={async () => {
                                await supabase.auth.signOut();
                                onClose();
                            }}
                            className="flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors w-full px-2"
                        >
                            <Icons.LogOut size={14} />
                            Sign out
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950">
                    <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 dark:border-zinc-900">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                            {TABS.find(t => t.id === activeTab)?.label}
                        </h2>
                        <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                            <Icons.X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8">
                        {activeTab === 'general' && <GeneralSettings />}
                        {activeTab === 'services' && <ServiceManagement />}
                        {activeTab === 'billing' && <PaymentSettings />}
                        {activeTab === 'users' && <UserManagement />}

                        {activeTab === 'roles' && <RoleManagement />}
                        {activeTab === 'email' && <EmailPreferences />}
                    </div>
                </div>
            </div>
        </Modal>
    );
};
