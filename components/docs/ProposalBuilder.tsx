// @ts-nocheck
// ProposalBuilder — wizard fullscreen para crear/editar proposals con live deck preview.
//
// Portado 1:1 del design bundle de claude.ai/design (livv-os-proposal-builder.jsx).
// El CSS asociado vive en styles/livv-proposal-builder.css y se importa global
// desde index.tsx.
//
// Diferencias vs el JSX original:
//   • React hooks importados normalmente (no destructuring de window.React).
//   • Tipos relajados con @ts-nocheck — el archivo es portado.
//   • Iconos OS_ICON reemplazados por SVG inline (los SVG ya estaban inline en
//     muchos lugares del original).
//   • Constante LEADS fallback inline (el original esperaba LEADS global desde
//     data.jsx — acá la inyectamos como prop con un default sensato).
//   • window.claude.complete → fetch a `/functions/v1/gemini` con type='general_chat'
//     y prompt structured. Fallback al template local si falla.

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const PB_PACKAGES = [
  { id: 'agency',   name: 'Agency OS',          weeks: 6, base: 24000, mrr: 5600, color: 'var(--accent)',
    desc: 'Content engine + sales loop for studios scaling past founder.',
    scope: ['Brand voice + system kit', 'Content engine (12 posts/mo)', 'Sales loop + CRM toolkit', 'Strategy retainer'] },
  { id: 'product',  name: 'SaaS Foundations',   weeks: 8, base: 36000, mrr: 7400, color: 'var(--sky)',
    desc: 'Product-led foundation: marketing site, onboarding, lifecycle.',
    scope: ['Marketing site v2', 'Onboarding flow redesign', 'Lifecycle automations', 'Analytics + reporting layer'] },
  { id: 'ecom',     name: 'E-com Growth Stack', weeks: 6, base: 26000, mrr: 5200, color: 'var(--pink)',
    desc: 'Shopify-native growth loop: PDP, lifecycle, paid.',
    scope: ['Shopify theme build', 'PDP optimization', 'Email + SMS lifecycle', 'Paid creative ops'] },
  { id: 'consult',  name: 'Consultant Toolkit', weeks: 4, base: 14000, mrr: 3600, color: 'var(--sage)',
    desc: 'Positioning, offer, lightweight site, intake.',
    scope: ['Positioning sprint', 'Site (5 pages)', 'Intake + booking', '90-day playbook'] },
  { id: 'strategy', name: 'Strategy Sprint',    weeks: 2, base: 12000, mrr: 0,    color: 'var(--wine)',
    desc: 'Positioning + offer architecture, no build.',
    scope: ['Positioning audit', 'Offer architecture', 'Pricing model', 'Activation roadmap'] },
  { id: 'brand',    name: 'Brand System',       weeks: 4, base: 18000, mrr: 0,    color: '#8B5A2B',
    desc: 'Identity, type, motion, web kit.',
    scope: ['Logo + monogram', 'Type + color system', 'Motion principles', 'Web component kit'] },
]

const PB_INDUSTRY: any = {
  agency:   'Creative / Design Studio',
  consult:  'Strategy / Consulting',
  product:  'B2B SaaS',
  ecom:     'DTC / Ecommerce',
  retainer: 'Ongoing Operations',
}

const PB_ICP_COLOR: any = {
  agency:   'var(--accent)',
  consult:  'var(--sage)',
  product:  'var(--sky)',
  ecom:     'var(--pink)',
  retainer: 'var(--wine)',
}

const PB_TONES = ['Direct', 'Editorial', 'Warm', 'Technical']

const PB_PORTFOLIO = [
  { id: 'sunnyside', name: 'Sunnyside · Content Engine',     result: '90% cadence · 24wk',   color: 'var(--sage)' },
  { id: 'aire',      name: 'Aire Aroma · Brand + commerce',  result: '+38% AOV · 60d',       color: 'var(--accent)' },
  { id: 'cremona',   name: 'Cremona Capital · Strategy',     result: 'Pricing tier reset',   color: 'var(--sky)' },
  { id: 'sable',     name: 'Sable Loft · Brand System',      result: 'Visual ID + motion',   color: 'var(--pink)' },
  { id: 'boreal',    name: 'Boreal Beauty · Lifecycle',      result: '+22% LTV · 12wk',      color: '#A855F7' },
  { id: 'iron',      name: 'Iron Path · Positioning',        result: 'New offer · $4K MRR',  color: 'var(--wine)' },
]

const PB_TIER_TEMPLATES = ['Lite', 'Standard', 'Premium', 'Enterprise', 'Custom']

// Fallback leads — used when no leads are passed in. Replace later with a
// live query against the `leads` table for the current tenant.
const LEADS_FALLBACK = [
  { id: 30, company: 'Mulberry Group',  contact: 'Camila Reyes',  icp: 'agency',  source: 'Inbound',   stage: 'proposal',  impl: 27600, mrr: 3000, action: 'Send proposal', when: 'today',     age: 4,  owner: 'EN', custom: false },
  { id: 32, company: 'Halcyon AI',      contact: 'Jordan Lee',    icp: 'product', source: 'Referral',  stage: 'call-done', impl: 36000, mrr: 7400, action: 'Send proposal', when: 'today',     age: 2,  owner: 'EN', custom: false },
  { id: 40, company: 'Boreal Beauty',   contact: 'Sasha Voss',    icp: 'ecom',    source: 'LinkedIn',  stage: 'call',      impl: 26000, mrr: 5200, action: 'Discovery call', when: 'tomorrow', age: 9,  owner: 'LU', custom: false },
  { id: 42, company: 'Sable Loft',      contact: 'Marta Cruz',    icp: 'agency',  source: 'Direct',    stage: 'contacted', impl: 18000, mrr: 0,    action: 'Follow up',     when: 'this week', age: 12, owner: 'EN', custom: false },
  { id: 60, company: 'Cremona Capital', contact: 'Pedro Ríos',    icp: 'consult', source: 'Referral',  stage: 'won',       impl: 12000, mrr: 0,    action: 'Kickoff',       when: 'next mon',  age: 18, owner: 'LU', custom: false },
  { id: 70, company: 'Iron Path',       contact: 'Mira Ohama',    icp: 'consult', source: 'Inbound',   stage: 'contacted', impl: 14000, mrr: 3600, action: 'Schedule call', when: 'this week', age: 7,  owner: 'EN', custom: false },
]

