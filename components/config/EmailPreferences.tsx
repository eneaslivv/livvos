import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../context/TenantContext';
import { Icons } from '../ui/Icons';

interface EmailPref {
  notification_type: string;
  email_enabled: boolean;
  min_priority: string;
}

const NOTIFICATION_TYPES = [
  { type: 'task', label: 'Task assignments', description: 'When a task is assigned to you' },
  { type: 'deadline', label: 'Deadlines', description: 'Reminders for upcoming due dates' },
  { type: 'project', label: 'Project updates', description: 'New projects and status changes' },
  { type: 'system', label: 'System alerts', description: 'Important system notifications' },
  { type: 'security', label: 'Security alerts', description: 'Login attempts and access changes' },
  { type: 'billing', label: 'Billing', description: 'Payment and invoice updates' },
  { type: 'invite', label: 'Invitations', description: 'Team and client invitations' },
  { type: 'mention', label: 'Mentions', description: 'When someone mentions you' },
] as const;

const DEFAULTS: Record<string, boolean> = {
  task: true,
  deadline: true,
  project: false,
  system: false,
  security: true,
  billing: true,
  invite: true,
  mention: true,
};

export const EmailPreferences: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [prefs, setPrefs] = useState<EmailPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPrefs = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('email_preferences')
        .select('notification_type, email_enabled, min_priority')
        .eq('user_id', user.id);
      setPrefs(data || []);
    } catch {
      // Table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const isEnabled = (type: string): boolean => {
    const pref = prefs.find(p => p.notification_type === type);
    if (pref) return pref.email_enabled;
    return DEFAULTS[type] ?? true;
  };

  const togglePref = async (type: string) => {
    if (!user || !currentTenant) return;
    const current = isEnabled(type);
    setSaving(type);

    try {
      await supabase
        .from('email_preferences')
        .upsert({
          user_id: user.id,
          tenant_id: currentTenant.id,
          notification_type: type,
          email_enabled: !current,
          min_priority: 'high',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,notification_type' });

      setPrefs(prev => {
        const existing = prev.find(p => p.notification_type === type);
        if (existing) {
          return prev.map(p => p.notification_type === type ? { ...p, email_enabled: !current } : p);
        }
        return [...prev, { notification_type: type, email_enabled: !current, min_priority: 'high' }];
      });
    } catch {
      // Silently fail
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Email Notifications</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Choose which notifications you want to receive by email. In-app notifications are always enabled.
        </p>
      </div>

      <div className="space-y-1">
        {NOTIFICATION_TYPES.map(({ type, label, description }) => {
          const enabled = isEnabled(type);
          const isSaving = saving === type;

          return (
            <div
              key={type}
              className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
                  <div className="text-xs text-zinc-500">{description}</div>
                </div>
              </div>

              <button
                onClick={() => togglePref(type)}
                disabled={isSaving}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  enabled
                    ? 'bg-emerald-500'
                    : 'bg-zinc-300 dark:bg-zinc-600'
                } ${isSaving ? 'opacity-50' : ''}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-400">
          Emails are sent for high and urgent priority notifications by default. From: onboarding@resend.dev
        </p>
      </div>
    </div>
  );
};
