/**
 * Strategy-as-a-Service Toolkit — the agency's internal frameworks
 * turned into productized client deliverables.
 *
 * Two tabs:
 *   1. Framework library — reusable templates with pricing + hours
 *   2. Client projects — instances delivered for clients, capturing
 *      their ICPs, channel recommendations, content plan as JSONB
 *
 * Pitch (from the spec): "We don't just build your system. We define
 * WHO you're selling to, WHERE you should be talking to them, WHAT
 * you should be saying, and HOW to measure if it's working. Then we
 * build the system that executes all of that automatically."
 *
 * Not done yet (deferred):
 *   • PDF / presentation export of strategy deliverables
 *   • AI: auto-draft ICP analysis + channel recs from a client's website
 *   • Direct link into client portal (would need its own access flow)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import '../components/livv/bundle-strategy.css';

interface Framework {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
  description: string | null;
  template: Record<string, any>;
  deliverable_type: string | null;
  estimated_hours: number | null;
  price: number | null;
  status: 'active' | 'draft' | 'archived';
  created_at: string;
}

interface ClientProject {
  id: string;
  tenant_id: string;
  client_project_id: string | null;
  client_name: string;
  framework_id: string | null;
  icps_defined: any[];
  channels_recommended: any[];
  content_plan: any[];
  notes: string | null;
  status: 'in_progress' | 'delivered' | 'archived';
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

type Tab = 'library' | 'clients';

const STATUS_TONE: Record<string, string> = {
  active:       'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
  draft:        'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-500/30',
  archived:     'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  in_progress:  'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-500/30',
  delivered:    'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
};

const fmtMoney = (n: number | null | undefined): string => n == null ? '—' : `$${Number(n).toLocaleString('en-US')}`;

const EMPTY_FRAMEWORK: Omit<Framework, 'id' | 'tenant_id' | 'created_at'> = {
  name: '', category: null, description: null, template: {}, deliverable_type: null,
  estimated_hours: null, price: null, status: 'active',
};
const EMPTY_CLIENT_PROJECT: Omit<ClientProject, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  client_project_id: null, client_name: '', framework_id: null,
  icps_defined: [], channels_recommended: [], content_plan: [],
  notes: null, status: 'in_progress', delivered_at: null,
};

export const StrategyToolkit: React.FC = () => {
  const { currentTenant } = useTenant();
  const [tab, setTab] = useState<Tab>('library');
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFw, setEditingFw] = useState<Framework | 'new' | null>(null);
  const [editingCp, setEditingCp] = useState<ClientProject | 'new' | null>(null);

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const [fRes, cRes] = await Promise.all([
        supabase.from('strategy_frameworks').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
        supabase.from('client_strategy_projects').select('*').eq('tenant_id', currentTenant.id).order('updated_at', { ascending: false }),
      ]);
      setFrameworks((fRes.data || []) as Framework[]);
      setProjects((cRes.data || []) as ClientProject[]);
    } catch (e) {
      errorLogger.warn('strategy toolkit load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  const totals = useMemo(() => {
    const activeFwks = frameworks.filter(f => f.status === 'active').length;
    const inProgress = projects.filter(p => p.status === 'in_progress').length;
    const delivered  = projects.filter(p => p.status === 'delivered').length;
    const revenue    = projects.reduce((s, p) => {
      const fw = frameworks.find(f => f.id === p.framework_id);
      return s + (fw?.price || 0);
    }, 0);
    return { activeFwks, inProgress, delivered, revenue };
  }, [frameworks, projects]);

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-6">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="bdl-page-title">Toolkit</h1>
          <p className="bdl-page-sub">
            Framework library · Client projects
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <Stat label="Active frameworks" value={totals.activeFwks} tone="zinc" />
        <Stat label="In progress" value={totals.inProgress} tone="amber" />
        <Stat label="Delivered" value={totals.delivered} tone="emerald" />
        <Stat label="Booked revenue" value={fmtMoney(totals.revenue)} tone="violet" hint="sum across all client projects" />
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="bdl-tabs">
          {([
            { id: 'library' as const, label: 'Framework library', icon: 'Briefcase' },
            { id: 'clients' as const, label: 'Client projects',   icon: 'Users' },
          ]).map(t => {
            const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`bdl-tab ${active ? 'active' : ''}`}
              >
                <IconCmp size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => tab === 'library' ? setEditingFw('new') : setEditingCp('new')}
          className="bdl-action primary ml-auto"
        >
          <Icons.Plus size={12} />
          New {tab === 'library' ? 'framework' : 'client project'}
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Icons.Loader className="animate-spin text-zinc-400" size={20} /></div>}

      {!loading && tab === 'library' && (
        <FrameworkGrid frameworks={frameworks} onEdit={f => setEditingFw(f)} onNew={() => setEditingFw('new')} />
      )}

      {!loading && tab === 'clients' && (
        <ClientProjectList projects={projects} frameworks={frameworks} onEdit={p => setEditingCp(p)} onNew={() => setEditingCp('new')} />
      )}

      <AnimatePresence>
        {editingFw && (
          <FrameworkModal value={editingFw === 'new' ? null : editingFw} onClose={() => setEditingFw(null)} onSaved={() => { setEditingFw(null); refetch(); }} />
        )}
        {editingCp && (
          <ClientProjectModal value={editingCp === 'new' ? null : editingCp} frameworks={frameworks} onClose={() => setEditingCp(null)} onSaved={() => { setEditingCp(null); refetch(); }} />
        )}
      </AnimatePresence>
    </div>
  );
};

const TONE_NUM: Record<string, string> = {
  zinc:    'text-zinc-800 dark:text-zinc-200',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  amber:   'text-amber-700 dark:text-amber-400',
  violet:  'text-violet-700 dark:text-violet-400',
};

const Stat: React.FC<{ label: string; value: string | number; hint?: string; tone: keyof typeof TONE_NUM }> = ({ label, value, hint, tone }) => (
  <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING_ENTER}
    className="px-3 py-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className={`text-[17px] leading-none font-semibold tabular-nums mt-1 ${TONE_NUM[tone]}`}>{value}</div>
    {hint && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{hint}</div>}
  </motion.div>
);

// ── Framework grid ────────────────────────────────────────────────
const FrameworkGrid: React.FC<{ frameworks: Framework[]; onEdit: (f: Framework) => void; onNew: () => void }> = ({ frameworks, onEdit, onNew }) => {
  if (frameworks.length === 0) {
    return <Empty icon="Briefcase" title="No frameworks yet" body="Bundle your strategy work into reusable engagements: ICP Definition Workshop, Channel Strategy Audit, Content Plan Sprint, etc. Each gets a price + hours + a description of the deliverable." cta="Create first framework" onClick={onNew} />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {frameworks.map((f, idx) => (
        <motion.button key={f.id} onClick={() => onEdit(f)}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
          whileTap={{ scale: 0.98, transition: SPRING_TAP }} whileHover={{ y: -2, transition: SPRING_TAP }}
          className="text-left p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{f.name}</h3>
              {f.category && <div className="text-[10.5px] text-zinc-400 mt-0.5 uppercase font-mono">{f.category}</div>}
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[f.status]}`}>{f.status}</span>
          </div>
          {f.description && <p className="text-[11.5px] text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3">{f.description}</p>}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Price</div>
              <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(f.price)}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Hours</div>
              <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{f.estimated_hours ?? '—'}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Deliverable</div>
              <div className="text-zinc-800 dark:text-zinc-200 mt-0.5 truncate text-[11px]">{f.deliverable_type || '—'}</div>
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  );
};

// ── Client projects list ──────────────────────────────────────────
const ClientProjectList: React.FC<{ projects: ClientProject[]; frameworks: Framework[]; onEdit: (p: ClientProject) => void; onNew: () => void }> = ({ projects, frameworks, onEdit, onNew }) => {
  if (projects.length === 0) {
    return <Empty icon="Users" title="No client strategy projects yet" body="When a client books a strategy engagement, create a project here. You'll capture their ICPs, channel recommendations, and content plan as you go — same tools you use internally." cta="Add first project" onClick={onNew} />;
  }
  const fwMap = useMemo(() => new Map(frameworks.map(f => [f.id, f])), [frameworks]);
  return (
    <div className="space-y-2">
      {projects.map((p, idx) => {
        const fw = p.framework_id ? fwMap.get(p.framework_id) : null;
        const icpCount = p.icps_defined?.length || 0;
        const channelCount = p.channels_recommended?.length || 0;
        const planItems = p.content_plan?.length || 0;
        return (
          <motion.button key={p.id} onClick={() => onEdit(p)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            whileTap={{ scale: 0.995, transition: SPRING_TAP }} whileHover={{ y: -1, transition: SPRING_TAP }}
            className="w-full text-left p-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <h3 className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{p.client_name}</h3>
                {fw && <div className="text-[10.5px] text-zinc-400 mt-0.5">{fw.name}{fw.price ? ` · ${fmtMoney(fw.price)}` : ''}</div>}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[p.status]}`}>{p.status.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10.5px] text-zinc-500 dark:text-zinc-400">
              <span><span className="font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{icpCount}</span> ICPs</span>
              <span><span className="font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{channelCount}</span> channels</span>
              <span><span className="font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{planItems}</span> content items</span>
              {p.delivered_at && <span className="ml-auto font-mono tabular-nums">delivered {p.delivered_at}</span>}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

const Empty: React.FC<{ icon: string; title: string; body: string; cta: string; onClick: () => void }> = ({ icon, title, body, cta, onClick }) => {
  const IconCmp = (Icons as any)[icon] || Icons.Sparkles;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_ENTER}
      className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center max-w-xl mx-auto">
      <IconCmp size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">{body}</p>
      <motion.button onClick={onClick} whileTap={{ scale: 0.97, transition: SPRING_TAP }} whileHover={{ y: -1, transition: SPRING_TAP }}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold">
        <Icons.Plus size={12} /> {cta}
      </motion.button>
    </motion.div>
  );
};

const inputClass = 'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="flex items-baseline gap-2 mb-1.5"><span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>{hint && <span className="text-[10px] text-zinc-400">{hint}</span>}</div>
    {children}
  </label>
);

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose}
    className="fixed inset-0 z-[70] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <motion.div onClick={e => e.stopPropagation()}
      initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }} transition={SPRING_ENTER}
      className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><Icons.X size={14} /></button>
      </div>
      <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">{children}</div>
      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">{footer}</div>
    </motion.div>
  </motion.div>
);

// ── Framework modal ──────────────────────────────────────────────
const FrameworkModal: React.FC<{ value: Framework | null; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_FRAMEWORK>({ ...EMPTY_FRAMEWORK, ...(value ? {
    name: value.name, category: value.category, description: value.description, template: value.template,
    deliverable_type: value.deliverable_type, estimated_hours: value.estimated_hours, price: value.price, status: value.status,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleSave = async () => {
    if (!currentTenant?.id || !form.name.trim()) return;
    setSaving(true);
    try {
      if (value) await supabase.from('strategy_frameworks').update(form).eq('id', value.id);
      else await supabase.from('strategy_frameworks').insert({ ...form, tenant_id: currentTenant.id });
      onSaved();
    } finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm(`Delete framework "${value.name}"?`)) return;
    setDeleting(true);
    try { await supabase.from('strategy_frameworks').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };
  return (
    <ModalShell title={value ? `Edit framework — ${value.name}` : 'New framework'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      <Field label="Name"><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ICP Definition Workshop" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><input className={inputClass} value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value || null }))} placeholder="positioning, channels, content, growth" /></Field>
        <Field label="Deliverable type"><input className={inputClass} value={form.deliverable_type || ''} onChange={e => setForm(f => ({ ...f, deliverable_type: e.target.value || null }))} placeholder="report, presentation, dashboard, playbook" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Price"><input type="number" className={inputClass} value={form.price ?? ''} onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
        <Field label="Hours"><input type="number" className={inputClass} value={form.estimated_hours ?? ''} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
        <Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Framework['status'] }))}><option value="active">active</option><option value="draft">draft</option><option value="archived">archived</option></select></Field>
      </div>
      <Field label="Description"><textarea rows={3} className={inputClass} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} placeholder="2-week sprint to define the client's ICPs + buyer personas + outreach playbook." /></Field>
    </ModalShell>
  );
};

// ── Client project modal ─────────────────────────────────────────
const ClientProjectModal: React.FC<{ value: ClientProject | null; frameworks: Framework[]; onClose: () => void; onSaved: () => void }> = ({ value, frameworks, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_CLIENT_PROJECT>({ ...EMPTY_CLIENT_PROJECT, ...(value ? {
    client_project_id: value.client_project_id, client_name: value.client_name, framework_id: value.framework_id,
    icps_defined: value.icps_defined, channels_recommended: value.channels_recommended, content_plan: value.content_plan,
    notes: value.notes, status: value.status, delivered_at: value.delivered_at,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // For the captured outputs we offer a simple textarea per category;
  // each non-empty line becomes one item in the JSONB array. Keeps
  // the form usable without a complex JSON editor.
  const [icpText, setIcpText] = useState((form.icps_defined as any[]).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n'));
  const [channelText, setChannelText] = useState((form.channels_recommended as any[]).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n'));
  const [planText, setPlanText] = useState((form.content_plan as any[]).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n'));

  const linesToArr = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!currentTenant?.id || !form.client_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        icps_defined: linesToArr(icpText),
        channels_recommended: linesToArr(channelText),
        content_plan: linesToArr(planText),
      };
      if (value) await supabase.from('client_strategy_projects').update(payload).eq('id', value.id);
      else await supabase.from('client_strategy_projects').insert({ ...payload, tenant_id: currentTenant.id });
      onSaved();
    } finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm(`Delete client project "${value.client_name}"?`)) return;
    setDeleting(true);
    try { await supabase.from('client_strategy_projects').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };

  return (
    <ModalShell title={value ? `Edit — ${value.client_name}` : 'New client strategy project'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client name"><input className={inputClass} value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Sunnyside Restaurants" /></Field>
        <Field label="Framework"><select className={inputClass} value={form.framework_id || ''} onChange={e => setForm(f => ({ ...f, framework_id: e.target.value || null }))}><option value="">— None —</option>{frameworks.map(fw => <option key={fw.id} value={fw.id}>{fw.name}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ClientProject['status'] }))}><option value="in_progress">in_progress</option><option value="delivered">delivered</option><option value="archived">archived</option></select></Field>
        <Field label="Delivered at"><input type="date" className={inputClass} value={form.delivered_at || ''} onChange={e => setForm(f => ({ ...f, delivered_at: e.target.value || null }))} /></Field>
      </div>
      <Field label="ICPs defined" hint="One per line — the audiences identified for this client"><textarea rows={3} className={inputClass} value={icpText} onChange={e => setIcpText(e.target.value)} placeholder="Boutique restaurants in BA&#10;Nightlife venues with weekly events&#10;Catering services" /></Field>
      <Field label="Channels recommended" hint="One per line"><textarea rows={3} className={inputClass} value={channelText} onChange={e => setChannelText(e.target.value)} placeholder="Instagram (principal)&#10;LinkedIn (secondary for B2B)&#10;Email newsletter monthly" /></Field>
      <Field label="Content plan" hint="One per line — the actual deliverable items"><textarea rows={4} className={inputClass} value={planText} onChange={e => setPlanText(e.target.value)} placeholder="4 posts/week on IG&#10;1 LinkedIn carousel/week&#10;Monthly recap email&#10;Quarterly press release" /></Field>
      <Field label="Notes"><textarea rows={2} className={inputClass} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} /></Field>
    </ModalShell>
  );
};
