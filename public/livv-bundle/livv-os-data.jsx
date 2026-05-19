// LIVV OS — data + icons
const { useState, useEffect, useRef } = React;

const OS_ICON = ({ name, size = 16, stroke = 1.6, style }) => {
  const p = {
    growth:   <><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
    strategy: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
    content:  <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18M8 4v14"/></>,
    scaling:  <><circle cx="9" cy="9" r="3.5"/><circle cx="17" cy="11" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M15 20a4 4 0 0 1 7-1"/></>,
    toolkit:  <><path d="M14.7 6.3a4 4 0 1 0-1 6.4l7 7a2 2 0 0 0 2.8-2.8l-7-7c.5-1.4.4-2.9-.8-4.1z"/><path d="M9 9l-4 4-3-1 4-4z"/></>,
    sales:    <><path d="M4 4h4l3 12h7l3-8H7"/><circle cx="10" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></>,
    dashboard:<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
    metrics:  <><path d="M3 21V3M3 21h18M7 17V9M12 17V5M17 17v-6"/></>,
    phases:   <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h8M8 18h8M6 8v8M18 8v8"/></>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    bell:     <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    plus:     <><path d="M12 5v14M5 12h14"/></>,
    chev:     <><path d="M9 6l6 6-6 6"/></>,
    chevdown: <><path d="M6 9l6 6 6-6"/></>,
    arrow:    <><path d="M7 17L17 7M7 7h10v10"/></>,
    sparkle:  <><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2"/></>,
    bolt:     <><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></>,
    mail:     <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></>,
    chat:     <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-4-1L3 21l1-5a8.4 8.4 0 0 1-1-4 8.4 8.4 0 0 1 17 0z"/></>,
    play:     <><path d="M5 3l14 9-14 9z"/></>,
    phone:    <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.27-1.36a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    user:     <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    link:     <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>,
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    edit:     <><path d="M17 3l4 4-12 12-4 1 1-4z"/></>,
    expand:   <><path d="M21 3v6M21 3h-6M21 3l-7 7M3 21v-6M3 21h6M3 21l7-7"/></>,
    money:    <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 1.5-3 1.5-3 3M12 17v.01"/></>,
    docs:     <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
    tasks:    <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
    target:   <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    palette:  <><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="11.5" r="1"/><path d="M12 22a10 10 0 1 1 0-20c5 0 9 4 9 8 0 3-3 4-5 4h-2a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 1 0 4z"/></>,
    layout:   <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 12h6"/></>,
    spark:    <><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></>,
    cog:      <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    close:    <><path d="M18 6L6 18M6 6l12 12"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {p[name]}
    </svg>
  );
};

// 6 sidebar modules — Agent is the AI command center
const MODULES = [
  { id: 'growth',   icon: 'growth',   label: 'Growth',   badge: 4 },
  { id: 'strategy', icon: 'strategy', label: 'Strategy', badge: 0 },
  { id: 'content',  icon: 'content',  label: 'Content',  badge: 3 },
  { id: 'scaling',  icon: 'scaling',  label: 'Scaling',  badge: 0 },
  { id: 'agent',    icon: 'sparkle',  label: 'Agent',    badge: 2 },
  { id: 'toolkit',  icon: 'toolkit',  label: 'Toolkit',  badge: 0 },
];

const MOD_COLOR = {
  growth: 'var(--accent)',
  strategy: 'var(--sky)',
  content: 'var(--pink)',
  scaling: 'var(--sage)',
  toolkit: 'var(--wine)',
  sales: 'var(--accent)',
};