const fmt$ = (n: any) => '$' + (Math.round(+n || 0)).toLocaleString()

const Step = ({ n, title, sub, meta, touched, children }: any) => (
  <section className={`pb-step ${touched ? 'touched' : ''}`}>
    <header className="pb-step-head">
      <div className="pb-step-n">{n}</div>
      <div>
        <div className="pb-step-title">{title}</div>
        {sub && <div className="pb-step-sub">{sub}</div>}
      </div>
      {meta && <div className="pb-step-meta">{meta}</div>}
    </header>
    {children}
  </section>
)

const PbSlide = ({ n, total, eyebrow, company, children, cover, wine, fresh }: any) => (
  <article className={`pb-slide ${cover ? 'cover' : ''} ${wine ? 'wine' : ''} ${fresh ? 'ai-fresh' : ''}`}>
    {!cover && (
      <header className="pb-slide-head">
        <span className="pb-eyebrow">© {eyebrow} サービス</span>
        <span className="pb-slide-meta">{company} · {n} / {total}</span>
      </header>
    )}
    <div className="pb-slide-body">
      {children}
    </div>
    {!cover && (
      <footer className="pb-slide-foot">
        <span>livv.systems</span>
        <span>WDX® — {n}</span>
      </footer>
    )}
  </article>
)

const tierTotals = (t: any) => {
  const one = t.lines.filter((l: any) => !l.recur).reduce((s: number, l: any) => s + (+l.amount || 0), 0)
  const mo  = t.lines.filter((l: any) =>  l.recur).reduce((s: number, l: any) => s + (+l.amount || 0), 0)
  const discAmt = Math.round(one * (t.discount || 0) / 100)
  return { one, mo, discAmt, oneFinal: one - discAmt }
}

const seedLines = (p: any) => {
  const items = [{ id: 'L1', label: `${p.name} · implementation (${p.weeks}w)`, amount: p.base, recur: false }]
  if (p.mrr > 0) items.push({ id: 'L2', label: 'Strategy retainer', amount: p.mrr, recur: true })
  return items
}

interface Props {
  initialLeadId?: string | number | null
  leads?: any[]  // optional override — defaults to LEADS_FALLBACK
  tenantId?: string | null
  onClose: () => void
  onSaved?: (proposalId: string) => void
}

