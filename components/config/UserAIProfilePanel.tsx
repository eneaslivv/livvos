/**
 * UserAIProfilePanel — per-user AI preferences.
 *
 * Lives next to AIPreferencesPanel inside Configuration → AI. Important
 * distinction:
 *   • AIPreferencesPanel  → tenant-wide (business description, brand voice,
 *     org-level tone). Affects EVERY user in the workspace.
 *   • UserAIProfilePanel  → just you (this signed-in user). Affects only
 *     your turns with Brief / AiAdvisor. The orchestrator merges both
 *     when building each prompt.
 *
 * What lives here:
 *   • Explicit preferences (preferred_tone, length, language) — saved
 *     to `agent_user_profiles` and injected via formatProfileForPrompt.
 *   • Manual notes + style rules — hard constraints the AI must respect.
 *   • Learned traits (read-only by default) — populated by runCritique
 *     over the last 30 days of conversations + feedback signals. User
 *     can click "Analyze my conversations" to recompute, or hit Edit to
 *     tweak before saving.
 *
 * "Why two profiles?" Tenant profile says what the BUSINESS sounds like.
 * User profile says what THIS person wants from the AI. They compose.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  getUserProfile,
  saveUserProfile,
  runCritique,
  type UserProfile,
} from '../../lib/agents';

const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'friendly',  label: 'Friendly (default)' },
  { value: 'concise',   label: 'Concise — no fluff' },
  { value: 'formal',    label: 'Formal — business' },
  { value: 'casual',    label: 'Casual — like a teammate' },
  { value: 'direct',    label: 'Direct — get to the point' },
];

const LENGTH_OPTIONS: { value: string; label: string }[] = [
  { value: 'short',  label: 'Short (1–2 paragraphs)' },
  { value: 'medium', label: 'Medium (default)' },
  { value: 'long',   label: 'Long — give me detail' },
];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto',    label: 'Auto-detect from question' },
  { value: 'es',      label: 'Español' },
  { value: 'en',      label: 'English' },
  { value: 'pt',      label: 'Português' },
];

export const UserAIProfilePanel: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingTraits, setEditingTraits] = useState(false);
  const [styleRuleDraft, setStyleRuleDraft] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  // Critique result is held separately so the user can review stats
  // before re-saving. The traits get merged into `profile` only after
  // they hit save.
  const [critiqueStats, setCritiqueStats] = useState<null | {
    total_turns: number;
    thumbs_up: number;
    thumbs_down: number;
    re_asks: number;
    actions_confirmed: number;
    actions_skipped: number;
    most_used_agent: string | null;
    pct_no_data: number;
  }>(null);

  // ── Load profile on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !currentTenant?.id) return;
    let cancelled = false;
    setLoading(true);
    getUserProfile(supabase as any, { userId: user.id, tenantId: currentTenant.id })
      .then(p => { if (!cancelled) { setProfile(p); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, currentTenant?.id]);

  const updateField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile(prev => prev ? { ...prev, [key]: value } : prev);
  };

  // ── Style rules: tag-style add/remove ──────────────────────────────
  const addStyleRule = () => {
    const trimmed = styleRuleDraft.trim();
    if (!trimmed || !profile) return;
    if (profile.style_rules.includes(trimmed)) { setStyleRuleDraft(''); return; }
    updateField('style_rules', [...profile.style_rules, trimmed]);
    setStyleRuleDraft('');
  };

  const removeStyleRule = (rule: string) => {
    if (!profile) return;
    updateField('style_rules', profile.style_rules.filter(r => r !== rule));
  };

  // ── Save profile ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!profile || !user?.id || !currentTenant?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveUserProfile(supabase as any, {
        userId: user.id,
        tenantId: currentTenant.id,
        updates: {
          preferred_tone: profile.preferred_tone,
          preferred_reply_length: profile.preferred_reply_length,
          preferred_language: profile.preferred_language,
          manual_notes: profile.manual_notes,
          style_rules: profile.style_rules,
          learned_traits: profile.learned_traits,
        },
      });
      setMessage({ text: 'Saved. Your next AI reply will use these preferences.', type: 'success' });
      setEditingTraits(false);
    } catch (err: any) {
      setMessage({ text: err?.message || 'Could not save preferences.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── Run critique on demand ─────────────────────────────────────────
  // Pulls last 50 turns + feedback stats, asks the meta-analyzer to
  // distill a bulleted "what we know about this user" summary, and
  // shows it for review. Stats are surfaced below the button so the
  // user can see how much data the critique had to work with.
  const handleAnalyze = async () => {
    if (!user?.id || !currentTenant?.id) return;
    setAnalyzing(true);
    setMessage(null);
    try {
      const result = await runCritique({
        db: supabase as any,
        userId: user.id,
        tenantId: currentTenant.id,
        sinceDays: 30,
      });
      setCritiqueStats(result.stats);
      if (result.learned_traits) {
        setProfile(prev => prev ? { ...prev, learned_traits: result.learned_traits as string } : prev);
        setMessage({
          text: `Analyzed ${result.stats.total_turns} recent turns. Review the learned traits below — they're already saved.`,
          type: 'success',
        });
      } else if (result.stats.total_turns < 3) {
        setMessage({
          text: `Need at least 3 conversations to learn from. You have ${result.stats.total_turns}.`,
          type: 'error',
        });
      } else {
        setMessage({ text: 'Analysis ran but the meta-model returned nothing actionable.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err?.message || 'Analysis failed.', type: 'error' });
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Topic weights summary (read-only chips) ────────────────────────
  // The critique loop also populates topic_weights — show them so the
  // user can SEE what areas dominate their AI use.
  const topTopics = useMemo(() => {
    if (!profile?.topic_weights) return [];
    return Object.entries(profile.topic_weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [profile?.topic_weights]);

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icons.Loader className="animate-spin text-zinc-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Your personal AI profile</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Only affects how the AI replies to <span className="font-medium">you</span> (Brief, Advisor). Different
          from the tenant-wide "AI Preferences" above — those describe your business; this one describes how
          you want the assistant to talk to you.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tone / length / language */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Tone">
          <select
            value={profile.preferred_tone}
            onChange={e => updateField('preferred_tone', e.target.value)}
            className={inputClass}
          >
            {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Reply length">
          <select
            value={profile.preferred_reply_length}
            onChange={e => updateField('preferred_reply_length', e.target.value)}
            className={inputClass}
          >
            {LENGTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Language">
          <select
            value={profile.preferred_language}
            onChange={e => updateField('preferred_language', e.target.value)}
            className={inputClass}
          >
            {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      {/* Manual notes — free-form catch-all */}
      <Field
        label="Notes for the AI about you"
        hint="Anything you want it to always remember (role, communication style, recurring projects, allergies)."
      >
        <textarea
          value={profile.manual_notes || ''}
          onChange={e => updateField('manual_notes', e.target.value)}
          rows={4}
          placeholder="e.g. I'm the founder. I work in 3-hour deep blocks Mon/Wed/Fri mornings. Don't suggest meetings before 10am. Prefer Spanish for casual replies, English for client-facing drafts."
          className={inputClass}
        />
      </Field>

      {/* Style rules — hard constraints, surfaced as tags */}
      <Field
        label="Style rules (hard constraints)"
        hint="Things the AI MUST follow. Press Enter to add. Example: 'never use emoji', 'always reply in under 100 words'."
      >
        <div className="flex flex-wrap gap-2 mb-2">
          {profile.style_rules.length === 0 && (
            <span className="text-[11px] text-zinc-400 italic">No rules yet.</span>
          )}
          {profile.style_rules.map(rule => (
            <span
              key={rule}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 rounded-full text-xs"
            >
              {rule}
              <button
                type="button"
                onClick={() => removeStyleRule(rule)}
                className="hover:text-rose-900 dark:hover:text-rose-100"
                aria-label={`Remove rule: ${rule}`}
              >
                <Icons.X size={12} />
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={styleRuleDraft}
          onChange={e => setStyleRuleDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addStyleRule(); }
          }}
          placeholder="never use emoji"
          className={inputClass}
        />
      </Field>

      {/* Learned traits — populated by critique loop ────────────────── */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              What the AI has learned about you
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Updated automatically from your recent conversations + thumbs feedback. Edit if anything's wrong —
              it'll be injected into every future prompt.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {analyzing ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Sparkles size={12} />}
            {analyzing ? 'Analyzing…' : 'Analyze my conversations'}
          </button>
        </div>

        {/* Critique stats — shown if the user just ran analysis */}
        {critiqueStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Stat label="Turns analyzed" value={critiqueStats.total_turns} />
            <Stat
              label="Approve rate"
              value={
                critiqueStats.actions_confirmed + critiqueStats.actions_skipped > 0
                  ? `${Math.round((critiqueStats.actions_confirmed /
                      (critiqueStats.actions_confirmed + critiqueStats.actions_skipped)) * 100)}%`
                  : '—'
              }
            />
            <Stat
              label="Thumbs"
              value={`${critiqueStats.thumbs_up}↑ ${critiqueStats.thumbs_down}↓`}
            />
            <Stat label="Re-asks" value={critiqueStats.re_asks} />
          </div>
        )}

        {/* Editable traits — by default read-only with an Edit toggle so
            random clicks don't blow away learned content. */}
        <div className="relative">
          {editingTraits ? (
            <textarea
              value={profile.learned_traits || ''}
              onChange={e => updateField('learned_traits', e.target.value)}
              rows={8}
              placeholder="• You ask short, urgent questions in Spanish&#10;• You confirm ~80% of proposed actions&#10;• You tend to re-ask when the AI hedges"
              className={inputClass}
            />
          ) : (
            <pre className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap font-sans min-h-[6rem]">
              {profile.learned_traits || (
                <span className="text-zinc-400 italic">
                  Nothing yet. Use the AI a few times then click "Analyze my conversations".
                </span>
              )}
            </pre>
          )}
          <button
            type="button"
            onClick={() => setEditingTraits(v => !v)}
            className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            {editingTraits ? <><Icons.Check size={10} /> Done</> : <><Icons.Edit size={10} /> Edit</>}
          </button>
        </div>

        {/* Topic weights from the critique loop */}
        {topTopics.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Areas you use most
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topTopics.map(([topic, weight]) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[11px]"
                >
                  {topic}
                  <span className="text-[9px] text-indigo-400 dark:text-indigo-500 tabular-nums">
                    {Math.round(weight * 100)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-900">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {saving ? <Icons.Loader size={14} className="animate-spin" /> : <Icons.Save size={14} />}
          Save my profile
        </button>
      </div>
    </div>
  );
};

const inputClass =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
      {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
    </div>
    {children}
  </label>
);

const Stat: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
    <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums mt-0.5">{value}</div>
  </div>
);
