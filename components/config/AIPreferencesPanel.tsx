import React, { useEffect, useState } from 'react';
import { Icons } from '../ui/Icons';
import { useTenant } from '../../context/TenantContext';
import {
  getTenantAIProfile,
  upsertTenantAIProfile,
  clearAICache,
  TENANT_AI_PROFILE_TONES,
  TENANT_AI_PROFILE_LANGUAGES,
  type TenantAIProfile,
} from '../../lib/ai';

const EMPTY: Omit<TenantAIProfile, 'tenant_id' | 'updated_at'> = {
  business_description: '',
  industry: '',
  target_audience: '',
  brand_voice: '',
  tone: 'professional',
  primary_language: 'es',
  goals: [],
  constraints: '',
  custom_instructions: '',
  last_active_projects_summary: null,
  last_finance_summary: null,
};

export const AIPreferencesPanel: React.FC = () => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [goalDraft, setGoalDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!currentTenant?.id) return;
    let active = true;
    setLoading(true);
    getTenantAIProfile(currentTenant.id).then((p) => {
      if (!active) return;
      if (p) {
        setForm({
          business_description: p.business_description ?? '',
          industry: p.industry ?? '',
          target_audience: p.target_audience ?? '',
          brand_voice: p.brand_voice ?? '',
          tone: p.tone ?? 'professional',
          primary_language: p.primary_language ?? 'es',
          goals: p.goals ?? [],
          constraints: p.constraints ?? '',
          custom_instructions: p.custom_instructions ?? '',
          last_active_projects_summary: p.last_active_projects_summary ?? null,
          last_finance_summary: p.last_finance_summary ?? null,
        });
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [currentTenant?.id]);

  const update = <K extends keyof typeof EMPTY>(key: K, value: typeof EMPTY[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addGoal = () => {
    const trimmed = goalDraft.trim();
    if (!trimmed) return;
    if (form.goals && form.goals.includes(trimmed)) return;
    update('goals', [...(form.goals || []), trimmed]);
    setGoalDraft('');
  };

  const removeGoal = (g: string) => {
    update('goals', (form.goals || []).filter((x) => x !== g));
  };

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    setSaving(true);
    setMessage(null);
    const result = await upsertTenantAIProfile(currentTenant.id, {
      business_description: form.business_description?.trim() || null,
      industry: form.industry?.trim() || null,
      target_audience: form.target_audience?.trim() || null,
      brand_voice: form.brand_voice?.trim() || null,
      tone: form.tone || null,
      primary_language: form.primary_language || null,
      goals: form.goals && form.goals.length ? form.goals : null,
      constraints: form.constraints?.trim() || null,
      custom_instructions: form.custom_instructions?.trim() || null,
    });
    if (result) {
      // Profile changed → AI cache is now stale (cached responses don't reflect new tone/audience)
      clearAICache();
      setMessage({ text: 'AI preferences saved. Cached responses cleared.', type: 'success' });
    } else {
      setMessage({ text: 'Failed to save preferences. Check console.', type: 'error' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icons.Loader className="animate-spin text-zinc-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">AI Preferences</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Set how AI features represent your business. These fields are injected into every AI prompt
          (advisor, blog, proposal, weekly summary, etc.) so responses stay grounded in your context,
          tone, and goals — instead of generic templates.
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

      {/* Business description */}
      <Field label="Business description" hint="One sentence on what you do and for whom.">
        <textarea
          value={form.business_description || ''}
          onChange={(e) => update('business_description', e.target.value)}
          rows={2}
          placeholder="e.g. Boutique branding studio for restaurants in Buenos Aires."
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Industry">
          <input
            type="text"
            value={form.industry || ''}
            onChange={(e) => update('industry', e.target.value)}
            placeholder="Creative agency, SaaS, E-commerce..."
            className={inputClass}
          />
        </Field>
        <Field label="Target audience" hint="Who are your clients?">
          <input
            type="text"
            value={form.target_audience || ''}
            onChange={(e) => update('target_audience', e.target.value)}
            placeholder="Mid-market restaurants, $500k–$5M revenue."
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Brand voice" hint="How should AI write on your behalf?">
        <textarea
          value={form.brand_voice || ''}
          onChange={(e) => update('brand_voice', e.target.value)}
          rows={2}
          placeholder="Confident, direct, slightly playful. Avoids jargon and corporate filler."
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Default tone">
          <select
            value={form.tone || 'professional'}
            onChange={(e) => update('tone', e.target.value)}
            className={inputClass}
          >
            {TENANT_AI_PROFILE_TONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Preferred language">
          <select
            value={form.primary_language || 'es'}
            onChange={(e) => update('primary_language', e.target.value)}
            className={inputClass}
          >
            {TENANT_AI_PROFILE_LANGUAGES.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Goals */}
      <Field label="Current goals" hint="Add objectives you want AI to keep in mind. Press Enter to add.">
        <div className="flex flex-wrap gap-2 mb-2">
          {(form.goals || []).map((g) => (
            <span key={g} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs">
              {g}
              <button onClick={() => removeGoal(g)} className="hover:text-red-500">
                <Icons.X size={12} />
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={goalDraft}
          onChange={(e) => setGoalDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addGoal();
            }
          }}
          placeholder="e.g. Close 2 new clients per month"
          className={inputClass}
        />
      </Field>

      <Field label="Constraints" hint="Things AI should avoid recommending.">
        <textarea
          value={form.constraints || ''}
          onChange={(e) => update('constraints', e.target.value)}
          rows={2}
          placeholder="e.g. Don't propose projects under $5k. Avoid retail clients."
          className={inputClass}
        />
      </Field>

      <Field label="Custom instructions" hint="Catch-all rules. Higher priority than AI defaults.">
        <textarea
          value={form.custom_instructions || ''}
          onChange={(e) => update('custom_instructions', e.target.value)}
          rows={3}
          placeholder="e.g. Always mention sustainability angle in proposals. Prefer bullet points over paragraphs."
          className={inputClass}
        />
      </Field>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {saving ? <Icons.Loader size={14} className="animate-spin" /> : <Icons.Save size={14} />}
          Save preferences
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