export const ProposalBuilder: React.FC<Props> = ({ initialLeadId, leads: leadsProp, tenantId, onClose, onSaved }) => {
  const LEADS = leadsProp && leadsProp.length > 0 ? leadsProp : LEADS_FALLBACK
  const [saving, setSaving] = useState<boolean>(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const [customLeads, setCustomLeads] = useState<any[]>([])
  const allLeads = [...customLeads, ...LEADS]
  const [leadId, setLeadId] = useState<string | number>(initialLeadId ?? LEADS[0]?.id ?? 30)
  const lead = allLeads.find(l => l.id === leadId) || allLeads[0]

  const [stageFilter, setStageFilter] = useState<string>('all')
  const [icpFilter, setIcpFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  const [showNewLead, setShowNewLead] = useState<boolean>(false)
  const blankLead = { company: '', contact: '', icp: 'agency', source: 'Direct' }
  const [newLead, setNewLead] = useState<any>(blankLead)

  const saveNewLead = () => {
    if (!newLead.company.trim()) return
    const id = 9000 + customLeads.length + 1
    const created = {
      id,
      stage: 'new',
      company: newLead.company.trim(),
      contact: newLead.contact.trim() || '—',
      icp: newLead.icp,
      source: newLead.source.trim() || 'Direct',
      impl: 0, mrr: 0, action: 'New', when: 'today', age: 0, owner: 'EN',
      custom: true,
    }
    setCustomLeads(cs => [created, ...cs])
    setLeadId(id)
    setShowNewLead(false)
    setNewLead(blankLead)
  }

  const defaultPkg = (icp: string) =>
    icp === 'agency' ? 'agency' :
    icp === 'product' ? 'product' :
    icp === 'ecom' ? 'ecom' :
    'consult'

  const [pkgId, setPkgId] = useState<string>(defaultPkg(lead.icp))
  const pkg = PB_PACKAGES.find(p => p.id === pkgId)!

  const [scopeItems, setScopeItems] = useState<string[]>(() =>
    PB_PACKAGES.find(p => p.id === defaultPkg(lead.icp))!.scope.slice()
  )

  const seedTier = (p: any, name = 'Standard', recommended = true, discount = 0) => ({
    id: 'T' + Date.now() + Math.random().toString(36).slice(2, 6),
    name, recommended, discount,
    lines: seedLines(p).map(l => ({ ...l, id: l.id + Math.random().toString(36).slice(2, 6) })),
  })
  const [tiers, setTiers] = useState<any[]>([seedTier(PB_PACKAGES.find(p => p.id === defaultPkg(lead.icp)))])

  useEffect(() => {
    const np = defaultPkg(lead.icp)
    const newPkg = PB_PACKAGES.find(p => p.id === np)!
    setPkgId(np)
    setScopeItems(newPkg.scope.slice())
    setTiers([seedTier(newPkg)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  const [insights, setInsights] = useState<any[]>([
    { id: 'i1', label: 'Pain point',     value: 'Cadence broken 6 weeks in a row.' },
    { id: 'i2', label: 'Decision-maker', value: 'Camila + Marco (CFO sign-off).' },
  ])
  const addInsight = () => setInsights(xs => [...xs, { id: 'i' + Date.now(), label: '', value: '' }])
  const editInsight = (id: any, k: string, v: any) =>
    setInsights(xs => xs.map(x => x.id === id ? { ...x, [k]: v } : x))
  const delInsight = (id: any) => setInsights(xs => xs.filter(x => x.id !== id))

  const [brief, setBrief] = useState<string>(
    'Mulberry needs a content engine that runs without founder bandwidth. 18-person studio, 6 missed cadences. We will install a 12-post/mo loop, automate intake from the team, and ship publishing inside 6 weeks.'
  )
  const [tone, setTone] = useState<string>('Direct')
  const [generating, setGenerating] = useState<boolean>(false)
  const [ai, setAi] = useState<any>(null)
  const [aiFresh, setAiFresh] = useState<boolean>(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState<string>('Jun 02')
  const proposalDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const [links, setLinks] = useState<any[]>([
    { id: 1, label: 'Sunnyside case study', url: 'livvvv.com/work/sunnyside' },
  ])
  const [cases, setCases] = useState<string[]>(['sunnyside', 'aire'])
  const [notes, setNotes] = useState<string>('')

  const t_brief   = brief && brief.length > 30
  const t_pricing = tiers.length > 0
  const t_custom  = links.some(l => l.url) || cases.length > 0 || notes.length > 0
  const t_insight = insights.some(i => i.value)

  const filteredLeads = allLeads.filter(l => {
    if (stageFilter !== 'all' && l.stage !== stageFilter && !l.custom) return false
    if (icpFilter !== 'all' && l.icp !== icpFilter) return false
    if (search && !`${l.company} ${l.contact}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const editScope = (idx: number, v: string) => setScopeItems(xs => xs.map((s, i) => i === idx ? v : s))
  const delScope  = (idx: number) => setScopeItems(xs => xs.filter((_, i) => i !== idx))
  const addScope  = () => setScopeItems(xs => [...xs, ''])

  const addTier = (tplName = 'Custom') => setTiers(ts => [...ts, seedTier(pkg, tplName, false, 0)])
  const delTier = (id: any) => setTiers(ts => ts.length > 1 ? ts.filter(t => t.id !== id) : ts)
  const editTier = (id: any, k: string, v: any) =>
    setTiers(ts => ts.map(t => t.id === id ? { ...t, [k]: v } : t))
  const setRecommended = (id: any) =>
    setTiers(ts => ts.map(t => ({ ...t, recommended: t.id === id ? !t.recommended : false })))

  const addLineTo = (tierId: any) => editTier(tierId, 'lines', [
    ...(tiers.find(t => t.id === tierId).lines),
    { id: 'L' + Date.now() + Math.random().toString(36).slice(2, 5), label: '', amount: 0, recur: false }
  ])
  const editLineIn = (tierId: any, lineId: any, k: string, v: any) => {
    const t = tiers.find((tt: any) => tt.id === tierId)
    editTier(tierId, 'lines', t.lines.map((l: any) => l.id === lineId ? { ...l, [k]: v } : l))
  }
  const delLineIn = (tierId: any, lineId: any) => {
    const t = tiers.find((tt: any) => tt.id === tierId)
    editTier(tierId, 'lines', t.lines.filter((l: any) => l.id !== lineId))
  }

  const addLink = () => setLinks(ls => [...ls, { id: Date.now(), label: '', url: '' }])
  const editLink = (id: any, k: string, v: any) => setLinks(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l))
  const delLink  = (id: any) => setLinks(ls => ls.filter(l => l.id !== id))
  const toggleCase = (id: string) =>
    setCases(cs => cs.includes(id) ? cs.filter(c => c !== id) : [...cs, id])

  // AI generation — calls gemini edge fn with a structured prompt. Falls back
  // to a local template if anything goes wrong.
  const generate = async () => {
    setGenerating(true)
    setAiError(null)
    const fallback = {
      understanding: `${lead.company} is at a moment where operational bandwidth caps growth. They need a system they don't have to invent, run, or babysit — installed cleanly, handed off without ceremony.`,
      approach: [
        { name: 'Discover', desc: 'Map the current state. Surface the highest-leverage gap in week one.' },
        { name: 'Install',  desc: `Ship the ${pkg.name.toLowerCase()} engine over ${pkg.weeks} weeks. Bi-weekly demos.` },
        { name: 'Operate',  desc: 'Hand off with a 90-day runbook and a monthly cadence check-in.' },
      ],
      scope: pkg.scope,
      next_steps: ['Sign and pay 30% deposit', `Kickoff workshop · ${startDate}`, 'Phase 01 ships in week 1'],
    }
    try {
      const insightStr = insights.filter(i => i.value).map(i => `${i.label}: ${i.value}`).join(' · ')
      const prompt = `You are writing for Livv Studio — a boutique creative-engineering studio. Voice: confident, declarative, slightly romantic about craft. Short sentences. No emoji, no exclamation marks. Use "we / you".

Client: ${lead.company} (${PB_INDUSTRY[lead.icp]}, contact: ${lead.contact})
Source: ${lead.source}. Stage: ${lead.stage}.
Package: ${pkg.name} — ${pkg.desc}
Insights: ${insightStr || 'none'}
Brief from our team: ${brief}
Tone: ${tone}

Return ONLY valid JSON (no fences, no preamble). Shape:
{
  "understanding": "2 short sentences synthesizing the need, in Livv voice",
  "approach": [{"name":"Phase name (one word)","desc":"1 declarative sentence"}, {...}, {...}],
  "scope": ["bullet 1","bullet 2","bullet 3","bullet 4"],
  "next_steps": ["Sign and deposit","Kickoff workshop","Phase 01 ships"]
}`
      const { data, error } = await supabase.functions.invoke('gemini', {
        body: { type: 'advisor_chat', input: prompt },
      })
      if (error) throw new Error(String(error))
      const txt = data?.result?.reply || data?.result || ''
      const m = typeof txt === 'string' ? txt.match(/\{[\s\S]*\}/) : null
      if (!m) throw new Error('no-json')
      const json = JSON.parse(m[0])
      const merged = { ...fallback, ...json }
      setAi(merged)
      if (merged.scope && merged.scope.length) setScopeItems(merged.scope.slice(0, 6))
    } catch (e) {
      setAi(fallback)
      setAiError('Used local template (AI unavailable)')
    }
    setGenerating(false)
    setAiFresh(true)
    setTimeout(() => setAiFresh(false), 1500)
  }

  // Persist proposal to `proposals` table. Insert on first save, update after.
  const saveProposal = async (markSent = false) => {
    if (!tenantId) { alert('Tenant not ready'); return null }
    setSaving(true)
    try {
      const recommended = tiers.find((t: any) => t.recommended) || tiers[0]
      const { oneFinal, mo } = tierTotals(recommended)
      const pricingTotal = oneFinal + (mo * 12)  // annualized total for sorting
      const isUuid = typeof lead.id === 'string' && /^[0-9a-f-]{36}$/i.test(String(lead.id))

      const payload: any = {
        tenant_id: tenantId,
        lead_id: isUuid ? lead.id : null,
        title: `Proposal for ${lead.company}`,
        summary: ai?.understanding || brief.slice(0, 240),
        status: markSent ? 'sent' : 'draft',
        brief_text: brief,
        project_type: pkg.id,
        pricing_total: pricingTotal || null,
        portfolio_ids: cases,
        pricing_snapshot: {
          tiers,
          scope: scopeItems,
          insights,
          cases,
          links,
          notes,
          package: { id: pkg.id, name: pkg.name, weeks: pkg.weeks },
          ai: ai || null,
          tone,
          contact: lead.contact,
          company: lead.company,
        },
        timeline: { startDate, weeks: pkg.weeks, phases },
        updated_at: new Date().toISOString(),
      }
      if (markSent) payload.sent_at = new Date().toISOString()

      let proposalId = savedId
      if (proposalId) {
        const { data, error } = await supabase
          .from('proposals').update(payload).eq('id', proposalId).select('id').single()
        if (error) throw error
        proposalId = (data as any).id
      } else {
        const { data, error } = await supabase
          .from('proposals').insert(payload).select('id').single()
        if (error) throw error
        proposalId = (data as any).id
        setSavedId(proposalId)
      }
      setSaving(false)
      if (onSaved && proposalId) onSaved(proposalId)
      return proposalId
    } catch (err: any) {
      setSaving(false)
      console.error('[ProposalBuilder] save failed', err)
      alert(`Save failed: ${err?.message || 'unknown error'}`)
      return null
    }
  }

  const phases = (ai?.approach || [
    { name: 'Discover', desc: 'Map current state, surface highest-leverage gap.' },
    { name: 'Install',  desc: `Ship the ${pkg.name.toLowerCase()} in ${pkg.weeks} weeks.` },
    { name: 'Operate',  desc: '90-day runbook, monthly cadence check-ins.' },
  ]).slice(0, 3)
  while (phases.length < 3) phases.push({ name: 'Phase', desc: '—' })

  const visibleScope = scopeItems.filter(s => s.trim()).slice(0, 6)
  const nextSteps = (ai?.next_steps || [
    'Sign and pay 30% deposit',
    `Kickoff workshop · ${startDate}`,
    'Phase 01 ships in week 1',
  ]).slice(0, 3)

  const selectedCases = PB_PORTFOLIO.filter(p => cases.includes(p.id))
  const validLinks = links.filter(l => l.url)
  const visibleInsights = insights.filter(i => i.value)

  const slides = [
    'cover', 'hello', 'understanding', 'approach', 'scope',
    selectedCases.length > 0 ? 'work' : null,
    'timeline',
    'investment',
    (validLinks.length > 0 || notes) ? 'resources' : null,
    'next',
  ].filter(Boolean) as string[]
  const total = slides.length
  const N = (key: string) => String(slides.indexOf(key) + 1).padStart(2, '0')

  return (
    <div className="pb-root" data-screen-label="Proposals · Builder">
      <div className="pb-head">
        <button className="pb-back" onClick={onClose}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          Back to proposals
        </button>
        <div className="pb-head-title">
          <span className="pb-eyebrow">© Proposal builder · WDX — 00</span>
          <h2>Proposal for {lead.company}</h2>
        </div>
        <div className="pb-head-actions">
          <button className="dx-btn" onClick={() => saveProposal(false)} disabled={saving}>
            <span>{saving ? 'Saving…' : savedId ? 'Saved ✓ — update' : 'Save draft'}</span>
          </button>
          <button className="dx-btn" onClick={() => window.print()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/></svg>
            <span>Export PDF</span>
          </button>
          <button className="dx-btn primary" onClick={async () => { const id = await saveProposal(true); if (id) onClose() }} disabled={saving}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>{saving ? 'Sending…' : `Send to ${(lead.contact || '').split(' ')[0]}`}</span>
          </button>
        </div>
      </div>

      <div className="pb-grid">
        <div className="pb-form">

          {/* 01 — LEAD */}
          <Step n="01" title="Pick a lead" sub="Choose from the CRM or create one on the fly." meta={`${filteredLeads.length} / ${allLeads.length}`} touched>
            <div className="pb-filters">
              <div className="pb-search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                <input placeholder="Search company or contact…" value={search} onChange={e => setSearch(e.target.value)}/>
              </div>
              <div className="pb-chips">
                {[['all', 'All stages'], ['contacted', 'Contacted'], ['call', 'Call'], ['call-done', 'Call done'], ['proposal', 'Proposal'], ['won', 'Won']].map(([id, lbl]) => (
                  <button key={id} className={`pb-chip ${stageFilter === id ? 'on' : ''}`} onClick={() => setStageFilter(id as string)}>{lbl}</button>
                ))}
              </div>
              <div className="pb-chips">
                {[['all', 'All ICPs'], ['agency', 'Agency'], ['consult', 'Consultant'], ['product', 'SaaS'], ['ecom', 'E-com']].map(([id, lbl]) => (
                  <button key={id} className={`pb-chip ${icpFilter === id ? 'on' : ''}`} onClick={() => setIcpFilter(id as string)}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="pb-leads">
              {filteredLeads.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--os-fg-3)', fontSize: 12 }}>No leads match these filters.</div>
              )}
              {filteredLeads.map(l => (
                <button key={l.id} className={`pb-lead ${leadId === l.id ? 'on' : ''}`} onClick={() => setLeadId(l.id)}>
                  <span className="pb-lead-av" style={{ background: PB_ICP_COLOR[l.icp] }}>{(l.company || '').slice(0, 2).toUpperCase()}</span>
                  <div className="pb-lead-body">
                    <strong>{l.company}{l.custom && <span className="pb-lead-tag">NEW</span>}</strong>
                    <small>{l.contact} · {PB_INDUSTRY[l.icp]} · {l.source}</small>
                  </div>
                  <span className="pb-lead-meta">{l.impl ? '$' + (l.impl / 1000).toFixed(0) + 'K' : '—'}</span>
                </button>
              ))}
            </div>

            {showNewLead ? (
              <div className="pb-new-lead-form">
                <div className="pb-nl-field wide">
                  <label>Company name</label>
                  <input type="text" autoFocus placeholder="e.g. Northstar Studios" value={newLead.company} onChange={e => setNewLead({ ...newLead, company: e.target.value })}/>
                </div>
                <div className="pb-nl-field">
                  <label>Contact</label>
                  <input type="text" placeholder="Full name" value={newLead.contact} onChange={e => setNewLead({ ...newLead, contact: e.target.value })}/>
                </div>
                <div className="pb-nl-field">
                  <label>ICP</label>
                  <select value={newLead.icp} onChange={e => setNewLead({ ...newLead, icp: e.target.value })}>
                    <option value="agency">Agency / Studio</option>
                    <option value="consult">Consultant</option>
                    <option value="product">SaaS / Product</option>
                    <option value="ecom">E-com / DTC</option>
                    <option value="retainer">Ongoing / Retainer</option>
                  </select>
                </div>
                <div className="pb-nl-field wide">
                  <label>Source</label>
                  <input type="text" placeholder="e.g. Inbound, Referral, LinkedIn" value={newLead.source} onChange={e => setNewLead({ ...newLead, source: e.target.value })}/>
                </div>
                <div className="pb-nl-actions">
                  <button onClick={() => { setShowNewLead(false); setNewLead(blankLead) }}>Cancel</button>
                  <button className="save" onClick={saveNewLead} disabled={!newLead.company.trim()}>Save lead</button>
                </div>
              </div>
            ) : (
              <button className="pb-new-lead-btn" onClick={() => setShowNewLead(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Create new lead
              </button>
            )}
          </Step>

          {/* 02 — CONTEXT + INSIGHTS */}
          <Step n="02" title="Company context & insights" sub="Auto-filled from CRM. Add anything else you know." touched={t_insight || true}>
            <div className="pb-kv">
              <div><span>Company</span><strong>{lead.company}</strong></div>
              <div><span>Contact</span><strong>{lead.contact}</strong></div>
              <div><span>Industry</span><strong>{PB_INDUSTRY[lead.icp]}</strong></div>
              <div><span>Source</span><strong>{lead.source}</strong></div>
              <div><span>Pipeline stage</span><strong style={{ textTransform: 'capitalize' }}>{(lead.stage || '').replace('-', ' ')}</strong></div>
              <div><span>Indicative value</span><strong>{lead.impl ? `$${(lead.impl / 1000).toFixed(0)}K + $${(lead.mrr / 1000).toFixed(1)}K/mo` : 'to be quoted'}</strong></div>
            </div>

            <div className="pb-field" style={{ marginTop: 14 }}>
              <span className="pb-field-lbl">Insights ({visibleInsights.length})</span>
              <div className="pb-insights">
                {insights.map(i => (
                  <div key={i.id} className="pb-insight">
                    <input className="label" type="text" placeholder="Insight · e.g. Budget cycle" value={i.label} onChange={e => editInsight(i.id, 'label', e.target.value)}/>
                    <input type="text" placeholder="What you know" value={i.value} onChange={e => editInsight(i.id, 'value', e.target.value)}/>
                    <button className="pb-line-x" onClick={() => delInsight(i.id)} title="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <button className="pb-add-line" onClick={addInsight}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Add insight
              </button>
            </div>
          </Step>

          {/* 03 — BRIEF + AI */}
          <Step n="03" title="What you want to do" sub="A few sentences in your words. AI rewrites it in Livv voice." touched={t_brief}>
            <textarea className="pb-textarea" rows={5} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Describe what the client needs. 2–4 sentences is enough."/>
            <div className="pb-row">
              <div className="pb-row-left">
                <span className="pb-sub">Tone</span>
                <div className="pb-chips">
                  {PB_TONES.map(t => (
                    <button key={t} className={`pb-chip ${tone === t ? 'on' : ''}`} onClick={() => setTone(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <button className="pb-ai-btn" onClick={generate} disabled={generating}>
                <span className="pb-spark">✦</span>
                {generating ? 'Generating…' : ai ? 'Regenerate sections' : 'Generate proposal with AI'}
              </button>
            </div>
            {ai && (
              <div className="pb-ai-out">
                <div className="pb-ai-out-head">
                  <span>✦</span>
                  <span>Synthesized understanding</span>
                  {aiError && <span style={{ marginLeft: 'auto', color: 'var(--os-fg-3)', letterSpacing: 0, textTransform: 'none', fontSize: 9 }}>{aiError}</span>}
                </div>
                <p>{ai.understanding}</p>
              </div>
            )}
          </Step>

          {/* 04 — PACKAGE + EDITABLE SCOPE */}
          <Step n="04" title="Package & scope" sub="Start from a package, then edit the deliverables freely." meta={`${pkg.weeks} weeks · ${scopeItems.filter(s => s.trim()).length} items`} touched>
            <div className="pb-pkgs">
              {PB_PACKAGES.map(p => (
                <button key={p.id} className={`pb-pkg ${pkgId === p.id ? 'on' : ''}`} onClick={() => { setPkgId(p.id); setScopeItems(p.scope.slice()); setTiers([seedTier(p)]) }} style={{ '--c': p.color } as any}>
                  <div className="pb-pkg-top">
                    <strong>{p.name}</strong>
                    <span>{p.weeks}w</span>
                  </div>
                  <small>{p.desc}</small>
                  <div className="pb-pkg-foot">
                    ${(p.base / 1000).toFixed(0)}K {p.mrr > 0 && <small>· ${(p.mrr / 1000).toFixed(1)}K/mo</small>}
                  </div>
                </button>
              ))}
            </div>

            <div className="pb-field" style={{ marginTop: 16 }}>
              <span className="pb-field-lbl">Scope · edit, add, remove</span>
              <div className="pb-scope-list">
                {scopeItems.map((s, i) => (
                  <div key={i} className="pb-scope-row">
                    <span className="pb-scope-n">0{i + 1}</span>
                    <input type="text" value={s} placeholder="Deliverable · e.g. PDP optimisation" onChange={e => editScope(i, e.target.value)}/>
                    <button className="pb-line-x" onClick={() => delScope(i)} title="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <button className="pb-add-line" onClick={addScope}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Add deliverable
              </button>
            </div>
          </Step>

          {/* 05 — PRICING TIERS */}
          <Step n="05" title="Pricing tiers" sub="Send one offer or compare a few. Toggle the chip to recommend a tier." meta={`${tiers.length} tier${tiers.length === 1 ? '' : 's'}`} touched={t_pricing}>
            <div className="pb-tiers">
              {tiers.map((tier) => {
                const { one, mo, discAmt, oneFinal } = tierTotals(tier)
                return (
                  <div key={tier.id} className={`pb-tier ${tier.recommended ? 'rec' : ''}`}>
                    <header className="pb-tier-head">
                      <input className="pb-tier-name" value={tier.name} onChange={e => editTier(tier.id, 'name', e.target.value)} placeholder="Tier name"/>
                      <button className={`pb-tier-rec-tog ${tier.recommended ? 'on' : ''}`} onClick={() => setRecommended(tier.id)}>
                        {tier.recommended ? '★ Recommended' : '☆ Recommend'}
                      </button>
                      {tiers.length > 1 && (
                        <button className="pb-tier-remove" onClick={() => delTier(tier.id)} title="Remove tier">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </header>
                    <div className="pb-tier-body">
                      <div className="pb-lines">
                        {tier.lines.map((l: any) => (
                          <div key={l.id} className="pb-line">
                            <input type="text" value={l.label} placeholder="Line item" onChange={e => editLineIn(tier.id, l.id, 'label', e.target.value)}/>
                            <input className="amount" type="number" value={l.amount} placeholder="0" onChange={e => editLineIn(tier.id, l.id, 'amount', e.target.value === '' ? '' : +e.target.value)}/>
                            <button className={`pb-line-recur ${l.recur ? 'on' : ''}`} onClick={() => editLineIn(tier.id, l.id, 'recur', !l.recur)}>
                              {l.recur ? '/ mo' : 'one-time'}
                            </button>
                            <button className="pb-line-x" onClick={() => delLineIn(tier.id, l.id)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <button className="pb-add-line" onClick={() => addLineTo(tier.id)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                        Add line
                      </button>
                      <div className="pb-tier-discount">
                        <span>Discount on one-time</span>
                        <span className="pb-slider">
                          <input type="range" min="0" max="25" step="5" value={tier.discount || 0} onChange={e => editTier(tier.id, 'discount', +e.target.value)}/>
                          <strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--os-fg-0)', minWidth: 32, textAlign: 'right' }}>{tier.discount || 0}%</strong>
                        </span>
                      </div>
                      <div className="pb-tier-subtotal">
                        <span>Total</span>
                        <div>
                          <strong>{fmt$(oneFinal)}</strong>
                          {mo > 0 && <small>+ {fmt$(mo)}/mo</small>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {PB_TIER_TEMPLATES.map(tpl => (
                <button key={tpl} className="pb-add-tier" onClick={() => addTier(tpl)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  {tpl} tier
                </button>
              ))}
            </div>
          </Step>

          {/* 06 — CUSTOM INFO */}
          <Step n="06" title="Custom info" sub="Selected work, custom links, a note for the client. All optional." meta={`${validLinks.length} links · ${cases.length} cases`} touched={t_custom}>
            <div className="pb-field">
              <span className="pb-field-lbl">Selected work</span>
              <div className="pb-cases">
                {PB_PORTFOLIO.map(c => (
                  <button key={c.id} className={`pb-case ${cases.includes(c.id) ? 'on' : ''}`} style={{ '--c': c.color } as any} onClick={() => toggleCase(c.id)}>
                    <span className="pb-case-dot"/>
                    <div className="pb-case-body">
                      <strong>{c.name}</strong>
                      <small>{c.result}</small>
                    </div>
                    <span className="pb-case-check">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pb-field" style={{ marginTop: 16 }}>
              <span className="pb-field-lbl">Custom links</span>
              <div className="pb-links">
                {links.map(l => (
                  <div key={l.id} className="pb-link">
                    <span className="pb-link-ic">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    </span>
                    <input type="text" value={l.label} placeholder="Label" onChange={e => editLink(l.id, 'label', e.target.value)}/>
                    <input className="url" type="text" value={l.url} placeholder="https://…" onChange={e => editLink(l.id, 'url', e.target.value)}/>
                    <button className="pb-line-x" onClick={() => delLink(l.id)} title="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <button className="pb-add-line" onClick={addLink}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Add link
              </button>
            </div>

            <div className="pb-field" style={{ marginTop: 16 }}>
              <span className="pb-field-lbl">Notes for the client</span>
              <textarea className="pb-textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything personal — a thank-you, conditions, fine print."/>
            </div>
          </Step>

          {/* 07 — TIMELINE */}
          <Step n="07" title="Timeline" sub="When you kick off and how long it runs." meta={`Kickoff ${startDate}`} touched>
            <div className="pb-kv pb-kv-inputs">
              <label><span>Start date</span><input type="text" value={startDate} onChange={e => setStartDate(e.target.value)}/></label>
              <label><span>Duration</span><input type="text" value={`${pkg.weeks} weeks`} disabled/></label>
            </div>
          </Step>
        </div>

        {/* ─── RIGHT: Live deck preview ─── */}
        <div className="pb-preview">
          <div className="pb-preview-head">
            <span className="pb-eyebrow">© Live preview · presentation</span>
            <span className="pb-preview-meta">{String(total).padStart(2, '0')} slides · 16:9 · ready to export</span>
          </div>
          <div className="pb-deck" id="pb-deck">

            <PbSlide n={N('cover')} total={total} eyebrow="Cover" company={lead.company} cover>
              <div className="pb-slide-cover">
                <div>
                  <div className="pb-cov-mark">L</div>
                  <div className="pb-cov-eye">© Proposal · WDX® 2026</div>
                </div>
                <h1>Proposal<br/>for {lead.company}.</h1>
                <div className="pb-cov-meta">
                  <div><small>Prepared for</small><strong>{lead.contact}</strong></div>
                  <div><small>By</small><strong>Livv Studio</strong></div>
                  <div><small>Date</small><strong>{proposalDate}</strong></div>
                </div>
              </div>
            </PbSlide>

            <PbSlide n={N('hello')} total={total} eyebrow="Hello" company={lead.company}>
              <h2>Hello {(lead.contact || '').split(' ')[0]} —</h2>
              <p>Thanks for the conversation. This document captures what we heard, what we&rsquo;d build, and what it costs.</p>
              <p className="pb-sm">{tone.toUpperCase()} · DRAFTED BY ENEAS · REVIEWED BY LUCÍA</p>
            </PbSlide>

            <PbSlide n={N('understanding')} total={total} eyebrow="Understanding" company={lead.company} fresh={aiFresh}>
              <h2>What we heard.</h2>
              <p className="pb-large">{ai?.understanding || brief}</p>
              {visibleInsights.length > 0 && (
                <ul className="pb-insights-deck">
                  {visibleInsights.slice(0, 3).map(i => (
                    <li key={i.id}><small>{i.label || 'Insight'}</small><span>{i.value}</span></li>
                  ))}
                </ul>
              )}
            </PbSlide>

            <PbSlide n={N('approach')} total={total} eyebrow="Approach" company={lead.company} fresh={aiFresh}>
              <h2>How we&rsquo;d run it.</h2>
              <div className="pb-phases">
                {phases.map((p: any, i: number) => (
                  <div key={i} className="pb-phase">
                    <span className="pb-phase-n">PHASE 0{i + 1}</span>
                    <strong>{p.name}</strong>
                    <p>{p.desc}</p>
                  </div>
                ))}
              </div>
            </PbSlide>

            <PbSlide n={N('scope')} total={total} eyebrow="Scope" company={lead.company} fresh={aiFresh}>
              <h2>What we deliver.</h2>
              <ul className="pb-scope">
                {visibleScope.map((s, i) => (
                  <li key={i}><span>0{i + 1}</span>{s}</li>
                ))}
              </ul>
            </PbSlide>

            {selectedCases.length > 0 && (
              <PbSlide n={N('work')} total={total} eyebrow="Selected work" company={lead.company}>
                <h2>Work we&rsquo;ve done.</h2>
                <div className="pb-work-grid">
                  {selectedCases.map(c => (
                    <div key={c.id} className="pb-work-card" style={{ '--c': c.color } as any}>
                      <span className="pb-work-dot"/>
                      <strong>{c.name}</strong>
                      <small>{c.result}</small>
                    </div>
                  ))}
                </div>
              </PbSlide>
            )}

            <PbSlide n={N('timeline')} total={total} eyebrow="Timeline" company={lead.company}>
              <h2>{pkg.weeks} weeks · {startDate} → handoff.</h2>
              <div className="pb-gantt">
                {Array.from({ length: pkg.weeks }).map((_, i) => {
                  const idx = Math.min(2, Math.floor((i / pkg.weeks) * 3))
                  return (
                    <div key={i} className={`pb-gantt-cell phase-${idx}`}>
                      <small>W{i + 1}</small>
                    </div>
                  )
                })}
              </div>
              <div className="pb-gantt-legend">
                {phases.map((p: any, i: number) => (
                  <span key={i} className={`phase-${i}`}><span className="dot"/>{p.name}</span>
                ))}
              </div>
            </PbSlide>

            <PbSlide n={N('investment')} total={total} eyebrow="Investment" company={lead.company} wine>
              {tiers.length === 1 ? (
                (() => {
                  const t = tiers[0]
                  const { mo, oneFinal, discAmt } = tierTotals(t)
                  return (
                    <>
                      <h2>{fmt$(oneFinal)}{mo > 0 && <span style={{ fontSize: '0.4em', fontWeight: 400, color: 'rgba(255,255,255,0.55)', marginLeft: 12 }}>+ {fmt$(mo)}/mo</span>}</h2>
                      <div className="pb-pricing">
                        {t.lines.map((l: any) => (
                          <div key={l.id}>
                            <span>{l.label || '—'}{l.recur ? ' · monthly' : ''}</span>
                            <strong>{fmt$(+l.amount)}{l.recur ? '/mo' : ''}</strong>
                          </div>
                        ))}
                        {t.discount > 0 && (
                          <div><span>Discount on one-time · {t.discount}%</span><strong>−{fmt$(discAmt)}</strong></div>
                        )}
                        <div className="total">
                          <span>Total · net 14</span>
                          <strong>{fmt$(oneFinal)}</strong>
                        </div>
                        {mo > 0 && (
                          <div className="total">
                            <span>Recurring</span>
                            <strong>{fmt$(mo)}/mo</strong>
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()
              ) : (
                <>
                  <h2 style={{ fontSize: 30 }}>Choose your engagement.</h2>
                  <div className="pb-tiers-deck">
                    {tiers.map(t => {
                      const { mo, oneFinal } = tierTotals(t)
                      return (
                        <div key={t.id} className={`pb-tier-col ${t.recommended ? 'rec' : ''}`}>
                          {t.recommended && <span className="pb-tier-rec-badge">Recommended</span>}
                          <div className="pb-tier-col-name">{t.name}</div>
                          <div className="pb-tier-col-price">
                            {fmt$(oneFinal)}
                            {mo > 0 && <small>+ {fmt$(mo)}/mo</small>}
                          </div>
                          <ul>
                            {t.lines.slice(0, 5).map((l: any) => (
                              <li key={l.id}>{l.label || '—'}{l.recur ? ' · /mo' : ''}</li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </PbSlide>

            {(validLinks.length > 0 || notes) && (
              <PbSlide n={N('resources')} total={total} eyebrow="Resources" company={lead.company}>
                <h2>{notes ? 'A note.' : 'Resources.'}</h2>
                {notes && <p className="pb-large">{notes}</p>}
                {validLinks.length > 0 && (
                  <ul className="pb-resources">
                    {validLinks.map(l => (
                      <li key={l.id}>
                        <span className="pb-res-ic">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                        </span>
                        <strong>{l.label || l.url}</strong>
                        <small>{l.url}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </PbSlide>
            )}

            <PbSlide n={N('next')} total={total} eyebrow="Next" company={lead.company} fresh={aiFresh}>
              <h2>Next steps.</h2>
              <ol className="pb-next">
                {nextSteps.map((s: string, i: number) => (
                  <li key={i}><span>0{i + 1}</span>{s}</li>
                ))}
              </ol>
              <div className="pb-foot">
                <span>hola@livv.systems</span>
                <span>livvvv.com · designed by Livv</span>
              </div>
            </PbSlide>
          </div>
        </div>
      </div>
    </div>
  )
}
