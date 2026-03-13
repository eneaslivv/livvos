import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../context/TenantContext';

interface PlanningPreferencesProps {
  expanded: boolean;
  onToggle: () => void;
  preferences: string;
  onPreferencesChange: (prefs: string) => void;
}

export const PlanningPreferences: React.FC<PlanningPreferencesProps> = ({
  expanded,
  onToggle,
  preferences,
  onPreferencesChange,
}) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!user?.id || !currentTenant?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('planning_preferences')
        .upsert(
          { user_id: user.id, tenant_id: currentTenant.id, preferences, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,tenant_id' }
        );
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[PlanPrefs] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) return null;

  return (
    <div className="px-4 pb-3 border-t border-violet-100 dark:border-violet-900/30">
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Icons.Settings size={11} className="text-violet-400" />
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Planning Preferences
            </span>
          </div>
          <button
            onClick={onToggle}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Close
          </button>
        </div>
        <textarea
          value={preferences}
          onChange={e => onPreferencesChange(e.target.value)}
          placeholder={`Examples:\n• Deep work mornings (before 12pm)\n• No heavy tasks on Fridays\n• Assign design tasks to Maria\n• Keep meetings clustered together\n• Max 3 high-priority tasks per day`}
          rows={4}
          className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 dark:focus:border-violet-600 placeholder-zinc-400 resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-zinc-400">
            These preferences guide the AI when reorganizing your tasks
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 text-white rounded-md text-[10px] font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {saved ? (
              <>
                <Icons.Check size={10} />
                Saved
              </>
            ) : saving ? (
              <>
                <Icons.Loader size={10} className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