const TABS = {
  growth:   [{ id: 'pulse', label: 'Pulse', icon: 'dashboard' }, { id: 'sales', label: 'Sales', icon: 'sales', count: 33 }, { id: 'partners', label: 'Partners', icon: 'link', count: 7 }],
  strategy: [{ id: 'icps', label: 'ICPs', icon: 'target', count: 5 }, { id: 'packages', label: 'Packages', icon: 'docs' }, { id: 'products', label: 'Products', icon: 'spark', count: 6 }, { id: 'positioning', label: 'Positioning', icon: 'sparkle' }],
  content:  [{ id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'pipeline', label: 'Pipeline', icon: 'tasks', count: 22 }, { id: 'library', label: 'Library', icon: 'layout' }, { id: 'brands', label: 'Brands', icon: 'palette', count: 4 }, { id: 'studio', label: 'Studio', icon: 'sparkle' }],
  scaling:  [{ id: 'team', label: 'Team', icon: 'user', count: 9 }, { id: 'plan', label: 'Plan', icon: 'calendar' }],
  agent:    [{ id: 'ask', label: 'Ask', icon: 'sparkle' }, { id: 'reports', label: 'Reports', icon: 'docs', count: 12 }, { id: 'workflows', label: 'Workflows', icon: 'bolt', count: 6 }],
  toolkit:  [{ id: 'frameworks', label: 'Frameworks', icon: 'spark' }, { id: 'automations', label: 'Automations', icon: 'bolt' }, { id: 'ai', label: 'AI Config', icon: 'sparkle' }, { id: 'connections', label: 'Connections', icon: 'link', count: 5 }, { id: 'settings', label: 'Settings', icon: 'cog' }],
};

// ── ICPs ────────────────────────────────────────────────────────
const ICPS = {
  consult: { name: 'Consultants', short: 'CON', color: 'var(--sky)', desc: 'Independent strategy operators selling deep expertise to mid-market.' },
  agency:  { name: 'Agencies',    short: 'AGY', color: 'var(--accent)', desc: 'Boutique creative + brand studios scaling past founder-led delivery.' },
  product: { name: 'SaaS Founders', short: 'SAS', color: 'var(--sage)', desc: 'Pre-Series-A founders growing from product-led to assisted GTM.' },
  ecom:    { name: 'E-commerce',  short: 'ECM', color: '#A855F7', desc: 'DTC brands $1M–$10M ARR fixing retention and creative ops.' },
  retainer:{ name: 'Retainer',    short: 'RTN', color: 'var(--pink)', desc: 'Existing clients on multi-quarter retainer relationships.' },
};

const ICP_STATS = {
  consult:  { ticket: '$16K + $3.6K/mo', leads: 11, clients: 4,  status: 'active' },
  agency:   { ticket: '$24K + $5.6K/mo', leads: 14, clients: 6,  status: 'active' },
  product:  { ticket: '$32K + $7.4K/mo', leads: 7,  clients: 2,  status: 'active' },
  ecom:     { ticket: '$24K + $5.2K/mo', leads: 6,  clients: 1,  status: 'testing' },
  retainer: { ticket: '$22K + $8K/mo',   leads: 2,  clients: 8,  status: 'active' },
};

// Pipeline stages — Won/Lost present but smaller
const STAGES = [
  { id: 'new',         label: 'New',             marker: '' },
  { id: 'contacted',   label: 'Contacted',       marker: '' },
  { id: 'call',        label: 'Call Scheduled',  marker: '' },
  { id: 'call-done',   label: 'Call Done',       marker: 'active' },
  { id: 'proposal',    label: 'Proposal Sent',   marker: '' },
  { id: 'won',         label: 'Won',             marker: 'won' },
  { id: 'lost',        label: 'Lost',            marker: 'lost' },
];

