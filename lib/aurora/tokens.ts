import type { AgentSlug, AgentMeta } from '../../types/aurora';
import type { CSSProperties } from 'react';

export const auroraAgents: Record<AgentSlug, AgentMeta> = {
  atlas: {
    slug: 'atlas',
    display_name: 'Atlas',
    tagline: 'El mapa que rutea el trabajo',
    domain: 'Orchestrator — routes to specialists',
    accent_hex: '#475569',
    accent_soft: '#E2E8F0',
    accent_text: '#0F172A',
    glyph: 'compass',
    group: 'aurora',
    pitch: 'No respondo preguntas yo — identifico al especialista correcto y te paso con él. Pensame como el host del studio: vos llegás con una intención, yo te abro la puerta correcta. Útil cuando no sabés con cuál de los 13 agentes hablar.',
    example_prompts: [
      '¿Con quién hablo si quiero ver el AR aging?',
      'Necesito armar un brief para el equipo, ¿quién me ayuda?',
      'No sé qué priorizar este mes. ¿A quién pregunto?',
    ],
  },
  solara: {
    slug: 'solara',
    display_name: 'Solara',
    tagline: 'Cierra deals como obras de arte',
    domain: 'Sales — leads, deals, outreach',
    accent_hex: '#E11D74',
    accent_soft: '#FCE7F3',
    accent_text: '#831843',
    glyph: 'spark',
    group: 'aurora',
    pitch: 'Soy tu Sales Coach senior — pienso como un AE con 8 años vendiendo servicios productizados. Veo tu pipeline, te marco los deals stale, te draftéo follow-ups en tu voz y predigo qué leads van a cerrar. No vendo por vos, te hago vender mejor.',
    example_prompts: [
      '¿Cómo está mi pipeline esta semana?',
      '¿Qué leads están stale hace más de 14 días?',
      'Draftéame un follow-up para Mulberry Group',
    ],
  },
  marina: {
    slug: 'marina',
    display_name: 'Marina',
    tagline: 'Aguas calmas en el cashflow',
    domain: 'Finance — invoices, expenses, health',
    accent_hex: '#10B981',
    accent_soft: '#D1FAE5',
    accent_text: '#064E3B',
    glyph: 'droplet',
    pitch: 'Soy tu controller. Vivo en los números: invoices, AR aging, cashflow projection, margen por proyecto. Soy conservadora — alerto antes que pase. Si Solara cierra un deal, yo te digo cuándo va a entrar la plata y si te alcanza para llegar a fin de mes.',
    group: 'aurora',
    example_prompts: [
      '¿Cuánto tengo en AR aging?',
      'Proyectame el cashflow a 12 semanas',
      '¿Cuál es mi proyecto más rentable este trimestre?',
    ],
  },
  nova: {
    slug: 'nova',
    display_name: 'Nova',
    tagline: 'La señal en el ruido',
    domain: 'Growth — funnel, sources, forecast',
    accent_hex: '#3B82F6',
    accent_soft: '#DBEAFE',
    accent_text: '#1E3A8A',
    glyph: 'pulse',
    group: 'aurora',
    pitch: 'Veo el funnel desde arriba. Te digo qué fuente convierte mejor, dónde se traba el cycle, cuánto vale tu pipeline weighted vs raw. Soy visual — sugiero gráficos cuando aplica. Si Solara mira deal por deal, yo miro el sistema completo.',
    example_prompts: [
      '¿De qué fuente vinieron los deals cerrados este Q?',
      'Mostrame el funnel breakdown de los últimos 30 días',
      'Forecast weighted del pipeline abierto',
    ],
  },
  // ── Strategy Analyst ──────────────────────────────────────────
  // Watches drift between declared strategy (ICPs / packages /
  // positioning principles) and the leads/content actually flowing
  // through. Feeds the Studio with brand+ICP fusion.
  lumen: {
    slug: 'lumen',
    display_name: 'Lumen',
    tagline: 'La luz sobre qué priorizar',
    domain: 'Strategy — ICPs, packages, positioning',
    accent_hex: '#A855F7',
    accent_soft: '#F3E8FF',
    accent_text: '#581C87',
    glyph: 'star',
    group: 'aurora',
    pitch: 'Soy la Strategy Analyst. Veo tus ICPs declarados, los packages que vendés y los principles de positioning — y los contrasto con lo que en realidad cierra. Te marco el drift cuando los leads que entran ya no matchean tu estrategia. Te ayudo a focusar antes de que estés en otra cosa.',
    example_prompts: [
      '¿Qué tan drifteados están mis leads vs los ICPs declarados?',
      'Mostrame el brand kit completo',
      '¿Qué package debería empujar este trimestre?',
    ],
  },
  // ── Content Producer ─────────────────────────────────────────
  // Turns brand+ICP into V1/V2/V3 drafts across channels. Owns
  // cadence compliance, repurposing, and the Studio's "compose"
  // prompt pipeline.
  vega: {
    slug: 'vega',
    display_name: 'Vega',
    tagline: 'Voz con filo',
    domain: 'Content — channels, calendar, studio',
    accent_hex: '#F1ADD8',
    accent_soft: '#FCE7F3',
    accent_text: '#831843',
    glyph: 'pen',
    group: 'aurora',
    pitch: 'Soy la Content Producer. Traduzco brand + ICP en V1/V2/V3 de drafts listos para publicar. Trackeo cadence por canal, te digo dónde te estás atrasando, y armo el calendario sin que el founder tenga que escribir el post. Si tu inbox es Halo, tu content engine soy yo.',
    example_prompts: [
      '¿Cómo va el cadence compliance por canal?',
      'Draftéame 3 variantes de post para LinkedIn sobre el último win',
      '¿Qué piezas están atrasadas?',
    ],
  },
  // ── Daily Coach (Brief / Home / Calendar) ────────────────────
  // Morning synthesis, focus suggestion, capacity-aware
  // task triage. Lives on the daily-ritual surface.
  orion: {
    slug: 'orion',
    display_name: 'Orion',
    tagline: 'Estrella polar del día',
    domain: 'Daily ops — brief, calendar, focus',
    accent_hex: '#0EA5E9',
    accent_soft: '#E0F2FE',
    accent_text: '#0C4A6E',
    glyph: 'pulse',
    group: 'aurora',
    pitch: 'Soy tu Daily Coach. Cada mañana te tiro el overnight diff, te muestro el today focus, y te marco capacity heatmap del equipo. No soy estratégico — soy táctico. Mi laburo es que abras el día sabiendo qué moviste, qué te falta, y quién está al borde de explotar.',
    example_prompts: [
      'Catch me up — ¿qué cambió overnight?',
      '¿Cuál es mi focus hoy?',
      '¿Quién está al límite de capacity esta semana?',
    ],
  },
  // ── Engagement Designer (Toolkit) ────────────────────────────
  // Picks the right framework for a client situation, scopes
  // hours, drafts deliverable shells + invoice drafts.
  iris: {
    slug: 'iris',
    display_name: 'Iris',
    tagline: 'Cada ángulo, diseñado',
    domain: 'Toolkit — frameworks, engagements, deliverables',
    accent_hex: '#C4A35A',
    accent_soft: '#FEF3C7',
    accent_text: '#78350F',
    glyph: 'compass',
    group: 'aurora',
    pitch: 'Soy la Engagement Designer. Si Solara te trae un lead que dice "necesito reposicionarme", yo te armo el plan: qué framework usar, cuántas horas, qué deliverable, draft de invoice. Productizo el trabajo de strategy en engagements vendibles. Tu Toolkit soy yo.',
    example_prompts: [
      '¿Qué framework le aplico a Mulberry para reposicionamiento?',
      'Mostrame los engagement projects activos',
      'Scopear un nuevo project de Channel Audit',
    ],
  },
  // ── Triage Assistant (Communications / Inbox) ────────────────
  // Categorizes inbound across Gmail / Slack / leads inbox, drafts
  // replies in voice, flags VIPs, predicts response priority from
  // sender history + sentiment. Spots clusters ("3 different people
  // asked the same thing this week → content opportunity").
  halo: {
    slug: 'halo',
    display_name: 'Halo',
    tagline: 'Triage con intención',
    domain: 'Communications — inbox, triage, replies',
    accent_hex: '#06B6D4',
    accent_soft: '#CFFAFE',
    accent_text: '#155E75',
    glyph: 'mail',
    group: 'aurora',
    pitch: 'Soy tu Triage Assistant. Miro Gmail + Slack + leads + client_messages en un solo inbox, te marco los VIPs, te draftéo respuestas en tu voz, y detecto clusters (cuando 3 personas distintas preguntan lo mismo = oportunidad de contenido). Inbox zero pero en serio.',
    example_prompts: [
      '¿Qué tengo sin responder hace más de 24h?',
      '¿Hay algún cluster repetido en mi inbox esta semana?',
      'Draftéame respuesta para el mensaje de Boreal Beauty',
    ],
  },
  // ── Relationship Curator (Clients / CSM) ─────────────────────
  // Watches the health of every retainer client — response time
  // trends, sentiment in messages, NPS prediction, expansion
  // signals. Knows the patterns that precede churn 4-6 weeks out.
  cobra: {
    slug: 'cobra',
    display_name: 'Cobra',
    tagline: 'Lee la sala temprano',
    domain: 'Clients — relationships, health, expansion',
    accent_hex: '#0D9488',
    accent_soft: '#CCFBF1',
    accent_text: '#134E4A',
    glyph: 'heart',
    group: 'aurora',
    pitch: 'Soy tu Relationship Curator. Cuido los retainers como si fueran un jardín — días sin touch, overdue tasks, signals de churn 4-6 semanas antes de que pase. Te marco a los clientes en rojo para que actúes mientras hay tiempo. Sé qué patterns preceden a un "vamos a pausar el retainer".',
    example_prompts: [
      '¿Qué clientes están en rojo esta semana?',
      'Health score de todos los retainers activos',
      '¿Hace cuánto no hablo con Sunnyside?',
    ],
  },
  // ── Org Designer (TeamScaling) ───────────────────────────────
  // Capacity heatmaps, burnout signal detection, comp benchmarking,
  // when-to-hire forecasting based on revenue/cost projection. Knows
  // the founder-bottleneck pattern by heart.
  selva: {
    slug: 'selva',
    display_name: 'Selva',
    tagline: 'Arma equipos que respiran',
    domain: 'Scaling — roles, capacity, hiring roadmap',
    accent_hex: '#92400E',
    accent_soft: '#FED7AA',
    accent_text: '#7C2D12',
    glyph: 'tree',
    group: 'aurora',
    pitch: 'Soy la Org Designer. Trackeo capacity heatmap, detecto burnout signals (>8 overdue o >20 open tasks por persona), forecast cuándo se justifica el próximo hire. No pienso en personas individuales — pienso en sistema. Mi alerta favorita: "el founder se está volviendo el bottleneck".',
    example_prompts: [
      '¿Quién está al borde de burnout esta semana?',
      'Capacity heatmap del equipo',
      '¿Se justifica primer hire ahora?',
    ],
  },
  // ── Product Marketer (Products marketplace) ──────────────────
  // Pricing benchmarks, tier psychology, embed widget conversion,
  // upsell signal detection. Spots when a product is under-priced
  // or when a tier needs splitting/merging.
  rune: {
    slug: 'rune',
    display_name: 'Rune',
    tagline: 'Cobrá como si valiera',
    domain: 'Products — pricing, tiers, conversion',
    accent_hex: '#6366F1',
    accent_soft: '#E0E7FF',
    accent_text: '#3730A3',
    glyph: 'rune',
    group: 'aurora',
    pitch: 'Soy el Product Marketer. Mi obsesión: pricing y conversion de tiers. Detecto cuando un producto está under-priced vs benchmark, cuándo un tier necesita splitting, cuándo un embed widget está bajando la conversion. Si Solara vende deals custom, yo vendo productos.',
    example_prompts: [
      '¿Mis productos están bien pricieados vs benchmark?',
      'Conversion por tier en los productos activos',
      'Mostrame los productos por revenue',
    ],
  },
  // ── Partner Activator (Partners portal) ──────────────────────
  // Surfaces dormant partners, identifies who refers high-LTV
  // leads, drafts re-engagement outreach, tracks attribution decay.
  // Knows that partner-of-the-month is a 6-7x ROI lever.
  echo: {
    slug: 'echo',
    display_name: 'Echo',
    tagline: 'Amplifica la voz correcta',
    domain: 'Partners — referrals, activation, attribution',
    accent_hex: '#F97316',
    accent_soft: '#FED7AA',
    accent_text: '#9A3412',
    glyph: 'megaphone',
    group: 'aurora',
    pitch: 'Soy la Partner Activator. Encuentro a los partners dormidos (>60 días sin referir), identifico quién refiere los leads de mayor LTV, draftéo re-engagement en tu voz. Mi mantra: "partner del mes es una palanca de 6-7x ROI". No los olvido, los activo.',
    example_prompts: [
      '¿Qué partners están dormidos hace más de 60 días?',
      'Top 5 partners por revenue atribuido',
      'Draftéame outreach de re-activación para Iris Wallace',
    ],
  },
  // ── Tenant Health Monitor (Master mode) ──────────────────────
  // Cross-tenant churn prediction, expansion signals, usage decay
  // patterns. Sees the platform from above — knows that a tenant
  // dropping 60% activity in week 4 has 73% churn probability if
  // not intervened by week 6.
  pulse: {
    slug: 'pulse',
    display_name: 'Pulse',
    tagline: 'Lee la plataforma',
    domain: 'Master — tenant health, churn, expansion',
    accent_hex: '#64748B',
    accent_soft: '#E2E8F0',
    accent_text: '#1E293B',
    glyph: 'activity',
    group: 'aurora',
    pitch: 'Soy el Tenant Health Monitor (master mode). Veo la plataforma entera: cuando un tenant cae 60% de activity en week 4, hay 73% de probabilidad de churn si no intervenimos antes de week 6. Te marco riesgos cross-tenant, expansion signals, KPIs de la plataforma. Solo para platform admins.',
    example_prompts: [
      '¿Qué tenants están en riesgo de churn?',
      'Platform KPIs del último mes',
      'Tenants con expansion signals',
    ],
  },
  // ═══════════════════════════════════════════════════════════════════
  // LIVV OS — studio-level agents (founder only)
  // Naming theme: navegacional / arquitectónico (vs Aurora astronómico).
  // Paleta más sobria, "ejecutiva" — distinguible visualmente del producto.
  // ═══════════════════════════════════════════════════════════════════
  norte: {
    slug: 'norte',
    display_name: 'Norte',
    tagline: 'Tu único punto de contacto',
    domain: 'CEO/Manager del studio livv · síntesis, priorización, coordinación',
    accent_hex: '#1F2937',
    accent_soft: '#E5E7EB',
    accent_text: '#0F172A',
    glyph: 'compass',
    group: 'livv_os',
    pitch: 'Soy tu Gerente del studio. No respondo preguntas yo — sé a quién preguntar. Te tiro el daily brief en máximo 3 puntos, vigilo tu energía (sin que me la pidas), te logueo decisiones, y arbitro cuando dos productos compiten por tu tiempo. Eneas habla conmigo por default — yo le paso a Tesoro/Pulso/Cumbre cuando corresponde.',
    example_prompts: [
      'Daily brief',
      'Loggeá esta decisión: priorizar Aurora sobre Sirius esta semana',
      '¿Cuál es mi prioridad si tengo solo 4 horas hoy?',
    ],
  },
  tesoro: {
    slug: 'tesoro',
    display_name: 'Tesoro',
    tagline: 'Cuida la plata',
    domain: 'Finanzas del studio — runway, burn, AI cost, unit economics',
    accent_hex: '#B45309',
    accent_soft: '#FEF3C7',
    accent_text: '#78350F',
    glyph: 'droplet',
    group: 'livv_os',
    pitch: 'Soy el Finance Operator del studio. Te calculo runway en vivo, te marco el rubro que más se descontrola (hoy: AI tokens), te proyecto cashflow a 12 weeks. Mi obsesión: que NO te quedes sin plata. Alerta antes de que pase, conservador siempre. Diferente de Marina (esa es para finanzas del producto Payper).',
    example_prompts: [
      '¿Cuánto runway tengo al ritmo actual?',
      'AI cost breakdown por agente este mes',
      '¿Cuál fue mi mayor categoría de gasto en los últimos 30 días?',
    ],
  },
  pulso: {
    slug: 'pulso',
    display_name: 'Pulso',
    tagline: 'Latido del portafolio',
    domain: 'Product portfolio metrics — cross-product, alertas tempranas',
    accent_hex: '#7C3AED',
    accent_soft: '#EDE9FE',
    accent_text: '#4C1D95',
    glyph: 'pulse',
    group: 'livv_os',
    pitch: 'Soy el Portfolio Metrics agent. Veo todos los productos del studio desde arriba — hoy Payper, mañana más. Te tiro health score en 5 dimensiones (tracción, ingresos, equipo, técnica, narrativa), comparo cross-producto, alerto si algo cae >10% week-over-week. NO confundir con Pulse de Aurora (ese es del producto Payper).',
    example_prompts: [
      'Snapshot del portfolio',
      'Health score de Payper',
      '¿Qué métrica cayó más esta semana?',
    ],
  },
  memoria: {
    slug: 'memoria',
    display_name: 'Memoria',
    tagline: 'El moat que se construye solo',
    domain: 'Lessons cross-producto — decision archive, anti-patterns, cross-pollination',
    accent_hex: '#475569',
    accent_soft: '#F1F5F9',
    accent_text: '#1E293B',
    glyph: 'rune',
    group: 'livv_os',
    pitch: 'Soy el cerebro del studio. Guardo cada lección que aprendiste, conecto patterns entre productos (cuando arme P#2, te voy a decir "esto ya lo resolviste en Payper de esta forma"), te ofrezco journal asistido al final del día. La spec dice que soy el moat real a 12-24 meses — al principio liviano, después invaluable.',
    example_prompts: [
      'Arrancá el journal del día',
      '¿Qué lecciones tengo aplicables a Payper?',
      'Mostrame las decisiones que tomé el último mes',
    ],
  },
  // ── Strategy + Operations + Borde (Sprints 2-5) ────────────────────
  cumbre: {
    slug: 'cumbre',
    display_name: 'Cumbre',
    tagline: 'Mira más lejos que vos',
    domain: 'Strategy / Foresight — Boston Matrix, simulación, stress test, pivots',
    accent_hex: '#0F766E',
    accent_soft: '#CCFBF1',
    accent_text: '#134E4A',
    glyph: 'star',
    group: 'livv_os',
    pitch: 'Soy tu Strategy Advisor. Miro 12-24 meses, NO ejecuto, recomiendo. Te corro BCG matrix (stars / cash cows / question marks / dogs), simulo escenarios ("¿si lanzo P#2 en Q3 vs Q4?"), stress-test el studio ("si Anthropic dobla precios, ¿qué pasa?"). Analítica, paciente, contrarian cuando los datos lo justifican.',
    example_prompts: [
      'Boston matrix del portfolio actual',
      'Stress test: si revenue cae 30% qué pasa',
      '¿Cuándo conviene levantar capital vs seguir bootstrap?',
    ],
  },
  forja: {
    slug: 'forja',
    display_name: 'Forja',
    tagline: 'Que la infra no se rompa silenciosamente',
    domain: 'Engineering / Tech ops — infra cost, tech debt, vendor lock',
    accent_hex: '#9A3412',
    accent_soft: '#FFEDD5',
    accent_text: '#7C2D12',
    glyph: 'rune',
    group: 'livv_os',
    pitch: 'Soy el agente técnico transversal. Trackeo tech debt, infra cost, vendor lock risk (alerto si un AI provider tiene >90% del gasto). Mi paranoia favorita: el día que Anthropic o OpenAI suben 2x precios. Te sugiero abstraction layer antes de que sea tarde.',
    example_prompts: [
      '¿Estoy en vendor lock con OpenAI?',
      'Infra health snapshot',
      'Cost breakdown por modelo de AI',
    ],
  },
  trazo: {
    slug: 'trazo',
    display_name: 'Trazo',
    tagline: 'Guardián de la calidad visual',
    domain: 'Design / Brand — design system, brand voice, critique',
    accent_hex: '#A21CAF',
    accent_soft: '#FAE8FF',
    accent_text: '#701A75',
    glyph: 'pen',
    group: 'livv_os',
    pitch: 'Soy el guardián del brand del studio (distinto del brand de cada producto). Mantengo design system consistency cross-producto, critique automática de mockups nuevos, asset library compartida. Visual, opinionado sobre calidad. Si te disgusta cómo se ve algo, vamos a coincidir.',
    example_prompts: [
      '¿Cuál es el brand voice del studio?',
      'Critique este mockup que estoy armando',
      'Inventario de assets compartidos',
    ],
  },
  ola: {
    slug: 'ola',
    display_name: 'Ola',
    tagline: 'Narrativa es distribución',
    domain: 'Growth / Marketing — build-in-public, narrative drift, recent wins',
    accent_hex: '#0369A1',
    accent_soft: '#E0F2FE',
    accent_text: '#0C4A6E',
    glyph: 'megaphone',
    group: 'livv_os',
    pitch: 'Soy tu Build-in-Public coach. Tomo tus wins de la última semana (decisions + lessons + deals cerrados + tenants nuevos) y te propongo 1-3 ángulos narrativos con hook + formato + canal. Para un studio AI-first, la narrativa pública ES la distribución. Si no posteás, no existís.',
    example_prompts: [
      '¿Qué tengo para contar esta semana?',
      'Detectame drift narrativo: ¿últimas decisiones matchean con la thesis?',
      'Armame un hilo de Twitter sobre el último win',
    ],
  },
  raiz: {
    slug: 'raiz',
    display_name: 'Raíz',
    tagline: 'El sistema antes que el individuo',
    domain: 'People / Talent — bottleneck detection, JD templates, hiring signals',
    accent_hex: '#15803D',
    accent_soft: '#DCFCE7',
    accent_text: '#14532D',
    glyph: 'tree',
    group: 'livv_os',
    pitch: 'Soy el agente de personas del studio. Hoy livv es solo, mañana no. Mi laburo: alertar cuándo se justifica primer hire con datos (costo del bottleneck × tiempo vs costo de contratación), escribir JDs con voz livv, identificar el patron "founder hace todo". Estructural, no emocional.',
    example_prompts: [
      '¿Se justifica primer hire ahora?',
      'Armame JD para un Senior Brand Designer',
      'Hiring signals — ¿hay bottleneck que se justifique resolver?',
    ],
  },
  brujula: {
    slug: 'brujula',
    display_name: 'Brújula',
    tagline: 'Explora nuevas fronteras',
    domain: 'Bizdev / Partnerships — adyacencias verticales, partner pipeline',
    accent_hex: '#9333EA',
    accent_soft: '#F3E8FF',
    accent_text: '#581C87',
    glyph: 'compass',
    group: 'livv_os',
    pitch: 'Soy el explorador de fronteras nuevas. Cuando Payper esté estable y empieces a pensar en producto #2, te tiro adyacencias verticales (peluquerías, gimnasios, talleres, consultorios — PYMES con dolor similar a gastro). También trackeo partners potenciales y deal pipeline a nivel studio. Práctico, sugiero acción concreta.',
    example_prompts: [
      '¿Qué vertical picamos después de gastronomía?',
      'Análisis de adjacencies del thesis actual',
      '¿Hay partnerships estratégicos por explorar?',
    ],
  },
};

export function cssVarsForAgent(slug: AgentSlug): CSSProperties {
  const a = auroraAgents[slug];
  return {
    // Custom CSS properties — cast because React.CSSProperties doesn't type them.
    ['--aurora-accent' as any]: a.accent_hex,
    ['--aurora-accent-soft' as any]: a.accent_soft,
    ['--aurora-accent-text' as any]: a.accent_text,
  };
}
