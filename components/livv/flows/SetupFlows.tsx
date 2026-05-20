/**
 * SetupFlows — 8 bundle-faithful onboarding wizards beyond the original
 * 5 (ICP/Package/Positioning/Brand/ContentChannels).
 *
 * Source: livv-update bundle / livv-os-onboarding.jsx :: FLOWS registry.
 *
 * Each flow is a CoachFlowDef + a paired data shape + a `save(...)` helper
 * that persists into the right Supabase table. Keep these compact (3–4
 * steps each) — they're secondary onboarding paths reached from empty
 * states in TeamScaling / GrowthDashboard / SalesPipeline / partners,
 * not the primary product setup.
 *
 *   - ROLE_FLOW           → team_role_definitions
 *   - TEAM_MEMBER_FLOW    → team_member_profiles
 *   - AUTOMATION_FLOW     → automations
 *   - PARTNER_FLOW        → partners
 *   - PHASE_FLOW          → growth_phases  (the bundle's "Dashboard" flow)
 *   - PRINCIPLE_FLOW      → strategy_positioning
 *   - CONNECTION_FLOW     → tenant_config.connections (visual setup only)
 *   - SALES_SETUP_FLOW    → tenant_config + first leads kanban
 */
import React from 'react';
import { Icons } from '../../ui/Icons';
import { supabase } from '../../../lib/supabase';
import type { CoachFlowDef } from '../CoachFlow';

// ─────────────────────────────────────────────────────────────
// Shared "preview card" visual — used by the simpler flows. The
// host can override with a custom Visual when it wants a richer
// builder-style preview (ICP/Brand do this with their own panes).
// ─────────────────────────────────────────────────────────────
interface CardVisualProps {
  eyebrow: string;
  title: string;
  color?: string;
  rows?: Array<{ k: string; v: React.ReactNode }>;
  pill?: { label: string; color?: string };
  body?: React.ReactNode;
}
const CardVisual: React.FC<CardVisualProps> = ({ eyebrow, title, color = '#C4A35A', rows = [], pill, body }) => (
  <div style={{ width: '100%', maxWidth: 360 }}>
    <div
      style={{
        position: 'relative',
        padding: 22,
        background: '#ffffff',
        border: '0.5px solid rgba(214,209,199,0.55)',
        borderRadius: 14,
        boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px -12px rgba(44,4,5,0.06)',
      }}
    >
      <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, background: color, opacity: 0.7, borderRadius: '0 9999px 9999px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a' }}>
          {eyebrow}
        </span>
        {pill && (
          <span style={{
            marginLeft: 'auto',
            padding: '1px 6px',
            background: `color-mix(in oklab, ${pill.color || color} 14%, transparent)`,
            color: pill.color || color,
            borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 8.5,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>
            {pill.label}
          </span>
        )}
      </div>
      <h3 style={{ fontSize: 18, margin: '0 0 14px', fontWeight: 300, letterSpacing: '-0.02em', color: '#18181b' }}>
        {title || 'Untitled'}
      </h3>
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: '#a1a1aa', letterSpacing: '0.12em', textTransform: 'uppercase', minWidth: 90 }}>{r.k}</span>
              <span style={{ color: '#3f3f46', flex: 1 }}>{r.v}</span>
            </div>
          ))}
        </div>
      )}
      {body}
    </div>
  </div>
);

// Compact form helpers — match the .coach-* classnames already in LivvBundleDesign.css.
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="coach-field">
    <span className="coach-field-label">{label}</span>
    {children}
    {hint && <span className="coach-field-hint">{hint}</span>}
  </div>
);
const Choice: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button type="button" className={`coach-choice ${active ? 'sel' : ''}`} onClick={onClick}>{children}</button>
);

// ═════════════════════════════════════════════════════════════
// ROLE_FLOW — Define a new role in the hiring plan
// ═════════════════════════════════════════════════════════════
export interface RoleData {
  title?: string;
  department?: string;
  type?: 'contractor' | 'part_time' | 'full_time';
  hire_phase?: string;        // M1..M12
  status?: 'planned' | 'hiring' | 'filled' | 'paused';
  estimated_cost_monthly?: number;
  rationale?: string;
}
const DEPARTMENTS = ['Sales', 'Content', 'Strategy', 'Design', 'Engineering', 'Operations', 'Finance'];
const TYPES: Array<RoleData['type']> = ['contractor', 'part_time', 'full_time'];
const PHASES = ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'];