// Leads
const LEADS = [
  { id: 1, stage: 'new', company: 'Helios Studio', contact: 'Andrea Pérez', icp: 'agency', source: 'LinkedIn', impl: 18000, mrr: 4200, action: 'Send intro email', when: 'today', age: 1, owner: 'EN' },
  { id: 2, stage: 'new', company: 'Beacon Strategy', contact: 'Marc Cohen', icp: 'consult', source: 'Referral', impl: 12000, mrr: 2800, action: 'Research before outreach', when: '1d', age: 1, owner: 'LU' },
  { id: 3, stage: 'new', company: 'Northwind SaaS', contact: 'Sofia Lin', icp: 'product', source: 'Inbound', impl: 32000, mrr: 7500, action: 'Schedule discovery call', when: '2d', age: 2, owner: 'EN' },
  { id: 4, stage: 'new', company: 'Tide Goods', contact: 'Jakob Werner', icp: 'ecom', source: 'Outbound', impl: 22000, mrr: 4800, action: 'Send cold loom', when: '2d', age: 2, owner: 'EN' },

  { id: 10, stage: 'contacted', company: 'Verdant Hill', contact: 'Diego Faro', icp: 'consult', source: 'LinkedIn', impl: 14000, mrr: 3200, action: 'Follow-up: ROI doc', when: 'today', age: 3, owner: 'EN', hot: true },
  { id: 11, stage: 'contacted', company: 'Calder Brands', contact: 'Mira Schmidt', icp: 'agency', source: 'Referral', impl: 24000, mrr: 5600, action: 'Wait for reply', when: '2d', age: 5, owner: 'LU' },
  { id: 12, stage: 'contacted', company: 'Acorn Labs', contact: 'Pablo Mestre', icp: 'product', source: 'Inbound', impl: 28000, mrr: 6800, action: 'Bump email', when: '1d', age: 4, owner: 'EN' },

  { id: 20, stage: 'call', company: 'Ember Consulting', contact: 'Hugo Vela', icp: 'consult', source: 'Referral', impl: 16000, mrr: 3800, action: 'Discovery — Thu 14:00', when: '2d', age: 6, owner: 'EN', referredBy: { name: 'Marc', code: 'MARC-BCN', color: 'var(--sky)' } },
  { id: 21, stage: 'call', company: 'Lupe Creative', contact: 'Cris Bauer', icp: 'agency', source: 'LinkedIn', impl: 26000, mrr: 6000, action: 'Discovery — Wed 10:30', when: '1d', age: 5, owner: 'LU' },

  { id: 30, stage: 'call-done', company: 'Mulberry Group', contact: 'Camila Ortíz', icp: 'agency', source: 'LinkedIn', impl: 22000, mrr: 5400, action: 'Build proposal v2', when: 'today', age: 2, owner: 'EN', hot: true, selected: true, referredBy: { name: 'Iris', code: 'IRIS-SABLE', color: 'var(--accent)' } },
  { id: 31, stage: 'call-done', company: 'Quill Studio', contact: 'Theo Renard', icp: 'consult', source: 'Referral', impl: 14000, mrr: 3400, action: 'Send recap + next steps', when: 'today', age: 1, owner: 'LU' },
  { id: 32, stage: 'call-done', company: 'Halcyon AI', contact: 'Rune Eriksen', icp: 'product', source: 'Outbound', impl: 36000, mrr: 8400, action: 'Get internal approval', when: '4d', age: 6, owner: 'EN' },

  { id: 40, stage: 'proposal', company: 'Boreal Beauty', contact: 'Anika Roy', icp: 'ecom', source: 'Inbound', impl: 28000, mrr: 6500, action: 'Awaiting feedback', when: '2d', age: 5, owner: 'EN' },
  { id: 41, stage: 'proposal', company: 'Felton & Sons', contact: 'Bram Visser', icp: 'consult', source: 'Referral', impl: 18000, mrr: 4400, action: 'Follow-up call', when: 'today', age: 7, owner: 'LU' },
  { id: 42, stage: 'proposal', company: 'Sable Loft', contact: 'Nora Vasquez', icp: 'agency', source: 'LinkedIn', impl: 32000, mrr: 7800, action: 'Awaiting CFO sign-off', when: '5d', age: 9, owner: 'EN' },

  { id: 60, stage: 'won', company: 'Cremona Capital', contact: 'Olga Bernal', icp: 'consult', source: 'Referral', impl: 28000, mrr: 6800, action: 'Project kickoff Mon', when: 'today', age: 1, owner: 'EN', referredBy: { name: 'Iris', code: 'IRIS-SABLE', color: 'var(--accent)' } },
  { id: 61, stage: 'won', company: 'Sunnyside', contact: 'Mireia Costa', icp: 'agency', source: 'LinkedIn', impl: 34000, mrr: 8200, action: 'Project running', when: '8d', age: 14, owner: 'LU' },

  { id: 70, stage: 'lost', company: 'Iron Path', contact: 'Reid Walsh', icp: 'consult', source: 'Outbound', impl: 12000, mrr: 2800, action: 'Lost — budget', when: '14d', age: 21, owner: 'LU' },
];

