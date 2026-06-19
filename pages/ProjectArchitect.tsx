import React, { useCallback, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Sparkles, Loader2, Check, AlertTriangle,
} from 'lucide-react';

import { Eyebrow, ButtonPill } from '../components/ui/LivvPrimitives';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useRBAC } from '../context/RBACContext';
import type { ExecutionContext } from '../lib/agents';
import {
  proposeStructure,
  persistAndLogEdits,
  planStageDates,
  PROJECT_TYPES,
} from '../lib/projectArchitect';
import type {
  EditableStructure,
  EditableStage,
  ProjectType,
} from '../lib/projectArchitect';
import type { PageView, NavParams } from '../types';

interface ProjectArchitectProps {
  onNavigate: (page: PageView, params?: NavParams) => void;
}

const TYPE_LABELS: Record<string, string> = {
  auto: 'Detect from brief',
  web_webflow: 'Web in Webflow',
  web_framer: 'Web in Framer',
  app_react_native: 'App in React Native',
  app_flutter: 'App in Flutter',
  ai_integration: 'AI integration',
  own_product: 'Own product',
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);

const clone = (s: EditableStructure): EditableStructure =>
  JSON.parse(JSON.stringify(s));

let uiKeySeq = 0;
const newKey = (p: string) => `${p}_ui_${uiKeySeq++}`;

/** Re-run the date planner over the current stages and merge the new dates
 *  back in. Keys stay stable so an edit reads as a date change, not a rebuild. */
const replan = (structure: EditableStructure): EditableStructure => {
  const plan = planStageDates(
    structure.stages.map((s) => ({
      name: s.name,
      order: s.order,
      effort_weight: s.effort_weight,
      tasks: s.tasks.map((t) => ({
        title: t.title,
        estimate_hours: t.estimate_hours,
        depends_on: t.depends_on,
      })),
    })),
    {
      startDate: structure.project.start_date || todayISO(),
      hardDeadline: structure.project.hard_deadline || null,
    },
  );
  return {
    ...structure,
    stages: structure.stages.map((s, i) => ({
      ...s,
      planned_start: plan.stages[i]?.planned_start ?? s.planned_start,
      planned_end: plan.stages[i]?.planned_end ?? s.planned_end,
      working_days: plan.stages[i]?.working_days ?? s.working_days,
    })),
  };
};

