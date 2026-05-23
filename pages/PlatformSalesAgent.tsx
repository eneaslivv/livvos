/**
 * PlatformSalesAgent — Master-mode sales preview + onboarding tool.
 *
 * Three tabs:
 *   1. Catalog   — visual tier cards (Starter/Pro/Enterprise) + add-ons
 *   2. Agent     — live AI sales chat using the commercial system prompt
 *   3. Wizard    — step-by-step activation preview for new customers
 *
 * Only visible to platform admins in Master mode.
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../hooks/useAuth';
import { sendAdvisorChat } from '../lib/ai';
import { errorLogger } from '../lib/errorLogger';

// ── Types ────────────────────────────────────────────────────────────
type Tab = 'catalog' | 'agent' | 'wizard';
type AgentMode = 'sales' | 'quote' | 'activation';

interface ChatMsg {
  role: 'user' | 'agent';
  text: string;
  mode?: AgentMode;
  ts: number;
}

// ── Product catalog data ─────────────────────────────────────────────
const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    tagline: 'Para equipos que arrancan',
    audience: 'Freelancers, startups, equipos de hasta 5 personas',
    color: 'zinc',
    features: [
      { name: 'Dashboard operativo', included: true },
      { name: 'CRM lite (hasta 100 contactos)', included: true },
      { name: 'Facturación e ingresos', included: true },
      { name: 'Proyectos (hasta 20)', included: true },
      { name: 'Team management', included: true },
      { name: 'Calendar integration', included: false },
      { name: 'Client portal', included: false },
      { name: 'AI Assistant', included: false },
      { name: 'Advanced permissions', included: false },
    ],
    limits: { users: 5, projects: 20, storage: '1 GB' },
    support: 'Email — 48h SLA',
    badge: null,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 149,
    tagline: 'Para agencias en crecimiento',
    audience: 'Equipos 5-25 personas, workflows complejos, integraciones',
    color: 'indigo',
    features: [
      { name: 'Todo lo de Starter', included: true },
      { name: 'Calendar + Google Sync', included: true },
      { name: 'Client portal', included: true },
      { name: 'AI Assistant (Aurora)', included: true },
      { name: 'Automatizaciones / workflows', included: true },
      { name: 'Analytics avanzado', included: true },
      { name: 'API + integraciones (Zapier, Make)', included: true },
      { name: 'Document versioning', included: false },
      { name: 'Advanced permissions', included: false },
    ],
    limits: { users: 25, projects: 100, storage: '5 GB' },
    support: 'Chat + email — 24h SLA, onboarding 1:1',
    badge: 'Popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null, // custom
    tagline: 'Para operaciones a escala',
    audience: 'Equipos 30+, multi-country, compliance, custom dev',
    color: 'amber',
    features: [
      { name: 'Todo lo de Professional', included: true },
      { name: 'SSO / SAML', included: true },
      { name: 'Document versioning', included: true },
      { name: 'Advanced permissions', included: true },
      { name: 'SLA con uptime garantizado', included: true },
      { name: 'CSM dedicado', included: true },
      { name: 'Custom development hours', included: true },
      { name: 'Infra dedicada (opcional)', included: true },
    ],
    limits: { users: 'Ilimitado', projects: 500, storage: '50 GB' },
    support: '24/7 — CSM dedicado, hotline',
    badge: 'Custom',
  },
] as const;

const ADDONS = [
  {
    id: 'screen_recorders',
    name: 'Livv Systems',
    subtitle: 'Screen Recorders',
    icon: 'Monitor',
    price: 12,
    unit: '/usuario/mes',
    desc: 'Grabador de pantalla nativo — captura sesiones, soporte, training, QA. Con anotaciones y compartir por link.',
    useCases: ['Soporte al cliente', 'Training interno', 'QA de UX', 'Documentación viva'],
    differentiator: 'Integración nativa con tickets de Livv OS, retención configurable, sin marca de agua.',
  },
  {
    id: 'ai_bots',
    name: 'Livv AI Bots',
    subtitle: 'Bots configurables',
    icon: 'Sparkles',
    price: 29,
    unit: '/bot/mes',
    desc: 'Bots de AI sobre tus datos: atención al cliente, automatización interna, calificación de leads 24/7.',
    useCases: ['Customer Support Bot', 'Sales Qualifier Bot', 'Internal Ops Bot', 'Custom Bot'],
    differentiator: 'Corren sobre los datos de Livv OS, no necesitan integración externa, auditables.',
  },
  {
    id: 'cms',
    name: 'Livv CMS',
    subtitle: 'Contenido conectado',
    icon: 'Globe',
    price: 19,
    unit: '/sitio/mes',
    desc: 'CMS headless integrado con Livv OS. Publicá tu web, blog y catálogo conectados a tu data operativa.',
    useCases: ['Sitio institucional', 'E-commerce', 'Portal de clientes', 'Blog'],
    differentiator: 'El contenido se alimenta de los módulos de Livv OS — sin doble carga.',
  },
];

const WIZARD_STEPS = [
  { num: 1, title: 'Confirmación de plan', desc: 'Resumen del tier + add-ons elegidos + total mensual/anual', icon: 'Check' },
  { num: 2, title: 'Crear workspace', desc: 'Nombre, logo, color principal, zona horaria', icon: 'Layout' },
  { num: 3, title: 'Invitar al equipo', desc: 'Emails de miembros + rol (Admin / Editor / Viewer)', icon: 'Users' },
  { num: 4, title: 'Activar módulos', desc: 'Toggle ON/OFF de los módulos incluidos en el tier', icon: 'Settings' },
  { num: 5, title: 'Configurar add-ons', desc: 'Mini-config por cada add-on comprado', icon: 'Sparkles' },
  { num: 6, title: 'Integraciones', desc: 'Google Calendar, Slack, WhatsApp Business', icon: 'Link' },
  { num: 7, title: 'Tour guiado', desc: 'Mini-tour interactivo de 60 segundos', icon: 'Play' },
  { num: 8, title: 'Bienvenida', desc: 'Confirmación + agenda kick-off call con CSM', icon: 'Heart' },
];

// ── Sales agent system prompt ────────────────────────────────────────
const SALES_SYSTEM_PROMPT = `You are Livv Sales Agent — an expert commercial advisor for the Livv ecosystem.

## YOUR MISSION
1. Understand the prospect's business, team size, and pain points through conversational discovery.
2. Recommend the optimal combination of Livv OS tier + add-ons.
3. Build a clear proposal with pricing, ROI, and next steps.
4. Handle objections with data, not pressure.
5. Close the next concrete step (demo, pilot, contract).

## TONE
Consultive, direct, español rioplatense neutro. Never invent features or prices.

## PRODUCT CATALOG
### Livv OS — Tiers
- STARTER ($49/mo): For teams up to 5. Dashboard, CRM lite, billing, projects (20 max). Email support 48h.
- PROFESSIONAL ($149/mo): For teams 5-25. Everything in Starter + Calendar sync, Client portal, AI Assistant (Aurora), workflows, analytics, API integrations. Chat+email 24h, 1:1 onboarding. MOST POPULAR.
- ENTERPRISE (custom): For teams 30+. Everything in Pro + SSO/SAML, document versioning, advanced permissions, SLA uptime, dedicated CSM, custom dev hours. 24/7 support.

### Add-ons (on top of any tier)
- Livv Systems Screen Recorders: $12/user/mo — native screen capture for support, training, QA
- Livv AI Bots: $29/bot/mo — AI bots over your data (support, sales qualifier, internal ops, custom)
- Livv CMS: $19/site/mo — headless CMS connected to your Livv OS data

## CONVERSATION FLOW
Phase 1 — Discovery (4-6 questions, ONE at a time):
1. What does your business do?
2. How many people on the team?
3. What tools do you use today? What hurts?
4. #1 problem to solve in the next 90 days?
5. Do you have a website / customer support / manual processes to automate?
6. Monthly budget range for tools?

Phase 2 — Diagnosis: summarize what you heard in 2-3 lines. Confirm understanding.
Phase 3 — Recommendation: propose ONE tier + specific add-ons. Justify each piece. Show total monthly and annual (15% discount).
Phase 4 — Handle objections (validate → data → redirect).
Phase 5 — Close with a concrete next step.

## QUOTE FORMAT
When ready to quote, use this format:
PROPUESTA — [Company]
Tier base: [Pro] .................... USD [XXX]/mes
Add-on: [Screen Recorders × 3].... USD [XX]/mes
Add-on: [Bot Sales Qualifier]..... USD [XX]/mes
TOTAL MENSUAL: USD [XXX]
TOTAL ANUAL (15% dto): USD [XXXX]
Onboarding: incluido
Próximo paso: [Demo el [fecha] / Firmar piloto / etc.]

## RULES
- Never invent prices or features
- Never discount without authorization (only: annual 15%, multi-year 20%, NGO/edu 25%)
- Don't sell Enterprise to who doesn't need it
- If you don't know, say so and offer to connect with a human
- Always respond in the same language the user writes (default: español rioplatense)
- Keep responses concise and scannable`;

// ── Animations ───────────────────────────────────────────────────────
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };
const STAGGER_CHILDREN = { animate: { transition: { staggerChildren: 0.06 } } };

// ── Color helpers ────────────────────────────────────────────────────
const tierColors: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  zinc:   { bg: 'bg-zinc-50 dark:bg-zinc-900/50',   border: 'border-zinc-200 dark:border-zinc-700',   badge: 'bg-zinc-100 text-zinc-600',     text: 'text-zinc-900 dark:text-zinc-100' },
  indigo: { bg: 'bg-indigo-50/50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', badge: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-900 dark:text-indigo-100' },
  amber:  { bg: 'bg-amber-50/50 dark:bg-amber-950/30',  border: 'border-amber-200 dark:border-amber-800',  badge: 'bg-amber-100 text-amber-700',  text: 'text-amber-900 dark:text-amber-100' },
};

// ═════════════════════════════════════════════════════════════════════
//  Component
// ═════════════════════════════════════════════════════════════════════
export const PlatformSalesAgent: React.FC = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('catalog');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>('sales');
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Chat ────────────────────────────────────────────────────────
  const handleSend = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || sending) return;
    if (!override) setInput('');
    const userMsg: ChatMsg = { role: 'user', text: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      const history = messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));
      const result = await sendAdvisorChat(SALES_SYSTEM_PROMPT, history, q);
      const reply = (result as any)?.reply || 'No pude generar una respuesta.';
      // Auto-detect mode switches
      let mode: AgentMode = agentMode;
      const lower = reply.toLowerCase();
      if (lower.includes('propuesta') || lower.includes('total mensual')) mode = 'quote';
      if (lower.includes('step 1') || lower.includes('wizard') || lower.includes('activar mi cuenta')) mode = 'activation';
      setAgentMode(mode);
      setMessages(prev => [...prev, { role: 'agent', text: reply, mode, ts: Date.now() }]);
    } catch (e: any) {
      errorLogger.warn('sales agent failed', e);
      setMessages(prev => [...prev, { role: 'agent', text: `Error: ${e?.message || 'unknown'}`, ts: Date.now() }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  }, [input, sending, messages, agentMode]);

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Quote calculator ───────────────────────────────────────────
  const quote = useMemo(() => {
    const tier = TIERS.find(t => t.id === selectedTier);
    const basePrice = tier?.price ?? 0;
    const addonTotal = ADDONS.filter(a => selectedAddons.has(a.id)).reduce((s, a) => s + a.price, 0);
    const monthly = basePrice + addonTotal;
    const annual = Math.round(monthly * 12 * 0.85);
    return { tierName: tier?.name || '—', monthly, annual };
  }, [selectedTier, selectedAddons]);

  // ── Tab content ────────────────────────────────────────────────
  const tabItems = [
    { id: 'catalog' as const, label: 'Catálogo', icon: Icons.Grid },
    { id: 'agent' as const,   label: 'Sales Agent', icon: Icons.Sparkles },
    { id: 'wizard' as const,  label: 'Wizard Preview', icon: Icons.Settings },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Icons.Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Sales Agent</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Herramienta de venta y onboarding para nuevos clientes de Livv OS</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
          {tabItems.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${tab === t.id
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <AnimatePresence mode="wait">
          {/* ═══ CATALOG TAB ═══ */}
          {tab === 'catalog' && (
            <motion.div
              key="catalog"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              className="p-6 space-y-8"
            >
              {/* Tiers */}
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Livv OS — Tiers</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">El sistema operativo digital para agencias y PyMEs</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {TIERS.map((tier, i) => {
                    const c = tierColors[tier.color];
                    const isSelected = selectedTier === tier.id;
                    return (
                      <motion.div
                        key={tier.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: i * 0.08 }}
                        onClick={() => setSelectedTier(isSelected ? null : tier.id)}
                        className={`relative rounded-2xl border-2 p-5 cursor-pointer transition-all
                          ${c.bg} ${isSelected ? 'border-indigo-500 dark:border-indigo-400 shadow-lg ring-2 ring-indigo-200 dark:ring-indigo-800' : c.border}
                          hover:shadow-md`}
                      >
                        {tier.badge && (
                          <span className={`absolute -top-2.5 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${c.badge}`}>
                            {tier.badge}
                          </span>
                        )}
                        <div className="mb-3">
                          <h3 className={`text-base font-bold ${c.text}`}>{tier.name}</h3>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{tier.tagline}</p>
                        </div>
                        <div className="mb-4">
                          {tier.price ? (
                            <div className="flex items-baseline gap-1">
                              <span className={`text-3xl font-black tracking-tight ${c.text}`}>${tier.price}</span>
                              <span className="text-xs text-zinc-400">/mes</span>
                            </div>
                          ) : (
                            <span className={`text-lg font-bold ${c.text}`}>Cotización custom</span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">{tier.audience}</p>
                        <div className="space-y-1.5 mb-4">
                          {tier.features.map(f => (
                            <div key={f.name} className="flex items-center gap-2 text-xs">
                              {f.included ? (
                                <Icons.Check size={12} className="text-emerald-500 flex-shrink-0" />
                              ) : (
                                <Icons.X size={12} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
                              )}
                              <span className={f.included ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600'}>{f.name}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-3 border-t border-zinc-200/60 dark:border-zinc-700/60 space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
                            <span>Usuarios</span>
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">{tier.limits.users}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
                            <span>Proyectos</span>
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">{tier.limits.projects}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
                            <span>Storage</span>
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">{tier.limits.storage}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
                            <span>Soporte</span>
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">{tier.support}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
                          >
                            <Icons.Check size={12} className="text-white" />
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Add-ons */}
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Add-ons</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Activables por separado, sobre cualquier tier</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {ADDONS.map((addon, i) => {
                    const IconCmp = (Icons as any)[addon.icon] || Icons.Sparkles;
                    const isOn = selectedAddons.has(addon.id);
                    return (
                      <motion.div
                        key={addon.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING, delay: 0.3 + i * 0.08 }}
                        onClick={() => toggleAddon(addon.id)}
                        className={`rounded-2xl border-2 p-5 cursor-pointer transition-all
                          ${isOn
                            ? 'border-violet-500 dark:border-violet-400 bg-violet-50/50 dark:bg-violet-950/20 shadow-md ring-2 ring-violet-200 dark:ring-violet-800'
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 hover:shadow-sm'}`}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isOn ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                            <IconCmp size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{addon.name}</h3>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{addon.subtitle}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                            ${isOn ? 'border-violet-500 bg-violet-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                            {isOn && <Icons.Check size={10} className="text-white" />}
                          </div>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">{addon.desc}</p>
                        <div className="flex items-baseline gap-1 mb-3">
                          <span className="text-xl font-black text-zinc-900 dark:text-zinc-100">${addon.price}</span>
                          <span className="text-[10px] text-zinc-400">{addon.unit}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {addon.useCases.map(uc => (
                            <span key={uc} className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[9px] text-zinc-500 dark:text-zinc-400">{uc}</span>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Live quote calculator */}
              {selectedTier && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={SPRING}
                  className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/20 p-6"
                >
                  <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-4 flex items-center gap-2">
                    <Icons.FileText size={14} />
                    Cotización en vivo
                  </h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">Tier base: {quote.tierName}</span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {TIERS.find(t => t.id === selectedTier)?.price ? `$${TIERS.find(t => t.id === selectedTier)?.price}/mes` : 'Custom'}
                      </span>
                    </div>
                    {ADDONS.filter(a => selectedAddons.has(a.id)).map(a => (
                      <div key={a.id} className="flex justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">{a.name}</span>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">${a.price}{a.unit}</span>
                      </div>
                    ))}
                    <div className="pt-3 mt-2 border-t border-indigo-200 dark:border-indigo-800">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-indigo-900 dark:text-indigo-100">Total mensual</span>
                        <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">${quote.monthly}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-zinc-500">Total anual (15% dto)</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">${quote.annual}/año</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTab('agent'); handleSend(`Quiero activar el plan ${quote.tierName} con ${selectedAddons.size > 0 ? Array.from(selectedAddons).join(' + ') : 'sin add-ons'}. Armame la propuesta.`); }}
                      className="flex-1 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all"
                    >
                      Generar propuesta con el agente
                    </button>
                    <button
                      onClick={() => { setSelectedTier(null); setSelectedAddons(new Set()); }}
                      className="py-2 px-3 rounded-xl bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-all"
                    >
                      Limpiar
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ═══ AGENT TAB ═══ */}
          {tab === 'agent' && (
            <motion.div
              key="agent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              className="flex flex-col h-full"
            >
              {/* Mode indicator */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  agentMode === 'sales' ? 'bg-emerald-500' : agentMode === 'quote' ? 'bg-indigo-500' : 'bg-amber-500'
                }`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Mode: {agentMode}
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => { setMessages([]); setAgentMode('sales'); }}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  Reset chat
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" ref={scrollRef}>
                {messages.length === 0 && (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                      <Icons.Sparkles size={24} className="text-white" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Livv Sales Agent</p>
                    <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-6">
                      Simulá una conversación de venta. El agente descubre necesidades, recomienda tier + add-ons, y genera la propuesta.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        'Tengo una agencia de marketing de 8 personas',
                        'Soy freelancer y quiero ordenarme',
                        'Empresa de 40 personas, necesitamos compliance',
                        'Quiero automatizar mi soporte al cliente',
                      ].map(q => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: 0.02 }}
                    className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {m.role === 'agent' && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icons.Sparkles size={13} className="text-white" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                      ${m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-md'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-md'}`}
                    >
                      {m.text}
                    </div>
                  </motion.div>
                ))}
                {sending && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Icons.Sparkles size={13} className="text-white" />
                    </div>
                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Composer */}
              <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                    placeholder={sending ? 'Pensando...' : 'Simulá ser un prospecto...'}
                    disabled={sending}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={sending || !input.trim()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <Icons.Send size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ WIZARD TAB ═══ */}
          {tab === 'wizard' && (
            <motion.div
              key="wizard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
              className="p-6 space-y-6"
            >
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Activation Wizard</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
                  Preview de los 8 pasos del onboarding. Así ve el cliente nuevo cuando activa su plan.
                </p>

                {/* Progress bar */}
                <div className="flex items-center gap-1 mb-8">
                  {WIZARD_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-1.5 rounded-full transition-all cursor-pointer ${
                        i <= wizardStep ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                      onClick={() => setWizardStep(i)}
                    />
                  ))}
                </div>

                {/* Current step */}
                <AnimatePresence mode="wait">
                  {(() => {
                    const step = WIZARD_STEPS[wizardStep];
                    const IconCmp = (Icons as any)[step.icon] || Icons.Check;
                    return (
                      <motion.div
                        key={wizardStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={SPRING}
                        className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center"
                      >
                        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                          <IconCmp size={24} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-2">
                          Step {step.num} de 8
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">{step.title}</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mb-6">{step.desc}</p>

                        {/* Step-specific preview content */}
                        {wizardStep === 0 && selectedTier && (
                          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 text-left text-sm mb-6 max-w-sm mx-auto">
                            <div className="flex justify-between mb-2">
                              <span className="text-zinc-500">Plan</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">{quote.tierName}</span>
                            </div>
                            {selectedAddons.size > 0 && ADDONS.filter(a => selectedAddons.has(a.id)).map(a => (
                              <div key={a.id} className="flex justify-between mb-1">
                                <span className="text-zinc-500 text-xs">{a.name}</span>
                                <span className="text-xs text-zinc-600 dark:text-zinc-400">${a.price}{a.unit}</span>
                              </div>
                            ))}
                            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2 flex justify-between">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Total</span>
                              <span className="font-black text-indigo-600">${quote.monthly}/mes</span>
                            </div>
                          </div>
                        )}

                        {wizardStep === 2 && (
                          <div className="max-w-sm mx-auto space-y-2 mb-6">
                            {['admin@company.com', 'editor@company.com', 'viewer@company.com'].map((email, j) => (
                              <div key={j} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-xs">
                                <Icons.Mail size={12} className="text-zinc-400" />
                                <span className="flex-1 text-zinc-600 dark:text-zinc-400">{email}</span>
                                <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-[9px] font-medium text-zinc-500">
                                  {['Admin', 'Editor', 'Viewer'][j]}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {wizardStep === 3 && (
                          <div className="max-w-sm mx-auto space-y-2 mb-6">
                            {['Dashboard operativo', 'CRM', 'Facturación', 'Proyectos', 'AI Assistant'].map((mod, j) => (
                              <div key={j} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-xs">
                                <span className="text-zinc-700 dark:text-zinc-300">{mod}</span>
                                <div className={`w-8 h-4 rounded-full ${j < 4 ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-600'} relative`}>
                                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 ${j < 4 ? 'right-0.5' : 'left-0.5'} transition-all`} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-3 justify-center">
                          <button
                            onClick={() => setWizardStep(Math.max(0, wizardStep - 1))}
                            disabled={wizardStep === 0}
                            className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-30 transition-all"
                          >
                            Anterior
                          </button>
                          <button
                            onClick={() => setWizardStep(Math.min(WIZARD_STEPS.length - 1, wizardStep + 1))}
                            disabled={wizardStep === WIZARD_STEPS.length - 1}
                            className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-30 transition-all"
                          >
                            {wizardStep === WIZARD_STEPS.length - 1 ? 'Empezar a usar Livv' : 'Siguiente'}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>

                {/* Steps overview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                  {WIZARD_STEPS.map((step, i) => {
                    const IconCmp = (Icons as any)[step.icon] || Icons.Check;
                    return (
                      <button
                        key={i}
                        onClick={() => setWizardStep(i)}
                        className={`p-3 rounded-xl border text-left transition-all
                          ${i === wizardStep
                            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20'
                            : i < wizardStep
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10'
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold
                            ${i === wizardStep ? 'bg-indigo-500 text-white' : i < wizardStep ? 'bg-emerald-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'}`}>
                            {i < wizardStep ? <Icons.Check size={10} /> : step.num}
                          </div>
                          <IconCmp size={11} className={i === wizardStep ? 'text-indigo-500' : 'text-zinc-400'} />
                        </div>
                        <p className={`text-[11px] font-medium ${i === wizardStep ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-400'}`}>{step.title}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