// Outreach for Mulberry
const OUTREACH = [
  { kind: 'cold-intro', channel: 'LinkedIn DM', icon: 'chat', cls: 'tl-dm', when: 'Apr 28', msg: 'Hey Camila — saw your team\'s rebrand for Aire Aroma. Sharp work. Quick question: are you running content production in-house or piecing it across freelancers?', reply: null },
  { kind: 'follow-up',  channel: 'Email',      icon: 'mail', cls: 'tl-email', when: 'May 02', msg: 'Following up on my note. We help studios like yours systematize content production — happy to walk you through how Sunnyside did it.', reply: 'Hey — interested. Got a 15min slot Wednesday?' },
  { kind: 'loom',       channel: 'Loom',       icon: 'play', cls: 'tl-loom',  when: 'May 09', msg: 'Recorded a 4-min Loom tailored to Mulberry: walks through how we\'d structure a content engine for an 18-person agency.', reply: null },
  { kind: 'call',       channel: 'Discovery call', icon: 'phone', cls: 'tl-call', when: 'May 17', msg: '45 min discovery — Camila + Eneas + Lucía. Pain: founder bandwidth, no system, missed publishing cadence 6 weeks running. Next: tailored proposal.', reply: 'Camila confirmed proposal expected by Tue May 21.' },
];

// Dashboard data
const KPIS = [
  { lbl: 'MRR Total',          icon: 'money',     v: '$58.4K', target: '$60K target',  delta: { dir: 'up',   n: '+8.2%' }, spark: [3,4,3,5,5,6,6,7] },
  { lbl: 'Retainer clients',   icon: 'user',      v: '14',     target: '/ 18 target',  delta: { dir: 'up',   n: '+2' },    spark: [10,10,11,11,12,12,13,14] },
  { lbl: 'Pipeline value',     icon: 'sales',     v: '$890K',  target: '/ goal $1.2M', delta: { dir: 'up',   n: '+12%' },  spark: [3,4,3,5,6,5,7,9] },
  { lbl: 'Content / week',     icon: 'content',   v: '8 / 12', target: '67% of cadence',delta: { dir: 'flat', n: '±0' },   spark: [6,7,6,7,8,7,8,8] },
];

const THIS_WEEK = [
  { id: 1, title: 'Build Mulberry proposal v2 with 30/60/90 timeline', mod: 'growth', when: 'today', hot: true },
  { id: 2, title: 'Publish case study — Sunnyside content engine', mod: 'content', when: 'Wed' },
  { id: 3, title: 'Follow up on Verdant Hill — ROI doc reply', mod: 'growth', when: 'today', hot: true },
  { id: 4, title: 'Schedule weekly KPI review with Lucía', mod: 'scaling', when: 'Fri' },
  { id: 5, title: 'Approve Q3 hire — Senior Strategist role', mod: 'scaling', when: 'Thu' },
  { id: 6, title: 'Record Loom: Northwind discovery framing', mod: 'growth', when: 'today' },
  { id: 7, title: 'Update positioning framework — outcome-first', mod: 'strategy', when: 'Fri' },
  { id: 8, title: 'Reply Calder Brands — bump email', mod: 'growth', when: 'Tue' },
];

const ACTIVITY = [
  { mod: 'growth',  who: 'Mulberry Group',         what: 'replied to your email — proposal due Tue', when: '08:42', icon: 'mail' },
  { mod: 'content', who: 'Sunnyside case study',   what: 'auto-drafted from project completion',     when: '07:15', icon: 'sparkle' },
  { mod: 'growth',  who: 'Cremona Capital',        what: 'moved to Won — project kickoff Mon',       when: 'yest.',  icon: 'sales' },
  { mod: 'scaling', who: 'Lucía',                  what: 'logged 6 KPIs for this week',              when: 'yest.',  icon: 'user' },
  { mod: 'content', who: 'Lifecycle workflow Loom',what: 'published on LinkedIn · 12K impressions',  when: '2d',     icon: 'play' },
  { mod: 'toolkit', who: 'Automation',             what: 'Won → Project + Invoice ran for Cremona', when: '2d',     icon: 'bolt' },
];

const PHASES = [
  { n: 'Phase 01', name: 'Foundation', range: 'M1–M3', pct: 100, status: 'done' },
  { n: 'Phase 02', name: 'Pipeline',   range: 'M4–M6', pct: 100, status: 'done' },
  { n: 'Phase 03', name: 'Scaling',    range: 'M7–M9', pct: 64,  status: 'active' },
  { n: 'Phase 04', name: 'Authority',  range: 'M10–M12', pct: 0, status: 'pending' },
];

Object.assign(window, {
  OS_ICON, MODULES, MOD_COLOR, TABS, ICPS, ICP_STATS, STAGES, LEADS, OUTREACH,
  KPIS, THIS_WEEK, ACTIVITY, PHASES,
});