export const ProjectArchitect: React.FC<ProjectArchitectProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { hasPermission } = useRBAC();

  const [brief, setBrief] = useState('');
  const [type, setType] = useState<ProjectType | 'auto'>('auto');
  const [hardDeadline, setHardDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const [original, setOriginal] = useState<EditableStructure | null>(null);
  const [edited, setEdited] = useState<EditableStructure | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const canView = hasPermission('projects', 'view');
  const canCreate = hasPermission('projects', 'create') || hasPermission('projects', 'edit');

  const totalHours = useMemo(() => {
    if (!edited) return 0;
    return edited.stages.reduce(
      (sum, s) => sum + s.tasks.reduce((a, t) => a + (t.estimate_hours || 0), 0),
      0,
    );
  }, [edited]);

  const generate = useCallback(async () => {
    setError(null);
    setSavedProjectId(null);
    if (!brief.trim()) { setError('Write a short brief first.'); return; }
    if (!currentTenant?.id || !user?.id) { setError('No active workspace.'); return; }

    setLoading(true);
    const ctx: ExecutionContext = { db: supabase, userId: user.id, tenantId: currentTenant.id };
    try {
      const result = await proposeStructure({
        brief: brief.trim(),
        type,
        hardDeadline: hardDeadline || null,
        startDate: todayISO(),
        ctx,
      });
      if (!result.ok || !result.structure) {
        setError(
          result.error === 'no_blueprint' || result.error === 'no_blueprints'
            ? 'No blueprints found. Run the project architect migrations first.'
            : `Could not generate a plan (${result.error || 'unknown'}).`,
        );
        setOriginal(null);
        setEdited(null);
      } else {
        setOriginal(clone(result.structure));
        setEdited(result.structure);
        setUsedFallback(result.usedFallback);
      }
    } catch (e) {
      setError((e as Error)?.message || 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [brief, type, hardDeadline, currentTenant?.id, user?.id]);

  // ── edit handlers (mutate `edited`, keep `original` frozen) ──────────
  const update = useCallback((fn: (s: EditableStructure) => EditableStructure) => {
    setEdited((prev) => (prev ? fn(clone(prev)) : prev));
  }, []);

  const setStage = (s: EditableStructure, key: string, fn: (st: EditableStage) => EditableStage) => ({
    ...s,
    stages: s.stages.map((st) => (st._key === key ? fn(st) : st)),
  });

  const renameTask = (stageKey: string, taskKey: string, title: string) =>
    update((s) => setStage(s, stageKey, (st) => ({
      ...st,
      tasks: st.tasks.map((t) => (t._key === taskKey ? { ...t, title } : t)),
    })));

  const changeEstimate = (stageKey: string, taskKey: string, hours: number) =>
    update((s) => setStage(s, stageKey, (st) => ({
      ...st,
      tasks: st.tasks.map((t) => (t._key === taskKey ? { ...t, estimate_hours: hours } : t)),
    })));

  const addTask = (stageKey: string) =>
    update((s) => setStage(s, stageKey, (st) => ({
      ...st,
      tasks: [...st.tasks, { _key: newKey('task'), title: 'New task', estimate_hours: 2, depends_on: null }],
    })));

  const removeTask = (stageKey: string, taskKey: string) =>
    update((s) => setStage(s, stageKey, (st) => ({
      ...st,
      tasks: st.tasks.filter((t) => t._key !== taskKey),
    })));

  const addStage = () =>
    update((s) => ({
      ...s,
      stages: [
        ...s.stages,
        {
          _key: newKey('stage'),
          name: 'new_stage',
          order: s.stages.length + 1,
          effort_weight: 0.05,
          planned_start: null,
          planned_end: null,
          tasks: [],
        },
      ],
    }));

  const removeStage = (stageKey: string) =>
    update((s) => ({ ...s, stages: s.stages.filter((st) => st._key !== stageKey) }));

  const moveStage = (stageKey: string, dir: -1 | 1) =>
    update((s) => {
      const idx = s.stages.findIndex((st) => st._key === stageKey);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= s.stages.length) return s;
      const stages = [...s.stages];
      [stages[idx], stages[target]] = [stages[target], stages[idx]];
      return { ...s, stages: stages.map((st, i) => ({ ...st, order: i + 1 })) };
    });

  const replanNow = () => update((s) => replan(s));

  const changeDeadline = (value: string) =>
    update((s) => replan({ ...s, project: { ...s.project, hard_deadline: value || null } }));

  const approve = useCallback(async () => {
    if (!original || !edited || !currentTenant?.id) return;
    setSaving(true);
    setError(null);
    try {
      const result = await persistAndLogEdits(original, edited, currentTenant.id);
      if (result.ok && result.projectId) {
        setSavedProjectId(result.projectId);
      } else {
        setError(`Could not save (${result.error || 'unknown'}).`);
      }
    } catch (e) {
      setError((e as Error)?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [original, edited, currentTenant?.id]);

  const reset = () => {
    setOriginal(null);
    setEdited(null);
    setSavedProjectId(null);
    setBrief('');
    setError(null);
  };

  if (!canView) {
    return (
      <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--os-fg-2)' }}>
        <h2 style={{ color: 'var(--os-fg-0)', fontWeight: 300 }}>Access restricted</h2>
        <p>You do not have permission to view the project architect.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 0 96px' }}>
      <header style={{ marginBottom: 22 }}>
        <Eyebrow gold>Project architect</Eyebrow>
        <h1 style={{
          fontFamily: 'var(--font-sans)', fontWeight: 300, letterSpacing: '-0.03em',
          fontSize: 'clamp(22px, 2.4vw, 30px)', color: 'var(--os-fg-0)', margin: '6px 0 0',
        }}>
          Open a project, get a plan
        </h1>
        <p style={{ color: 'var(--os-fg-2)', fontSize: 13, marginTop: 6, maxWidth: 640 }}>
          Describe the work. The architect classifies it, applies the right blueprint, and proposes
          stages, tasks, and dates. You review and approve before anything is saved.
        </p>
      </header>

      {/* Brief input */}
      <section style={cardStyle}>
        <label style={labelStyle}>Brief</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="web in Framer for client X, e-commerce, hard deadline mid August"
          rows={3}
          style={textareaStyle}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ProjectType | 'auto')} style={selectStyle}>
              <option value="auto">{TYPE_LABELS.auto}</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Hard deadline (optional)</label>
            <input type="date" value={hardDeadline} onChange={(e) => setHardDeadline(e.target.value)} style={selectStyle} />
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <ButtonPill onClick={generate} disabled={loading || !brief.trim()} arrow={false}>
              {loading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Generating
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={15} /> Generate plan
                </span>
              )}
            </ButtonPill>
          </div>
        </div>
      </section>

      {error && (
        <div style={calloutStyle('error')}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Saved confirmation */}
      {savedProjectId && (
        <div style={calloutStyle('success')}>
          <Check size={15} /> Saved. Project id <code style={{ fontFamily: 'var(--font-mono)' }}>{savedProjectId}</code>.
          <button onClick={reset} style={linkBtnStyle}>Plan another</button>
        </div>
      )}

      {/* Preview */}
      {edited && !savedProjectId && (
        <section style={{ marginTop: 20 }}>
          {usedFallback && (
            <div style={calloutStyle('warning')}>
              <AlertTriangle size={15} /> The model was unavailable, so the blueprint was applied as-is. Review before saving.
            </div>
          )}

          {edited.missing_info.length > 0 && (
            <div style={calloutStyle('warning')}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Needs your input</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {edited.missing_info.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {/* Project header */}
          <div style={{ ...cardStyle, marginTop: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 260px' }}>
                <label style={labelStyle}>Project name</label>
                <input
                  value={edited.project.name}
                  onChange={(e) => update((s) => ({ ...s, project: { ...s.project, name: e.target.value } }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: '0 1 200px' }}>
                <label style={labelStyle}>Client</label>
                <input
                  value={edited.project.client || ''}
                  onChange={(e) => update((s) => ({ ...s, project: { ...s.project, client: e.target.value || null } }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Hard deadline</label>
                <input
                  type="date"
                  value={edited.project.hard_deadline || ''}
                  onChange={(e) => changeDeadline(e.target.value)}
                  style={selectStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-2)', flexWrap: 'wrap' }}>
              <span>type · {TYPE_LABELS[edited.project.type] || edited.project.type}</span>
              <span>window · {edited.stages[0]?.planned_start || '—'} → {edited.stages[edited.stages.length - 1]?.planned_end || '—'}</span>
              <span>{edited.stages.length} stages</span>
              <span>{Math.round(totalHours)}h estimated</span>
              <button onClick={replanNow} style={linkBtnStyle}>Re-plan dates</button>
            </div>
          </div>

          {/* Stages */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {edited.stages.map((stage, si) => (
              <div key={stage._key} style={stageCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--livv-gold)', minWidth: 22 }}>
                    {String(si + 1).padStart(2, '0')}
                  </span>
                  <input
                    value={stage.name}
                    onChange={(e) => update((s) => setStage(s, stage._key, (st) => ({ ...st, name: e.target.value })))}
                    style={{ ...inputStyle, fontWeight: 500, flex: 1 }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-2)', whiteSpace: 'nowrap' }}>
                    {stage.planned_start || '—'} → {stage.planned_end || '—'}
                  </span>
                  <span style={pillStyle}>{Math.round((stage.effort_weight || 0) * 100)}%</span>
                  <button onClick={() => moveStage(stage._key, -1)} disabled={si === 0} style={iconBtnStyle} title="Move up"><ChevronUp size={15} /></button>
                  <button onClick={() => moveStage(stage._key, 1)} disabled={si === edited.stages.length - 1} style={iconBtnStyle} title="Move down"><ChevronDown size={15} /></button>
                  <button onClick={() => removeStage(stage._key)} style={iconBtnStyle} title="Remove stage"><Trash2 size={15} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 32 }}>
                  {stage.tasks.map((task) => (
                    <div key={task._key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        value={task.title}
                        onChange={(e) => renameTask(stage._key, task._key, e.target.value)}
                        style={{ ...inputStyle, flex: 1, fontSize: 13 }}
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={task.estimate_hours}
                        onChange={(e) => changeEstimate(stage._key, task._key, Number(e.target.value) || 0)}
                        style={{ ...inputStyle, width: 72, textAlign: 'right' }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-3)' }}>h</span>
                      <button onClick={() => removeTask(stage._key, task._key)} style={iconBtnStyle} title="Remove task"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => addTask(stage._key)} style={addRowStyle}><Plus size={13} /> Add task</button>
                </div>
              </div>
            ))}
            <button onClick={addStage} style={{ ...addRowStyle, justifyContent: 'center', padding: '12px' }}>
              <Plus size={14} /> Add stage
            </button>
          </div>

          {/* Approve */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
            <button onClick={reset} style={linkBtnStyle}>Discard</button>
            <ButtonPill onClick={approve} disabled={saving || !canCreate} arrow={false}>
              {saving ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Check size={15} /> Approve and save
                </span>
              )}
            </ButtonPill>
          </div>
          {!canCreate && (
            <p style={{ textAlign: 'right', fontSize: 11, color: 'var(--os-fg-3)', marginTop: 6 }}>
              You can preview but not save. Needs projects create permission.
            </p>
          )}
        </section>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ── inline styles (warm os-* tokens) ────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--os-panel)',
  border: '1px solid var(--os-border)',
  borderRadius: 'var(--radius-lg, 18px)',
  padding: 20,
};
const stageCardStyle: React.CSSProperties = {
  background: 'var(--os-panel)',
  border: '1px solid var(--os-border)',
  borderRadius: 'var(--radius-md, 14px)',
  padding: 14,
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--os-fg-2)',
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--os-surface, #f5f2eb)',
  border: '1px solid var(--os-border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--os-fg-0)',
};
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', lineHeight: 1.5 };
const selectStyle: React.CSSProperties = { ...inputStyle, width: 'auto', minWidth: 180 };
const pillStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-1)',
  background: 'var(--os-surface, #f5f2eb)', border: '1px solid var(--os-border)',
  borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
};
const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 7, border: '1px solid var(--os-border)',
  background: 'transparent', color: 'var(--os-fg-2)', cursor: 'pointer',
};
const addRowStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'transparent', border: '1px dashed var(--os-border-2)', borderRadius: 8,
  padding: '6px 10px', fontSize: 12, color: 'var(--os-fg-2)', cursor: 'pointer',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 0, color: 'var(--livv-gold)',
  fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0,
};
const calloutStyle = (tone: 'error' | 'success' | 'warning'): React.CSSProperties => {
  const map = {
    error: { bg: 'rgba(180,40,40,0.08)', fg: '#9b2c2c', bd: 'rgba(180,40,40,0.25)' },
    success: { bg: 'rgba(118,146,104,0.12)', fg: '#4d6b3f', bd: 'rgba(118,146,104,0.3)' },
    warning: { bg: 'rgba(196,163,90,0.12)', fg: '#8a6d28', bd: 'rgba(196,163,90,0.3)' },
  }[tone];
  return {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    background: map.bg, color: map.fg, border: `1px solid ${map.bd}`,
    borderRadius: 10, padding: '10px 14px', fontSize: 13, marginTop: 14,
  };
};