export const ROLE_FLOW: CoachFlowDef<RoleData> = {
  tag: 'Define role',
  initial: { type: 'contractor', status: 'planned', hire_phase: 'M3' },
  steps: [
    {
      title: <>Name the <span className="accent">role</span> you'll hire.</>,
      desc: 'Pick a clear title + the department it belongs to. Used as the bar label on the 12-month roadmap.',
      why: 'A specific title with a department makes prioritization obvious. "Designer · Content" is hireable; "more help" is not.',
      canNext: (d) => !!(d.title && d.title.length > 1),
      fields: ({ data, set }) => (
        <>
          <Field label="Role title" hint="What goes on the offer letter">
            <input className="coach-input" value={data.title || ''} onChange={e => set('title', e.target.value)} placeholder="Senior Brand Designer" />
          </Field>
          <Field label="Department">
            <div className="coach-choices">
              {DEPARTMENTS.map(d => (
                <Choice key={d} active={data.department === d} onClick={() => set('department', d)}>{d}</Choice>
              ))}
            </div>
          </Field>
        </>
      ),
    },
    {
      title: <>How will they <span className="accent">work</span>?</>,
      desc: 'Engagement type + estimated monthly cost. Both drive the cost-vs-revenue projection.',
      why: 'Contractor at $3K/mo vs full-time at $7K/mo changes when you can hire next.',
      canNext: (d) => !!d.type,
      fields: ({ data, set }) => (
        <>
          <Field label="Engagement type">
            <div className="coach-choices">
              {TYPES.map(t => (
                <Choice key={t} active={data.type === t} onClick={() => set('type', t)}>{t!.replace('_', ' ')}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Estimated cost · monthly" hint="USD — used on the roadmap bar">
            <input
              className="coach-input"
              inputMode="numeric"
              value={data.estimated_cost_monthly ?? ''}
              onChange={e => set('estimated_cost_monthly', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="3500"
            />
          </Field>
        </>
      ),
    },
    {
      title: <>When does this <span className="accent">hire</span> land?</>,
      desc: 'Month bucket on the 12-month roadmap. Status reflects how close you are to making the offer.',
      why: 'The roadmap aligns hires to revenue phases so you never over-extend.',
      canNext: (d) => !!d.hire_phase,
      fields: ({ data, set }) => (
        <>
          <Field label="Hire phase">
            <div className="coach-choices" style={{ flexWrap: 'wrap' }}>
              {PHASES.map(p => (
                <Choice key={p} active={data.hire_phase === p} onClick={() => set('hire_phase', p)}>{p}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Status">
            <div className="coach-choices">
              {(['planned','hiring','filled','paused'] as RoleData['status'][]).map(s => (
                <Choice key={s} active={data.status === s} onClick={() => set('status', s)}>{s}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Rationale" hint="Why this role, why now (helps future you remember)">
            <textarea className="coach-input" rows={2} value={data.rationale || ''} onChange={e => set('rationale', e.target.value)} placeholder="Content output is the bottleneck. A designer unlocks 3 carousels/week." />
          </Field>
        </>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow="Role target"
      title={data.title || 'Your role'}
      color={data.status === 'filled' ? '#769268' : data.status === 'hiring' ? '#C4A35A' : '#a1a1aa'}
      pill={{ label: data.status || 'planned' }}
      rows={[
        { k: 'Dept', v: data.department || '—' },
        { k: 'Type', v: data.type?.replace('_', ' ') || '—' },
        { k: 'Phase', v: data.hire_phase || '—' },
        { k: 'Cost / mo', v: data.estimated_cost_monthly ? `$${data.estimated_cost_monthly.toLocaleString()}` : '—' },
      ]}
    />
  ),
};

export const saveRole = async (tenantId: string, data: RoleData) => {
  return supabase.from('team_role_definitions').insert({
    tenant_id: tenantId,
    title: data.title!,
    department: data.department || null,
    type: data.type || 'contractor',
    hire_phase: data.hire_phase || null,
    status: data.status || 'planned',
    estimated_cost_monthly: data.estimated_cost_monthly ?? null,
    rationale: data.rationale || null,
    tasks: [],
    skills_required: [],
    kpis: [],
  });
};

// ═════════════════════════════════════════════════════════════
// TEAM_MEMBER_FLOW — Add a person to the team
// ═════════════════════════════════════════════════════════════
export interface TeamMemberData {
  name?: string;
  email?: string;
  type?: 'contractor' | 'part_time' | 'full_time';
  rate_monthly?: number;
  rate_type?: 'monthly' | 'hourly' | 'commission' | 'project';
  start_date?: string;
  status?: 'active' | 'trial' | 'offboarded';
}
export const TEAM_MEMBER_FLOW: CoachFlowDef<TeamMemberData> = {
  tag: 'Add person',
  initial: { type: 'contractor', rate_type: 'monthly', status: 'active', start_date: new Date().toISOString().slice(0, 10) },
  steps: [
    {
      title: <>Who's <span className="accent">joining</span> the team?</>,
      desc: 'Name + work email. We use the email to invite them to the workspace later.',
      why: 'Identity first. Everything else (rate, hours, KPIs) hangs off this row.',
      canNext: (d) => !!(d.name && d.name.length > 1),
      fields: ({ data, set }) => (
        <>
          <Field label="Full name">
            <input className="coach-input" value={data.name || ''} onChange={e => set('name', e.target.value)} placeholder="Lucía Pereyra" />
          </Field>
          <Field label="Email" hint="We'll send the workspace invite to this address when ready">
            <input className="coach-input" type="email" value={data.email || ''} onChange={e => set('email', e.target.value)} placeholder="lucia@livv.studio" />
          </Field>
        </>
      ),
    },
    {
      title: <>How will they get <span className="accent">paid</span>?</>,
      desc: 'Engagement type + rate. Used by the Scaling cost tracker to project monthly burn.',
      why: 'Real numbers in here turn "Costs" tab from theory into a live forecast.',
      canNext: (d) => !!d.type,
      fields: ({ data, set }) => (
        <>
          <Field label="Type">
            <div className="coach-choices">
              {TYPES.map(t => (
                <Choice key={t} active={data.type === t} onClick={() => set('type', t)}>{t!.replace('_', ' ')}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Rate model">
            <div className="coach-choices">
              {(['monthly','hourly','commission','project'] as const).map(t => (
                <Choice key={t} active={data.rate_type === t} onClick={() => set('rate_type', t)}>{t}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Rate · monthly equivalent" hint="USD — used by the cost projection">
            <input className="coach-input" inputMode="numeric" value={data.rate_monthly ?? ''} onChange={e => set('rate_monthly', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="2800" />
          </Field>
          <Field label="Start date">
            <input className="coach-input" type="date" value={data.start_date || ''} onChange={e => set('start_date', e.target.value)} />
          </Field>
        </>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow="Team member"
      title={data.name || 'New teammate'}
      color="#6DBEDC"
      pill={{ label: data.status || 'active', color: data.status === 'trial' ? '#C4A35A' : '#769268' }}
      rows={[
        { k: 'Email', v: data.email || '—' },
        { k: 'Type', v: data.type?.replace('_', ' ') || '—' },
        { k: 'Rate', v: data.rate_monthly ? `$${data.rate_monthly.toLocaleString()} / mo` : '—' },
        { k: 'Starts', v: data.start_date || '—' },
      ]}
    />
  ),
};

export const saveTeamMember = async (tenantId: string, data: TeamMemberData) => {
  return supabase.from('team_member_profiles').insert({
    tenant_id: tenantId,
    name: data.name!,
    email: data.email || null,
    type: data.type || 'contractor',
    rate_type: data.rate_type || 'monthly',
    rate_monthly: data.rate_monthly ?? null,
    start_date: data.start_date || null,
    status: data.status || 'active',
  });
};

// ═════════════════════════════════════════════════════════════
// AUTOMATION_FLOW — Custom cross-module rule (trigger → action)
// ═════════════════════════════════════════════════════════════
export interface AutomationData {
  name?: string;
  trigger_module?: string;
  trigger_event?: string;
  action_module?: string;
  action_label?: string;
  status?: 'active' | 'paused';
}
const TRIGGER_MODULES = [
  { v: 'sales',    l: 'Sales · lead changed' },
  { v: 'projects', l: 'Projects · status changed' },
  { v: 'content',  l: 'Content · piece published' },
  { v: 'calendar', l: 'Calendar · task overdue' },
  { v: 'finance',  l: 'Finance · invoice paid' },
];
const ACTION_MODULES = [
  { v: 'projects', l: 'Create a project' },
  { v: 'content',  l: 'Draft a content piece' },
  { v: 'sales',    l: 'Update a lead' },
  { v: 'notify',   l: 'Send a notification' },
  { v: 'agent',    l: 'Run an Agent recipe' },
];
export const AUTOMATION_FLOW: CoachFlowDef<AutomationData> = {
  tag: 'Build automation',
  initial: { status: 'active' },
  steps: [
    {
      title: <>What <span className="accent">trigger</span> kicks this off?</>,
      desc: 'Pick the module + the event that should fire the automation.',
      why: 'Automations work because triggers are specific. "When this exact thing happens, do that exact thing."',
      canNext: (d) => !!d.trigger_module,
      fields: ({ data, set }) => (
        <>
          <Field label="Name your automation">
            <input className="coach-input" value={data.name || ''} onChange={e => set('name', e.target.value)} placeholder="Lead won → spin up project" />
          </Field>
          <Field label="Trigger">
            <div className="coach-choices" style={{ flexWrap: 'wrap' }}>
              {TRIGGER_MODULES.map(t => (
                <Choice key={t.v} active={data.trigger_module === t.v} onClick={() => { set('trigger_module', t.v); set('trigger_event', t.l); }}>
                  {t.l}
                </Choice>
              ))}
            </div>
          </Field>
        </>
      ),
    },
    {
      title: <>Then <span className="accent">do</span> what?</>,
      desc: 'Module + action that runs when the trigger fires. Agent recipes available too.',
      why: 'Each automation closes a manual loop. Less switching = more compounding.',
      canNext: (d) => !!d.action_module,
      fields: ({ data, set }) => (
        <Field label="Action">
          <div className="coach-choices" style={{ flexWrap: 'wrap' }}>
            {ACTION_MODULES.map(a => (
              <Choice key={a.v} active={data.action_module === a.v} onClick={() => { set('action_module', a.v); set('action_label', a.l); }}>
                {a.l}
              </Choice>
            ))}
          </div>
        </Field>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow="Automation"
      title={data.name || 'New rule'}
      color="#A855F7"
      pill={{ label: data.status || 'active' }}
      rows={[
        { k: 'Trigger', v: data.trigger_event || '—' },
        { k: 'Action', v: data.action_label || '—' },
      ]}
    />
  ),
};

export const saveAutomation = async (tenantId: string, data: AutomationData) => {
  return supabase.from('automations').insert({
    tenant_id: tenantId,
    name: data.name || 'Untitled automation',
    description: `${data.trigger_event || ''} → ${data.action_label || ''}`,
    status: data.status || 'active',
    trigger_type: data.trigger_module || null,
    actions: [{ module: data.action_module, label: data.action_label }],
  });
};

// ═════════════════════════════════════════════════════════════
// PARTNER_FLOW — Add a referral / affiliate / agency partner
// ═════════════════════════════════════════════════════════════
export interface PartnerData {
  name?: string;
  company?: string;
  email?: string;
  type?: 'referrer' | 'affiliate' | 'agency' | 'reseller' | 'creator';
  commission_kind?: 'flat' | 'percent';
  commission_amount?: number;
  referral_code?: string;
}
const PARTNER_TYPES: Array<PartnerData['type']> = ['referrer', 'affiliate', 'agency', 'reseller', 'creator'];
const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};
export const PARTNER_FLOW: CoachFlowDef<PartnerData> = {
  tag: 'Invite partner',
  initial: { type: 'referrer', commission_kind: 'flat', commission_amount: 200, referral_code: genCode() },
  steps: [
    {
      title: <>Who are we <span className="accent">partnering</span> with?</>,
      desc: 'Name + email + the kind of partner relationship. Each type unlocks different payout rules.',
      why: 'Naming the partnership type up front makes commission, attribution and onboarding consistent.',
      canNext: (d) => !!d.name,
      fields: ({ data, set }) => (
        <>
          <Field label="Contact name">
            <input className="coach-input" value={data.name || ''} onChange={e => set('name', e.target.value)} placeholder="Iris Wallace" />
          </Field>
          <Field label="Company (optional)">
            <input className="coach-input" value={data.company || ''} onChange={e => set('company', e.target.value)} placeholder="Sable Loft" />
          </Field>
          <Field label="Email">
            <input className="coach-input" type="email" value={data.email || ''} onChange={e => set('email', e.target.value)} placeholder="iris@sableloft.com" />
          </Field>
          <Field label="Type">
            <div className="coach-choices">
              {PARTNER_TYPES.map(t => (
                <Choice key={t} active={data.type === t} onClick={() => set('type', t)}>{t}</Choice>
              ))}
            </div>
          </Field>
        </>
      ),
    },
    {
      title: <>How are they <span className="accent">paid</span>?</>,
      desc: 'Flat fee or percentage of first deal value. Auto-generated referral code stays editable.',
      why: 'Clear payout terms = partners who actually refer. We surface this on their portal page.',
      canNext: (d) => !!d.commission_kind && !!d.commission_amount,
      fields: ({ data, set }) => (
        <>
          <Field label="Commission model">
            <div className="coach-choices">
              <Choice active={data.commission_kind === 'flat'} onClick={() => set('commission_kind', 'flat')}>Flat fee</Choice>
              <Choice active={data.commission_kind === 'percent'} onClick={() => set('commission_kind', 'percent')}>Percentage</Choice>
            </div>
          </Field>
          <Field label={data.commission_kind === 'percent' ? 'Percent (1–50)' : 'Amount · USD'}>
            <input
              className="coach-input"
              inputMode="numeric"
              value={data.commission_amount ?? ''}
              onChange={e => set('commission_amount', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder={data.commission_kind === 'percent' ? '15' : '200'}
            />
          </Field>
          <Field label="Referral code" hint="Public — used in livvvv.com/portal/{CODE}">
            <input
              className="coach-input"
              style={{ fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              value={data.referral_code || ''}
              onChange={e => set('referral_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </Field>
        </>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow="Partner"
      title={data.name || 'New partner'}
      color="#C4A35A"
      pill={{ label: data.type || 'referrer' }}
      rows={[
        { k: 'Company', v: data.company || '—' },
        { k: 'Type', v: data.type || '—' },
        { k: 'Commission', v: data.commission_amount ? (data.commission_kind === 'percent' ? `${data.commission_amount}% of first deal` : `$${data.commission_amount} flat`) : '—' },
        { k: 'Code', v: <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>{data.referral_code || '—'}</code> },
      ]}
    />
  ),
};

export const savePartner = async (tenantId: string, data: PartnerData) => {
  return supabase.from('partners').insert({
    tenant_id: tenantId,
    name: data.name!,
    company: data.company || null,
    email: data.email || null,
    type: data.type || 'referrer',
    referral_code: data.referral_code || genCode(),
    commission_model: {
      kind: data.commission_kind || 'flat',
      amount: data.commission_amount || 0,
      currency: 'USD',
      applies_to: 'first_payment',
    },
    attribution_days: 30,
    min_payout: 100,
    portal_access: true,
    status: 'invited',
  });
};

// ═════════════════════════════════════════════════════════════
// PHASE_FLOW — Define a growth phase on the dashboard
// ═════════════════════════════════════════════════════════════
export interface PhaseData {
  phase_number?: number;
  title?: string;
  timeline?: string;
  status?: 'active' | 'completed' | 'upcoming';
  milestones?: string[];
}
export const PHASE_FLOW: CoachFlowDef<PhaseData> = {
  tag: 'Growth phase',
  initial: { phase_number: 1, status: 'upcoming', milestones: ['', '', ''] },
  steps: [
    {
      title: <>Name this <span className="accent">phase</span>.</>,
      desc: 'A short title + a rough timeline. Shows up as the divider on the Growth dashboard.',
      why: 'Phases anchor the strategy. "Q3 — Tighten ICP" is more actionable than "next quarter".',
      canNext: (d) => !!d.title && !!d.timeline,
      fields: ({ data, set }) => (
        <>
          <Field label="Phase title">
            <input className="coach-input" value={data.title || ''} onChange={e => set('title', e.target.value)} placeholder="Foundation — find the bottleneck" />
          </Field>
          <Field label="Timeline" hint="Free-text — Q3 / Apr-Jun / Weeks 1-6 — your call">
            <input className="coach-input" value={data.timeline || ''} onChange={e => set('timeline', e.target.value)} placeholder="Q3 2026 · 12 weeks" />
          </Field>
          <Field label="Status">
            <div className="coach-choices">
              {(['upcoming','active','completed'] as PhaseData['status'][]).map(s => (
                <Choice key={s} active={data.status === s} onClick={() => set('status', s)}>{s}</Choice>
              ))}
            </div>
          </Field>
        </>
      ),
    },
    {
      title: <>What are the <span className="accent">milestones</span>?</>,
      desc: '3-5 checkpoints that mark progress through the phase. Saved as a checklist.',
      why: 'You\'ll check these off live on the dashboard — turning the plan into momentum signals.',
      canNext: (d) => (d.milestones || []).filter(Boolean).length >= 2,
      fields: ({ data, set }) => (
        <>
          {[0, 1, 2, 3, 4].map(i => (
            <Field key={i} label={`Milestone ${i + 1}`}>
              <input
                className="coach-input"
                value={(data.milestones || [])[i] || ''}
                onChange={e => {
                  const ms = [...(data.milestones || ['', '', '', '', ''])];
                  ms[i] = e.target.value;
                  set('milestones', ms);
                }}
                placeholder={['ICP defined', 'First 5 leads from new channel', 'Cycle time < 21 days', '', ''][i]}
              />
            </Field>
          ))}
        </>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow={`Phase · ${data.phase_number || 1}`}
      title={data.title || 'Untitled phase'}
      color={data.status === 'active' ? '#C4A35A' : data.status === 'completed' ? '#769268' : '#a1a1aa'}
      pill={{ label: data.status || 'upcoming' }}
      rows={[
        { k: 'Timeline', v: data.timeline || '—' },
        { k: 'Milestones', v: `${(data.milestones || []).filter(Boolean).length} defined` },
      ]}
      body={
        (data.milestones || []).filter(Boolean).length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(214,209,199,0.7)' }}>
            {(data.milestones || []).filter(Boolean).map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#52525b' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid #d4d4d8', display: 'inline-block' }} />
                {m}
              </div>
            ))}
          </div>
        )
      }
    />
  ),
};

export const savePhase = async (tenantId: string, data: PhaseData) => {
  return supabase.from('growth_phases').insert({
    tenant_id: tenantId,
    phase_number: data.phase_number || 1,
    title: data.title!,
    timeline: data.timeline || null,
    status: data.status || 'upcoming',
    milestones: (data.milestones || []).filter(Boolean).map(title => ({ title, completed: false, target_date: null })),
  });
};

// ═════════════════════════════════════════════════════════════
// PRINCIPLE_FLOW — Create a positioning principle
// ═════════════════════════════════════════════════════════════
export interface PrincipleData {
  title?: string;
  tagline?: string;
  evidence?: string;
}
export const PRINCIPLE_FLOW: CoachFlowDef<PrincipleData> = {
  tag: 'Positioning principle',
  steps: [
    {
      title: <>State the <span className="accent">principle</span>.</>,
      desc: 'A short rule that guides every decision. Show, don\'t tell.',
      why: 'Principles compound. Every brand decision tests against them; consistency emerges.',
      canNext: (d) => !!d.title && !!d.tagline,
      fields: ({ data, set }) => (
        <>
          <Field label="Title">
            <input className="coach-input" value={data.title || ''} onChange={e => set('title', e.target.value)} placeholder="Show the kitchen" />
          </Field>
          <Field label="Tagline (one sentence)">
            <textarea className="coach-input" rows={2} value={data.tagline || ''} onChange={e => set('tagline', e.target.value)} placeholder="We share the boring parts — the templates, the cadence, the spreadsheets. Founders trust what they can see being built." />
          </Field>
          <Field label="Evidence (why this is true for us)">
            <textarea className="coach-input" rows={3} value={data.evidence || ''} onChange={e => set('evidence', e.target.value)} placeholder="Every case study leads with the system, not the campaign. Reduces objections by 40%." />
          </Field>
        </>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow="Principle"
      title={data.title || 'Your principle'}
      color="#5C1D18"
      body={
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(214,209,199,0.7)' }}>
          <p style={{ fontSize: 13, color: '#3f3f46', lineHeight: 1.55, fontStyle: 'italic', margin: 0 }}>
            "{data.tagline || 'Your tagline will appear here.'}"
          </p>
          {data.evidence && (
            <p style={{ fontSize: 11.5, color: '#71717a', lineHeight: 1.55, marginTop: 10 }}>
              {data.evidence}
            </p>
          )}
        </div>
      }
    />
  ),
};

export const savePrinciple = async (tenantId: string, data: PrincipleData) => {
  return supabase.from('strategy_positioning').insert({
    tenant_id: tenantId,
    title: data.title!,
    tagline: data.tagline || null,
    evidence: data.evidence || null,
  });
};

// ═════════════════════════════════════════════════════════════
// CONNECTION_FLOW — Connect an external service
// ═════════════════════════════════════════════════════════════
export interface ConnectionData {
  service?: string;
  account?: string;
  permissions?: string[];
}
const SERVICES = [
  { v: 'linkedin', l: 'LinkedIn',  perms: ['Read posts', 'Publish', 'Analytics'] },
  { v: 'slack',    l: 'Slack',     perms: ['Read channels', 'Post messages'] },
  { v: 'gmail',    l: 'Gmail',     perms: ['Read inbox', 'Send', 'Drafts'] },
  { v: 'notion',   l: 'Notion',    perms: ['Read pages', 'Create pages'] },
  { v: 'figma',    l: 'Figma',     perms: ['Read frames', 'Import tokens'] },
  { v: 'stripe',   l: 'Stripe',    perms: ['Read transactions', 'Create checkout'] },
];
export const CONNECTION_FLOW: CoachFlowDef<ConnectionData> = {
  tag: 'Connect service',
  initial: { permissions: [] },
  steps: [
    {
      title: <>Pick the <span className="accent">service</span>.</>,
      desc: 'External app you want LIVV to talk to. We\'ll guide you through OAuth on the next step.',
      why: 'Every connection unlocks an automation pattern — content auto-publishes, leads auto-create, etc.',
      canNext: (d) => !!d.service,
      fields: ({ data, set }) => (
        <Field label="Service">
          <div className="coach-choices" style={{ flexWrap: 'wrap' }}>
            {SERVICES.map(s => (
              <Choice key={s.v} active={data.service === s.v} onClick={() => { set('service', s.v); set('permissions', s.perms); }}>
                {s.l}
              </Choice>
            ))}
          </div>
        </Field>
      ),
    },
    {
      title: <>Confirm the <span className="accent">permissions</span>.</>,
      desc: 'These scopes are required for the integrations LIVV runs. Clicking finish opens the OAuth window.',
      why: 'We minimize scopes — only what\'s needed for the workflows you\'ve enabled.',
      canNext: (d) => !!d.service,
      fields: ({ data, set }) => (
        <>
          <Field label="Account label (optional)" hint="How you'll recognize this connection in the integrations list">
            <input className="coach-input" value={data.account || ''} onChange={e => set('account', e.target.value)} placeholder="@eneas" />
          </Field>
          <Field label="Scopes requested">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data.permissions || []).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3f3f46' }}>
                  <Icons.Check size={11} style={{ color: '#769268' }} />
                  {p}
                </div>
              ))}
            </div>
          </Field>
        </>
      ),
    },
  ],
  visual: ({ data }) => {
    const svc = SERVICES.find(s => s.v === data.service);
    return (
      <CardVisual
        eyebrow="Connection"
        title={svc?.l || 'Pick a service'}
        color="#6DBEDC"
        pill={{ label: data.account ? 'ready' : 'pending', color: data.account ? '#769268' : '#a1a1aa' }}
        rows={[
          { k: 'Service', v: svc?.l || '—' },
          { k: 'Account', v: data.account || '—' },
          { k: 'Scopes', v: `${(data.permissions || []).length} granted` },
        ]}
      />
    );
  },
};

export const saveConnection = async (tenantId: string, data: ConnectionData) => {
  // Connections live inside tenant_config.connections jsonb until a dedicated
  // table lands. Read-modify-write — best-effort, fails open if config row
  // doesn't yet exist (host should create it on first save).
  const { data: row } = await supabase.from('tenant_config').select('connections').eq('tenant_id', tenantId).maybeSingle();
  const existing = (row?.connections || []) as any[];
  const merged = [...existing, {
    service: data.service,
    account: data.account || null,
    permissions: data.permissions || [],
    status: 'connected',
    connected_at: new Date().toISOString(),
  }];
  return supabase.from('tenant_config').update({ connections: merged }).eq('tenant_id', tenantId);
};

// ═════════════════════════════════════════════════════════════
// SALES_SETUP_FLOW — First-time sales pipeline setup
// ═════════════════════════════════════════════════════════════
export interface SalesSetupData {
  pipeline_focus?: 'inbound' | 'outbound' | 'both';
  primary_channel?: string;
  target_per_month?: number;
}
const SALES_CHANNELS = ['LinkedIn', 'Cold email', 'Referrals', 'Inbound site', 'Events'];
export const SALES_SETUP_FLOW: CoachFlowDef<SalesSetupData> = {
  tag: 'Sales setup',
  initial: { pipeline_focus: 'both' },
  steps: [
    {
      title: <>What <span className="accent">drives</span> your pipeline?</>,
      desc: 'Inbound (people find you) vs Outbound (you go find them) vs Both. Sets default pipeline stages.',
      why: 'Different motions, different stages. Inbound = MQL/SQL/Demo; outbound = Reached/Replied/Call.',
      canNext: (d) => !!d.pipeline_focus,
      fields: ({ data, set }) => (
        <Field label="Pipeline focus">
          <div className="coach-choices">
            {(['inbound','outbound','both'] as SalesSetupData['pipeline_focus'][]).map(f => (
              <Choice key={f} active={data.pipeline_focus === f} onClick={() => set('pipeline_focus', f)}>{f}</Choice>
            ))}
          </div>
        </Field>
      ),
    },
    {
      title: <>Where will most <span className="accent">leads</span> come from?</>,
      desc: 'Primary channel + monthly target. We pre-fill the Sales Overview KPI strip with these numbers.',
      why: 'Targets create accountability. Even a directional number turns the dashboard from passive to active.',
      canNext: (d) => !!d.primary_channel && !!d.target_per_month,
      fields: ({ data, set }) => (
        <>
          <Field label="Primary channel">
            <div className="coach-choices">
              {SALES_CHANNELS.map(c => (
                <Choice key={c} active={data.primary_channel === c} onClick={() => set('primary_channel', c)}>{c}</Choice>
              ))}
            </div>
          </Field>
          <Field label="Target · leads per month" hint="Directional — used as the goal-line on Sales analytics">
            <input
              className="coach-input"
              inputMode="numeric"
              value={data.target_per_month ?? ''}
              onChange={e => set('target_per_month', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="12"
            />
          </Field>
        </>
      ),
    },
  ],
  visual: ({ data }) => (
    <CardVisual
      eyebrow="Sales setup"
      title={`${data.pipeline_focus || 'both'} pipeline`}
      color="#C4A35A"
      pill={{ label: 'ready' }}
      rows={[
        { k: 'Focus', v: data.pipeline_focus || '—' },
        { k: 'Primary channel', v: data.primary_channel || '—' },
        { k: 'Target / mo', v: data.target_per_month ? `${data.target_per_month} leads` : '—' },
      ]}
    />
  ),
};

export const saveSalesSetup = async (tenantId: string, data: SalesSetupData) => {
  // Sales setup just persists into tenant_config.sales — no leads created yet.
  const { data: row } = await supabase.from('tenant_config').select('sales').eq('tenant_id', tenantId).maybeSingle();
  const merged = {
    ...(row?.sales || {}),
    pipeline_focus: data.pipeline_focus,
    primary_channel: data.primary_channel,
    target_per_month: data.target_per_month,
    configured_at: new Date().toISOString(),
  };
  return supabase.from('tenant_config').update({ sales: merged }).eq('tenant_id', tenantId);
};
