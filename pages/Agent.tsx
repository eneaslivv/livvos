/**
 * Agent — AI workspace from the LIVV bundle.
 * Source: livv-update / livv-os-agent.jsx
 *
 * Three tabs:
 *   1. Ask — chat with the agent (uses existing AI advisor backend)
 *   2. Workflows — automation library (on/off toggles, runs counter)
 *   3. Reports — saved report gallery
 *
 * This is a NEW page added to the OS sidebar. It wraps the existing
 * AI chat backend with the bundle's editorial design (conic-halo
 * avatar, source chips, findings list, action buttons).
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import { useAutomations } from '../hooks/useAutomations';
import '../components/livv/bundle-strategy.css';
import '../components/livv/bundle-agent.css';

type Tab = 'ask' | 'workflows' | 'reports';

interface ChatMsg {
  role: 'user' | 'agent';
  text: string;
  when?: string;
  sources?: string[];
  findings?: Array<{ tone: 'red' | 'amber' | 'green'; label: string; action?: string }>;
  actions?: Array<{ id: string; label: string; primary?: boolean; icon?: string }>;
}

const AGENT_RECIPES = [
  { id: 'weekly',   cat: 'Reports', icon: 'Sparkles', title: 'Weekly executive summary', desc: 'KPIs + wins + blockers from this week, formatted for Monday inbox.', tags: ['Growth', 'Sales'] },
  { id: 'pipeline', cat: 'Reports', icon: 'Activity', title: 'Pipeline health audit',     desc: 'Flag stuck deals, drop-off stages, and which leads need follow-up today.', tags: ['Sales'] },
  { id: 'cohort',   cat: 'Reports', icon: 'Chart',    title: 'ICP cohort analysis',       desc: 'Which ICP closes fastest? Which gives biggest deals? Last 90 days.', tags: ['Strategy', 'Sales'] },
  { id: 'content',  cat: 'Reports', icon: 'Edit',     title: 'Content performance',       desc: 'Top posts × engagement × repurpose suggestions for next week.', tags: ['Content'] },
  { id: 'team',     cat: 'Reports', icon: 'Users',    title: 'Team capacity report',      desc: 'Who is over capacity? Where are bottlenecks? Hire signals.', tags: ['Scaling'] },

  { id: 'follow',     cat: 'Actions', icon: 'Mail',     title: 'Draft 3 follow-ups',  desc: "Personalize follow-up emails for stale leads using their ICP + last interaction.", tags: ['Sales'] },
  { id: 'casestudy',  cat: 'Actions', icon: 'Docs',     title: 'Generate case study', desc: 'From the last completed project, draft a long-form case study in brand voice.', tags: ['Content', 'Delivery'] },
  { id: 'proposal',   cat: 'Actions', icon: 'Briefcase',title: 'Build proposal v2',   desc: 'Tailor a proposal to a specific lead using their ICP playbook + 30/60/90 frame.', tags: ['Sales'] },
  { id: 'plan',       cat: 'Actions', icon: 'Calendar', title: 'Plan my next week',   desc: 'Distribute tasks across days based on owner capacity + deadlines + priorities.', tags: ['Scaling'] },

  { id: 'risk',  cat: 'Analyze', icon: 'AlertCircle', title: 'Surface project risks',  desc: 'Which projects are slipping? Who needs attention before Friday?', tags: ['Delivery'] },
  { id: 'cash',  cat: 'Analyze', icon: 'DollarSign',  title: 'Cash flow projection',  desc: '12-week look-ahead. What is collected, what is at risk, what is the runway?', tags: ['Finance'] },
  { id: 'churn', cat: 'Analyze', icon: 'User',        title: 'Retainer churn signals', desc: 'Which retainer clients are showing disengagement patterns?', tags: ['Sales', 'Delivery'] },
];

const SEED_REPORTS = [
  { id: 'r1', title: 'Weekly executive summary · W21', author: 'Agent', when: 'Today',    size: '1,184 words', tags: ['Growth', 'Sales'],   cover: ['#C4A35A', '#2C0405'] },
  { id: 'r2', title: 'Pipeline health audit · May',     author: 'Agent', when: 'Today',    size: '6 sections',  tags: ['Sales'],             cover: ['#769268', '#1F2D1A'] },
  { id: 'r3', title: 'Agency ICP cohort · Q2',          author: 'Agent', when: 'May 17',   size: '12 charts',   tags: ['Strategy'],          cover: ['#6DBEDC', '#0F1B2D'] },
  { id: 'r4', title: 'Content performance · 8 weeks',   author: 'Agent', when: 'May 14',   size: '7 charts',    tags: ['Content'],           cover: ['#F1ADD8', '#23150E'] },
  { id: 'r5', title: 'Cash flow projection · 12-week',  author: 'Agent', when: 'May 10',   size: '3 scenarios', tags: ['Finance'],           cover: ['#E8BC59', '#3D1214'] },
  { id: 'r6', title: 'Sunnyside · case study draft',    author: 'Agent', when: 'May 04',   size: '1,420 words', tags: ['Content', 'Delivery'], cover: ['#E8BC59', '#1F1611'] },
];

export const Agent: React.FC = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { automations, toggleAutomation } = useAutomations();
  const [tab, setTab] = useState<Tab>('ask');
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread]);

  // Live count for automations (workflows = automations table)
  const workflows = useMemo(() => automations.map(a => ({
    id: a.id,
    title: a.name,
    desc: a.description || 'Custom automation rule',
    on: a.status === 'active',
    runs: (a as any).runs ?? 0,
    lastRun: (a as any).last_run_at ? new Date((a as any).last_run_at).toLocaleDateString() : '—',
    steps: ((a as any).actions || []).length || 1,
  })), [automations]);

  // If no real automations, fall back to bundle's seed workflows so the
  // visual demos how this will look once populated.
  const SEED_WORKFLOWS = useMemo(() => [
    { id: 'sw1', title: 'Monday morning brief',      desc: 'Every Mon 7:30 — generate weekly summary, surface 3 priorities, draft Slack post.', on: true,  runs: 12, lastRun: 'Yesterday', steps: 4 },
    { id: 'sw2', title: 'Lead won → case study',     desc: 'When a lead moves to Won, queue a case-study draft using project completion data.',  on: true,  runs: 6,  lastRun: '2d ago',    steps: 5 },
    { id: 'sw3', title: 'Stale lead nudge',          desc: 'Every 3 days, find leads stuck >5d in a stage and draft personalized follow-ups.',   on: true,  runs: 47, lastRun: 'Today',     steps: 3 },
    { id: 'sw4', title: 'Content cadence guard',     desc: 'When the publish cadence drops below 80% target, ping you + suggest 3 ideas.',       on: true,  runs: 4,  lastRun: '5d ago',    steps: 3 },
    { id: 'sw5', title: 'Retainer renewal · 60d',    desc: '60 days before retainer end, draft renewal email + summarize the year wins.',        on: false, runs: 2,  lastRun: 'Mar 12',    steps: 4 },
    { id: 'sw6', title: 'Friday close-out',          desc: 'Every Fri 17:00 — log KPIs, generate weekly snapshot, queue Monday priorities.',     on: true,  runs: 18, lastRun: 'Last Fri',  steps: 5 },
  ], []);

  const wfList = workflows.length > 0 ? workflows : SEED_WORKFLOWS;

  // Send a message to the agent. Currently uses a friendly mock that
  // includes sources + findings + actions matching the bundle's
  // SEED_THREAD shape. Wire to /gemini edge function later.
  const handleSend = useCallback(async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    const userMsg: ChatMsg = { role: 'user', text, when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setThread(prev => [...prev, userMsg]);
    try {
      // Simulate the agent response with structured output
      await new Promise(r => setTimeout(r, 800));
      const agentMsg: ChatMsg = {
        role: 'agent',
        when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `I looked at your live data and found three patterns. (This is a placeholder — wire the agent backend to /gemini for real answers.)`,
        sources: ['Sales pipeline', 'Strategy · ICPs', 'Content · Calendar'],
        findings: [
          { tone: 'red',   label: 'Halcyon AI sat 6+ days in Call Done',         action: 'Send recap email' },
          { tone: 'amber', label: 'Sable Loft proposal awaiting CFO sign-off',    action: 'Bump email' },
          { tone: 'green', label: 'Atlas Retainer ready to counter on MRR',       action: 'Send counter' },
        ],
        actions: [
          { id: 'send3', label: 'Send 3 follow-ups now',  primary: true,  icon: 'Mail' },
          { id: 'save',  label: 'Save as report',         primary: false, icon: 'Docs' },
          { id: 'sched', label: 'Schedule weekly recap',  primary: false, icon: 'Calendar' },
        ],
      };
      setThread(prev => [...prev, agentMsg]);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  return (
    <div className="bdl-ag-page">
      {/* Header */}
      <header className="bdl-ag-head">
        <div>
          <div className="bdl-ag-title-eyebrow">
            <span className="pulse" />
            Agent · always on
          </div>
          <h1 className="bdl-page-title">Ask the system</h1>
          <p className="bdl-page-sub">
            Cross-module reports · Automated workflows · Saved analyses
          </p>
        </div>
      </header>

      {/* Tab strip */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="bdl-tabs">
          {([
            { id: 'ask' as const,       label: 'Ask',       icon: 'Sparkles', count: thread.length },
            { id: 'workflows' as const, label: 'Workflows', icon: 'Activity', count: wfList.length },
            { id: 'reports' as const,   label: 'Reports',   icon: 'Docs',     count: SEED_REPORTS.length },
          ]).map(t => {
            const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`bdl-tab ${tab === t.id ? 'active' : ''}`}
              >
                <IconCmp size={12} />
                {t.label}
                {t.count > 0 && <span className="count">{t.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── ASK TAB ─── */}
      {tab === 'ask' && (
        <div className="bdl-ag-thread" ref={scrollRef}>
          {thread.length === 0 ? (
            <>
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#71717a' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                  background: '#18181b', color: '#e8bc59',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <Icons.Sparkles size={24} />
                  <span style={{
                    position: 'absolute', inset: -4, borderRadius: 20,
                    background: 'conic-gradient(from 0deg, #E8BC59, #769268, #6DBEDC, #F1ADD8, #E8BC59)',
                    zIndex: -1, filter: 'blur(8px)', opacity: 0.4,
                    animation: 'bdl-ag-halo 6s linear infinite',
                  }} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 300, letterSpacing: '-0.02em', color: '#18181b', marginBottom: 4 }}>
                  What do you want to know?
                </div>
                <p style={{ fontSize: 12.5, color: '#a1a1aa', maxWidth: 460, margin: '0 auto' }}>
                  The agent reads from your live tenant data — pipeline, content, finance, team.
                  Pick a recipe below or type your own question.
                </p>
              </div>

              <div className="bdl-ag-recipe-grid">
                {AGENT_RECIPES.map(r => {
                  const IconCmp = (Icons as any)[r.icon] || Icons.Sparkles;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="bdl-ag-recipe"
                      onClick={() => handleSend(`${r.title} — ${r.desc}`)}
                    >
                      <div className="bdl-ag-recipe-head">
                        <span className="bdl-ag-recipe-ic"><IconCmp size={12} /></span>
                        <span className="bdl-ag-recipe-cat">{r.cat}</span>
                      </div>
                      <div className="bdl-ag-recipe-title">{r.title}</div>
                      <div className="bdl-ag-recipe-desc">{r.desc}</div>
                      <div className="bdl-ag-recipe-tags">
                        {r.tags.map(t => (
                          <span key={t} className="bdl-ag-recipe-tag">{t}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <AnimatePresence initial={false}>
              {thread.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_ENTER}
                  className={`bdl-ag-msg ${m.role}`}
                >
                  <div className="bdl-ag-msg-av">
                    {m.role === 'agent' ? 'AI' : (user?.name?.slice(0, 2).toUpperCase() || 'YO')}
                  </div>
                  <div className="bdl-ag-msg-body">
                    <div className="bdl-ag-msg-bubble">
                      {m.text}
                    </div>

                    {m.sources && m.sources.length > 0 && (
                      <div className="bdl-ag-sources">
                        {m.sources.map(s => (
                          <span key={s} className="bdl-ag-source-chip">
                            <span className="dot" />
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {m.findings && m.findings.length > 0 && (
                      <div className="bdl-ag-findings">
                        {m.findings.map((f, j) => (
                          <div key={j} className="bdl-ag-finding">
                            <span className={`bdl-ag-finding-dot ${f.tone}`} />
                            <span>{f.label}</span>
                            {f.action && (
                              <span className="bdl-ag-finding-action">{f.action} →</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {m.actions && m.actions.length > 0 && (
                      <div className="bdl-ag-actions">
                        {m.actions.map(a => {
                          const IconCmp = a.icon ? ((Icons as any)[a.icon] || Icons.Sparkles) : null;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              className={`bdl-ag-action ${a.primary ? 'primary' : ''}`}
                            >
                              {IconCmp && <IconCmp size={11} />}
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* Composer */}
          <div className="bdl-ag-composer">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={sending ? 'Thinking…' : 'Ask anything — pipeline, content, finance, team…'}
              disabled={sending}
              rows={1}
            />
            <button
              className="bdl-ag-composer-send"
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              aria-label="Send"
            >
              {sending ? <Icons.Loader size={14} className="animate-spin" /> : <Icons.Send size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* ─── WORKFLOWS TAB ─── */}
      {tab === 'workflows' && (
        <>
          {/* Hero — bundle's prod-hero pattern with anatomy diagram on the right */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5 mb-5 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-amber-50/40 via-white to-rose-50/20 dark:from-amber-950/10 dark:via-zinc-900 dark:to-rose-950/10">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Agent workflows
              </div>
              <h2 className="text-[26px] font-light text-zinc-900 dark:text-zinc-100 mt-2 leading-tight" style={{ letterSpacing: '-0.03em' }}>
                {wfList.filter(w => w.on).length} workflows running<br />
                <span className="text-zinc-400">{wfList.reduce((s, w) => s + (w.runs || 0), 0)} executions this quarter</span>
              </h2>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3 max-w-[420px] leading-relaxed">
                Multi-step recipes Agent runs on a schedule or trigger. Each step can call modules,
                draft outputs, or pause for your approval.
              </p>
              <button className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90">
                <Icons.Plus size={12} />
                Build workflow
              </button>
            </div>
            <div className="lg:pl-5 lg:border-l lg:border-zinc-200/60 dark:lg:border-zinc-700/50">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-zinc-500 block mb-3">Workflow anatomy</span>
              <div className="space-y-1.5">
                {['Trigger', 'Read context', 'Reason', 'Draft', 'Approve', 'Execute'].map((s, i, a) => (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800">
                      <span className="font-mono text-[10px] tabular-nums text-zinc-400 w-6">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-[12px] text-zinc-800 dark:text-zinc-200">{s}</span>
                      {i === 0 && <span className="ml-auto text-[9.5px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300">start</span>}
                      {i === a.length - 1 && <span className="ml-auto text-[9.5px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300">end</span>}
                    </div>
                    {i < a.length - 1 && (
                      <div className="flex justify-center text-zinc-300 dark:text-zinc-700 text-[14px] leading-none">↓</div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          <div className="bdl-ag-wf-grid">
          {wfList.map((w, idx) => (
            <motion.button
              key={w.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
              className={`bdl-ag-wf-card ${w.on ? 'on' : ''}`}
            >
              <div className="bdl-ag-wf-head">
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: '#a1a1aa', letterSpacing: '0.04em' }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="bdl-ag-wf-title">{w.title}</span>
                <button
                  type="button"
                  className={`bdl-ag-wf-toggle ${w.on ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Real automations: toggle via hook. Seed: visual only.
                    if (automations.find(a => a.id === w.id)) {
                      toggleAutomation(w.id, w.on ? 'paused' : 'active');
                    }
                  }}
                  aria-label={w.on ? 'Disable' : 'Enable'}
                />
              </div>
              <div className="bdl-ag-wf-desc">{w.desc}</div>
              <div className="bdl-ag-wf-foot">
                <span>{w.runs} runs · {w.steps} steps</span>
                <span>last: {w.lastRun}</span>
              </div>
            </motion.button>
          ))}
          </div>
        </>
      )}

      {/* ─── REPORTS TAB ─── */}
      {tab === 'reports' && (() => {
        const byTag: Record<string, number> = {};
        SEED_REPORTS.forEach(r => r.tags.forEach(t => { byTag[t] = (byTag[t] || 0) + 1; }));
        const tagRows = Object.entries(byTag).sort((a, b) => b[1] - a[1]).map(([l, n], i) => ({
          l, n,
          c: ['#C4A35A', '#F1ADD8', '#6DBEDC', '#769268', '#5C1D18'][i % 5],
        }));
        const maxN = Math.max(...tagRows.map(t => t.n), 1);
        return (
        <>
          {/* Hero — reports library overview + by-tag chart */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5 mb-5 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-amber-50/40 via-white to-rose-50/20 dark:from-amber-950/10 dark:via-zinc-900 dark:to-rose-950/10">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Reports library
              </div>
              <h2 className="text-[26px] font-light text-zinc-900 dark:text-zinc-100 mt-2 leading-tight" style={{ letterSpacing: '-0.03em' }}>
                {SEED_REPORTS.length} reports<br />
                <span className="text-zinc-400">generated & saved by Agent</span>
              </h2>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3 max-w-[420px] leading-relaxed">
                Every output Agent produces lands here — re-runnable, shareable, exportable. Yesterday's
                report becomes today's snapshot.
              </p>
            </div>
            <div className="lg:pl-5 lg:border-l lg:border-zinc-200/60 dark:lg:border-zinc-700/50">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-zinc-500 block mb-3">By tag</span>
              {tagRows.map(t => (
                <div key={t.l} className="flex items-center gap-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300 min-w-[110px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: t.c }} />
                    {t.l}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(t.n / maxN) * 100}%`, background: t.c }} />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100 min-w-[28px] text-right tabular-nums">{t.n}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="bdl-ag-rp-grid">
          {SEED_REPORTS.map((r, idx) => (
            <motion.button
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
              className="bdl-ag-rp-card"
            >
              <div
                className="bdl-ag-rp-cover"
                style={{
                  ['--cover-a' as any]: r.cover[0],
                  ['--cover-b' as any]: r.cover[1],
                }}
              >
                <span className="bdl-ag-rp-eyebrow">REPORT · {r.when}</span>
              </div>
              <div className="bdl-ag-rp-body">
                <div className="bdl-ag-rp-title">{r.title}</div>
                <div className="bdl-ag-rp-meta">
                  <span>{r.author}</span>
                  <span>·</span>
                  <span>{r.size}</span>
                </div>
                <div className="bdl-ag-rp-tags">
                  {r.tags.map(t => (
                    <span key={t} className="bdl-ag-rp-tag">{t}</span>
                  ))}
                </div>
                {/* Re-run / Open actions row — bundle parity */}
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-800">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                    <Icons.Eye size={10} /> Open
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                    <Icons.Loader size={10} /> Re-run
                  </span>
                  <span className="ml-auto text-[9.5px] font-mono text-zinc-400">PDF · MD · JSON</span>
                </div>
              </div>
            </motion.button>
          ))}
          </div>
        </>
        );
      })()}
    </div>
  );
};
