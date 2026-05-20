// Mock backend for Aurora multi-agent chat.
// Returns canned canvases by keyword. Mirrors the Python eval mock.
// Used when AURORA_LIVE=false (env var) or as a fallback if the edge function
// is unreachable. Lets the dock be fully functional without an LLM.

import type {
  AgentResponse, AgentSlug, Canvas, CanvasBlock,
  StatCardItem, LeadListItem, ProjectGridItem,
} from '../../types/aurora';

const sc = (items: StatCardItem[]): CanvasBlock => ({ kind: 'stat_cards', items });
const ll = (items: LeadListItem[]): CanvasBlock => ({ kind: 'lead_list', items });
const pg = (items: ProjectGridItem[]): CanvasBlock => ({ kind: 'project_grid', items });
const bc = (title: string, data: { x: string; y: number }[]): CanvasBlock => ({ kind: 'bar_chart', title, data });
const dc = (title: string, data: { label: string; value: number }[]): CanvasBlock => ({ kind: 'donut_chart', title, data });
const at = (rows: any[]): CanvasBlock => ({ kind: 'attribution_table', rows });

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'm_' + Math.random().toString(36).slice(2);
}

export function auroraMockRespond(agent: AgentSlug, message: string): AgentResponse {
  const m = message.toLowerCase().trim();
  if (agent === 'atlas')  return atlas(m);
  if (agent === 'solara') return solara(m);
  if (agent === 'marina') return marina(m);
  if (agent === 'nova')   return nova(m);
  if (agent === 'lumen')  return lumen(m);
  if (agent === 'vega')   return vega(m);
  if (agent === 'orion')  return orion(m);
  if (agent === 'iris')   return iris(m);
  return { agent: 'atlas', text: 'Te paso con quien lo lleva.', canvas: null };
}

function atlas(m: string): AgentResponse {
  let target: AgentSlug = 'orion';
  let reason = 'default daily ops';
  // Order matters — most specific first.
  if (/icp|posicionamiento|positioning|brand|estrategia|estrategi|narrativa|propuesta de valor|value prop/.test(m)) {
    target = 'lumen'; reason = 'strategy intent';
  } else if (/content|contenido|posteo|post|carousel|video|reel|newsletter|publicar|cadencia/.test(m)) {
    target = 'vega'; reason = 'content intent';
  } else if (/framework|engagement|deliverable|sprint|playbook|scope|toolkit|servicio productizado|productized/.test(m)) {
    target = 'iris'; reason = 'toolkit intent';
  } else if (/factur|cobr|margen|cashflow|cobranzas|plata|ar aging|invoice|expense/.test(m)) {
    target = 'marina'; reason = 'finance intent';
  } else if (/funnel|atribuci|canal|origen|forecast|conversi|tráfico|trafico|growth|dashboard|fuente/.test(m)) {
    target = 'nova'; reason = 'growth intent';
  } else if (/lead|deal|pipeline|prospect|propuesta|outreach|follow-?up|stale/.test(m)) {
    target = 'solara'; reason = 'sales intent';
  } else if (/agenda|hoy|esta semana|focus|prioridad|brief|catch.*up|plan.*semana|plan.*día|plan.*dia|task|tarea/.test(m)) {
    target = 'orion'; reason = 'daily ops intent';
  }
  const NAMES: Record<AgentSlug, string> = {
    atlas: 'Atlas', solara: 'Solara', marina: 'Marina', nova: 'Nova',
    lumen: 'Lumen', vega: 'Vega', orion: 'Orion', iris: 'Iris',
  };
  return {
    agent: 'atlas',
    text: `Te paso con ${NAMES[target]}.`,
    canvas: { type: 'route', agent: 'atlas', target_agent: target, reason, idempotency_key: uid() },
  };
}

function solara(m: string): AgentResponse {
  if (/(factur|cobr|cashflow|margen|revenue|invoice)/.test(m))
    return { agent: 'solara', text: 'Eso lo tiene Marina — te paso.', canvas: null };
  if (/(canal|atribuci|funnel|origen|fuente)/.test(m))
    return { agent: 'solara', text: 'Eso lo tiene Nova.', canvas: null };

  if (/pepe lopez|pepe lópez/.test(m))
    return { agent: 'solara', text: "No encontré a 'pepe lopez' en tu pipeline.", canvas: null };

  if (/stale|sin tocar/.test(m)) {
    return {
      agent: 'solara',
      text: 'Tenés 3 leads hot sin tocar (n=3, últimos 30 días). Martín es el más urgente.',
      canvas: { type: 'display', agent: 'solara', blocks: [
        sc([
          { label: 'Stale hot', value: '3', tone: 'warn' },
          { label: 'Oldest touch', value: '4d' },
          { label: 'Pipeline at risk', value: '$27,500' },
        ]),
        ll([
          { id: 'b1', name: 'Martín Gomez', company: 'Startup.io', status: 'qualified', ai_score: 0.87, last_touch: '4d' },
          { id: 'b5', name: 'Diego López',  company: 'Medium Co', status: 'negotiation', ai_score: 0.78, last_touch: '2d' },
          { id: 'b3', name: 'Carlos Rivera', company: 'Old Co', status: 'contacted', ai_score: 0.22, last_touch: '30d' },
        ]),
      ]},
    };
  }

  if (/pipeline|panorama|cómo está|como esta/.test(m)) {
    return {
      agent: 'solara',
      text: '5 deals abiertos, $58,000 en pipeline, $46,500 ponderado.',
      canvas: { type: 'display', agent: 'solara', blocks: [
        sc([
          { label: 'Open',     value: '5' },
          { label: 'Pipeline', value: '$58,000' },
          { label: 'Weighted', value: '$46,500' },
          { label: 'Hot',      value: '2' },
        ]),
        ll([
          { id: 'b5', name: 'Diego López',   company: 'Medium Co',   status: 'negotiation', ai_score: 0.78 },
          { id: 'b2', name: 'Sarah Lee',     company: 'Boutique Co', status: 'proposal',    ai_score: 0.64 },
          { id: 'b1', name: 'Martín Gomez',  company: 'Startup.io',  status: 'qualified',   ai_score: 0.87 },
          { id: 'b4', name: 'Ana Pérez',     company: 'NewCo',       status: 'new',         ai_score: 0.45 },
        ]),
      ]},
    };
  }

  if (/draft|follow-?up|seguim/.test(m)) {
    return { agent: 'solara', text: 'Listo, dos variantes. Editá antes de copiar.', canvas: { type: 'interactive', agent: 'solara',
      controls: [
        { kind: 'textarea', id: 'warm',   label: 'Warm version',  value: 'Hola Martín — vi tu mensaje sobre el rebranding. ¿Te sirve una llamada de 20 min esta semana para definir scope?' },
        { kind: 'textarea', id: 'direct', label: 'Direct version', value: '¿Te mando la propuesta el martes o preferís terminar de definir el scope primero?' },
      ], submit: { label: 'Guardar draft en historial' }}};
  }

  if (/perdí|perdimos|lo perd/.test(m))
    return { agent: 'solara', text: 'Lamento la pérdida — pasa. ¿Querés que registre la razón y veamos qué aprender?', canvas: null };

  return { agent: 'solara', text: 'Contame qué necesitás del pipeline.', canvas: null };
}

function marina(m: string): AgentResponse {
  if (/(lead|prospecto|pipeline|stale|caliente|outreach)/.test(m))
    return { agent: 'marina', text: 'Eso lo lleva Solara.', canvas: null };
  if (/(funnel|atribuci|canal|growth|fuente)/.test(m))
    return { agent: 'marina', text: 'Eso lo lleva Nova.', canvas: null };

  if (/mes|mensual/.test(m)) {
    return { agent: 'marina', text: 'Mes (parcial): cobrado $44,000.00 vs comprometido $72,000.00. Margen ponderado 31%. 1 proyecto en pérdida.',
      canvas: { type: 'display', agent: 'marina', blocks: [
        sc([
          { label: 'Cobrado',      value: '$44,000.00', sublabel: 'mes parcial' },
          { label: 'Comprometido', value: '$72,000.00' },
          { label: 'Margen',       value: '31%', trend: '+4%' },
          { label: 'Loss',         value: '1', tone: 'warn' },
        ]),
      ]}};
  }

  if (/pérdida|perdida|loss|en rojo/.test(m)) {
    return { agent: 'marina', text: '1 proyecto en pérdida: Fintech Dashboard (Bank Corp).',
      canvas: { type: 'display', agent: 'marina', blocks: [
        pg([{ id: 'p1', title: 'Fintech Dashboard', client: 'Bank Corp', health: 'loss', profit_margin: -12.5, total_agreed: 24000, total_collected: 12000 }]),
      ]}};
  }

  if (/aging|debe|recibir|ar /.test(m)) {
    return { agent: 'marina', text: 'AR breakdown: $12,000.00 en 0-30, $0 en el resto.',
      canvas: { type: 'display', agent: 'marina', blocks: [
        sc([{ label: 'Total AR', value: '$12,000.00' }, { label: 'Over 60d', value: '0%', tone: 'ok' }]),
        bc('AR aging', [{ x: '0-30', y: 12000 }, { x: '31-60', y: 0 }, { x: '61-90', y: 0 }, { x: '90+', y: 0 }]),
      ]}};
  }

  if (/12 semanas|próximas|proximas|projection|proyección/.test(m)) {
    return { agent: 'marina', text: 'Proyección a 12 semanas: $28,000.00. Depende de que paguen a tiempo.',
      canvas: { type: 'display', agent: 'marina', blocks: [
        sc([{ label: 'Expected', value: '$28,000.00', sublabel: '12 semanas' }, { label: 'At-risk', value: '1', tone: 'warn' }]),
        bc('Expected / week', [{ x: 'w1', y: 6000 }, { x: 'w2', y: 4000 }, { x: 'w3', y: 0 }, { x: 'w4', y: 8000 }, { x: 'w5', y: 0 }, { x: 'w6', y: 10000 }]),
      ]}};
  }

  if (/cobr.*lucía|cobr.*lucia/.test(m)) {
    return { agent: 'marina', text: 'Lucía está en "won". Te genero el borrador de factura.',
      canvas: { type: 'workflow', agent: 'marina', idempotency_key: uid(),
        stepper: [
          { name: 'Read proposal', status: 'done' },
          { name: 'Compose draft',  status: 'pending' },
          { name: 'Save', status: 'pending' },
        ],
        diff: [{ table: 'proposals', row_id: 'p_lucia', field: 'invoice_data', from: null, to: '{ amount: 8000, due_in_days: 30 }' }],
        cta: { confirm_label: 'Crear borrador', cancel_label: 'Cancelar' }}};
  }

  if (/runway/.test(m))
    return { agent: 'marina', text: 'Livv todavía no tracea expenses a nivel compañía — solo por proyecto. Para runway necesito que conectemos un libro contable.', canvas: null };

  return { agent: 'marina', text: 'Decime qué número querés ver: mes, AR aging, proyección 12 semanas, salud por proyecto.', canvas: null };
}

function nova(m: string): AgentResponse {
  if (/(lead urgente|hot|caliente|follow-?up|outreach)/.test(m))
    return { agent: 'nova', text: 'Eso lo tiene Solara.', canvas: null };
  if (/(cobr|facturé|cashflow|margen|revenue|invoice)/.test(m))
    return { agent: 'nova', text: 'Eso lo tiene Marina.', canvas: null };

  if (/funnel|embudo/.test(m)) {
    return { agent: 'nova', text: 'Funnel (últimos 30 días, n=47): new→contacted 60%, contacted→qualified 45%, qualified→proposal 38%.',
      canvas: { type: 'display', agent: 'nova', blocks: [
        sc([{ label: 'Top', value: '47' }, { label: 'Qualified', value: '13' }, { label: 'Won', value: '2' }, { label: 'E2E', value: '4.3%' }]),
        bc('Funnel (n=47)', [{ x: 'new', y: 47 }, { x: 'cont', y: 28 }, { x: 'qual', y: 13 }, { x: 'prop', y: 5 }, { x: 'won', y: 1 }]),
      ]}};
  }

  if (/dónde vienen|donde vienen|atribuci|source|fuente|canal/.test(m)) {
    return { agent: 'nova', text: 'Últimos 30 días (n=47): Web Form 38%, Instagram 26%, Referral 17%, LinkedIn 11%, Unattributed 8%.',
      canvas: { type: 'display', agent: 'nova', blocks: [
        dc('Sources', [
          { label: 'Web Form', value: 18 }, { label: 'Instagram', value: 12 },
          { label: 'Referral', value: 8 }, { label: 'LinkedIn', value: 5 }, { label: 'Unattributed', value: 4 },
        ]),
        at([
          { source: 'Web Form',     leads_n: 18, qualified_n: 7, won_n: 1, revenue: 8000 },
          { source: 'Instagram',    leads_n: 12, qualified_n: 6, won_n: 1, revenue: 7500 },
          { source: 'Referral',     leads_n: 8,  qualified_n: 2, won_n: 0, revenue: 0 },
          { source: 'LinkedIn',     leads_n: 5,  qualified_n: 1, won_n: 0, revenue: 0 },
          { source: 'Unattributed', leads_n: 4,  qualified_n: 0, won_n: 0, revenue: 0 },
        ]),
      ]}};
  }

  if (/forecast.*(trimestre|quarter|q)/.test(m)) {
    return { agent: 'nova', text: 'Forecast quarter (n=5): best $46,500, likely $24,800, worst $11,000.',
      canvas: { type: 'display', agent: 'nova', blocks: [
        sc([{ label: 'Best', value: '$46,500' }, { label: 'Likely', value: '$24,800' }, { label: 'Worst', value: '$11,000' }]),
      ]}};
  }

  if (/perdiendo|bottleneck/.test(m)) {
    return { agent: 'nova', text: 'Choke point: qualified → proposal. Perdés 8 de 13 (n=47).',
      canvas: { type: 'display', agent: 'nova', blocks: [
        bc('Drops', [{ x: 'new→cont', y: 19 }, { x: 'cont→qual', y: 15 }, { x: 'qual→prop', y: 8 }, { x: 'prop→neg', y: 2 }]),
      ]}};
  }

  if (/semana.*va|cómo me va|como me va/.test(m))
    return { agent: 'nova', text: 'Confirmame ventana: ¿últimos 7 días corridos o esta semana calendario?', canvas: null };

  return { agent: 'nova', text: 'Decime métrica + ventana. Tengo funnel, atribución, forecast, bottleneck.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// LUMEN — Strategy Analyst
// Owns: ICPs, packages, positioning principles, brand kits.
// Hand-offs: → Vega for content briefs; → Solara for who-to-target.
// ───────────────────────────────────────────────────────────────
function lumen(m: string): AgentResponse {
  if (/(lead|deal|outreach|pipeline)/.test(m))
    return { agent: 'lumen', text: 'Eso lo lleva Solara — te paso.', canvas: null };
  if (/(factur|cobr|invoice|margen)/.test(m))
    return { agent: 'lumen', text: 'Eso lo lleva Marina.', canvas: null };
  if (/(post|contenido|content|carousel|reel)/.test(m))
    return { agent: 'lumen', text: 'Vega tiene el lápiz — pero arrancá conmigo si querés alinear con la estrategia primero.', canvas: null };

  if (/icp|cliente ideal/.test(m)) {
    return {
      agent: 'lumen',
      text: 'Tenés 3 ICPs activos. El de "Agencias en crecimiento" cierra al doble de velocidad que los otros dos.',
      canvas: { type: 'display', agent: 'lumen', blocks: [
        sc([
          { label: 'ICPs activos', value: '3' },
          { label: 'Avg cycle (top)', value: '19d' },
          { label: 'Avg cycle (rest)', value: '38d' },
          { label: 'Drift score', value: '12%', tone: 'warn' },
        ]),
        bc('Win rate por ICP', [
          { x: 'Agencias',       y: 28 },
          { x: 'Consultorías',    y: 14 },
          { x: 'SaaS chico',     y: 19 },
        ]),
      ]},
    };
  }

  if (/drift|alinea|estrategia|salir del foco/.test(m)) {
    return {
      agent: 'lumen',
      text: '12% de los leads nuevos no matchean ningún ICP definido. Mayoría llegan por referrals — tu narrativa actual está atrayendo lo correcto, pero los referrals están sesgados.',
      canvas: null,
    };
  }

  if (/positioning|posicionamiento|narrativa/.test(m)) {
    return {
      agent: 'lumen',
      text: '4 principios definidos. "Show the kitchen" es el que más aparece en deals ganados (8 de 11 últimos casos).',
      canvas: { type: 'display', agent: 'lumen', blocks: [
        ll([
          { id: 'p1', name: 'Show the kitchen',          status: 'active', ai_score: 0.92 },
          { id: 'p2', name: 'Systems > campaigns',       status: 'active', ai_score: 0.76 },
          { id: 'p3', name: 'Founder-readable',           status: 'active', ai_score: 0.61 },
          { id: 'p4', name: 'Patient over urgent',       status: 'testing', ai_score: 0.34 },
        ]),
      ]},
    };
  }

  if (/package|paquete|oferta/.test(m)) {
    return {
      agent: 'lumen',
      text: '5 packages. "Content Engine retainer" tira del 64% del MRR. Reordené por rentabilidad por hora.',
      canvas: { type: 'display', agent: 'lumen', blocks: [
        sc([
          { label: 'Packages',     value: '5' },
          { label: '$/hr top',      value: '$280' },
          { label: '$/hr promedio', value: '$165' },
        ]),
      ]},
    };
  }

  return { agent: 'lumen', text: 'Decime: ICPs, principios de positioning, packages, drift, brand voice. Tengo todo eso a mano.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// VEGA — Content Producer
// Owns: channels, calendar, studio, pipeline kanban, templates,
// performance. Hand-offs: → Lumen for ICP/brand alignment;
// → Orion for "hoy publico qué".
// ───────────────────────────────────────────────────────────────
function vega(m: string): AgentResponse {
  if (/(icp|posicionamiento|estrategia)/.test(m))
    return { agent: 'vega', text: 'Lumen lleva la estrategia — pasame con ella primero si querés alinear.', canvas: null };
  if (/(funnel|atribuci|fuente)/.test(m))
    return { agent: 'vega', text: 'Nova tiene la atribución por canal.', canvas: null };

  if (/cadencia|cadence|compliance|publico/.test(m)) {
    return {
      agent: 'vega',
      text: 'Esta semana: LinkedIn 4/5, Instagram 2/3, YouTube 0/1, Email 1/1. YouTube atrasado 4 semanas.',
      canvas: { type: 'display', agent: 'vega', blocks: [
        sc([
          { label: 'Compliance', value: '70%', trend: '+8%' },
          { label: 'Pieces this week', value: '7' },
          { label: 'Atrasado',     value: 'YouTube', tone: 'warn' },
        ]),
        bc('Posts por canal', [
          { x: 'LinkedIn',   y: 4 },
          { x: 'Instagram',   y: 2 },
          { x: 'YouTube',    y: 0 },
          { x: 'Email',      y: 1 },
        ]),
      ]},
    };
  }

  if (/draft|generar|propuesta de post|content idea|idea/.test(m)) {
    return {
      agent: 'vega',
      text: 'Tres variantes para LinkedIn con brand voice + ICP "Agencias". Editá antes de publicar.',
      canvas: { type: 'interactive', agent: 'vega',
        controls: [
          { kind: 'textarea', id: 'v1', label: 'V1 — hook directo',    value: '"Los founders no compran agencias. Compran sistemas que corren sin ellos." → 3 cosas que sistematizamos en los últimos 90 días.' },
          { kind: 'textarea', id: 'v2', label: 'V2 — case study',      value: 'Mulberry Group cerró 4 deals nuevos en 60 días después de auditar su content engine. Lo que cambiamos:' },
          { kind: 'textarea', id: 'v3', label: 'V3 — provocador',      value: 'Si tu agencia depende del founder publicando, no es una agencia. Es una banda de un solo músico con factura.' },
        ],
        submit: { label: 'Guardar como draft en el pipeline' }},
    };
  }

  if (/repurpose|repurposing|reutiliz/.test(m)) {
    return {
      agent: 'vega',
      text: '2 piezas listas para repurpose: el carousel de "Cremona case" (28K impressions) → newsletter + reel. Y la thread de "Founder vs system" → video largo de 12min.',
      canvas: null,
    };
  }

  if (/performance|que funcion|qué funcion/.test(m)) {
    return {
      agent: 'vega',
      text: 'Top 3 últimos 30 días: 1) Founder vs system thread · 6.4% eng. 2) BTS Sunnyside · 5.8% eng. 3) Newsletter #34 · 64% open.',
      canvas: null,
    };
  }

  return { agent: 'vega', text: 'Pedime: drafts, cadence, repurpose, performance, ideación por ICP+brand.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// ORION — Daily Coach
// Owns: Brief, Home, Calendar, Activity. Synthesizes overnight
// changes; suggests focus; redistributes tasks.
// Hand-offs: → Lumen / Vega / Solara / Marina depending on intent.
// ───────────────────────────────────────────────────────────────
function orion(m: string): AgentResponse {
  if (/icp|estrategia|posicionamiento/.test(m))
    return { agent: 'orion', text: 'Lumen para eso. Yo coordino el día.', canvas: null };
  if (/contenido|post|carousel|publicar/.test(m))
    return { agent: 'orion', text: 'Vega tiene el lápiz.', canvas: null };
  if (/lead|outreach|pipeline/.test(m))
    return { agent: 'orion', text: 'Solara.', canvas: null };

  if (/catch.*up|que paso|qué pasó|ayer|overnight|qué cambió|que cambio/.test(m)) {
    return {
      agent: 'orion',
      text: 'Overnight: 3 leads nuevos (1 hot), 2 tasks overdue resueltas por Lucía, 1 invoice pagada ($8K). Sunnyside checkpoint terminó al 80%.',
      canvas: { type: 'display', agent: 'orion', blocks: [
        sc([
          { label: 'Leads nuevos',    value: '3', sublabel: '1 hot' },
          { label: 'Tasks resueltas', value: '2' },
          { label: 'Cobrado',          value: '$8K', tone: 'ok' },
          { label: 'Sunnyside',       value: '80%' },
        ]),
      ]},
    };
  }

  if (/plan.*semana|plan.*día|plan.*dia|focus|prioridad/.test(m)) {
    return {
      agent: 'orion',
      text: 'Hoy lo mejor: 1) Mulberry proposal v2 (hot, 4d sin tocar). 2) Sunnyside checkpoint con Lucía. 3) Newsletter #35 si te queda hueco. El resto puede esperar.',
      canvas: { type: 'display', agent: 'orion', blocks: [
        ll([
          { id: 't1', name: 'Mulberry proposal v2',     status: 'urgent',  ai_score: 0.92 },
          { id: 't2', name: 'Sunnyside checkpoint',     status: 'today',   ai_score: 0.78 },
          { id: 't3', name: 'Newsletter #35',            status: 'optional', ai_score: 0.45 },
        ]),
      ]},
    };
  }

  if (/blocked|trabad|estanc/.test(m)) {
    return {
      agent: 'orion',
      text: 'Tenés 2 cosas trabadas esperando a alguien: Cremona contract review (Iris al cliente), y Halcyon design review (Sara). Ambos +3 días.',
      canvas: null,
    };
  }

  if (/capacity|carga|workload|sobrecarg/.test(m)) {
    return {
      agent: 'orion',
      text: 'Tu capacity esta semana: 28h disponibles, 34h asignadas. Lucía está al 110%. Sara al 75%. Re-asigno 2 tasks de Lucía → Sara?',
      canvas: { type: 'workflow', agent: 'orion', idempotency_key: uid(),
        stepper: [
          { name: 'Identify overload',   status: 'done' },
          { name: 'Find available teammate', status: 'done' },
          { name: 'Propose redistribution', status: 'pending' },
        ],
        cta: { confirm_label: 'Re-asignar', cancel_label: 'Cancelar' }},
    };
  }

  return { agent: 'orion', text: 'Decime: qué cambió, plan del día, blocked, capacity. Soy tu chief of staff.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// IRIS — Engagement Designer (Toolkit)
// Owns: frameworks library, client projects, productized
// engagements, AI Config prompts. Picks framework + scopes hours +
// drafts deliverable shell + invoice.
// ───────────────────────────────────────────────────────────────
function iris(m: string): AgentResponse {
  if (/lead|outreach|pipeline/.test(m))
    return { agent: 'iris', text: 'Solara para pipeline. Yo entro cuando se cierra el deal.', canvas: null };
  if (/contenido|post|carousel/.test(m))
    return { agent: 'iris', text: 'Vega para content. Yo si querés productizar el content engine como entregable.', canvas: null };

  if (/framework|engagement|entregable|deliverable/.test(m)) {
    return {
      agent: 'iris',
      text: '6 frameworks productizados. "Positioning Sprint" y "Content Engine Blueprint" son los que más se venden.',
      canvas: { type: 'display', agent: 'iris', blocks: [
        sc([
          { label: 'Frameworks',     value: '6' },
          { label: 'Más vendido',     value: 'Positioning' },
          { label: 'Ingreso último Q', value: '$48K' },
        ]),
        ll([
          { id: 'f1', name: 'Positioning Sprint',       company: '24h · $8K',  status: 'top' },
          { id: 'f3', name: 'Content Engine Blueprint', company: '20h · $6K',  status: 'top' },
          { id: 'f4', name: 'Pricing Architecture',     company: '22h · $7K',  status: 'active' },
          { id: 'f5', name: 'Sales Playbook',            company: '22h · $6.5K', status: 'active' },
        ]),
      ]},
    };
  }

  if (/scope|cuanto.*cobr|cuánto.*cobr|estimar.*horas|estimacion/.test(m)) {
    return {
      agent: 'iris',
      text: 'Decime el framework + cliente + nivel de complejidad. Yo te tiro horas + price + 30/60/90 plan.',
      canvas: null,
    };
  }

  if (/usar.*framework|aplicar.*framework|spin.*up|crear.*proyecto/.test(m)) {
    return {
      agent: 'iris',
      text: 'Listo, creo: Project + 8 tasks + Deliverable shell + Invoice draft. Querés que arranque?',
      canvas: { type: 'workflow', agent: 'iris', idempotency_key: uid(),
        stepper: [
          { name: 'Pick framework',     status: 'done' },
          { name: 'Pick client',         status: 'done' },
          { name: 'Scope tasks (8)',    status: 'pending' },
          { name: 'Create deliverable shell', status: 'pending' },
          { name: 'Draft invoice',       status: 'pending' },
        ],
        cta: { confirm_label: 'Crear todo', cancel_label: 'Cancelar' }},
    };
  }

  if (/prompt|ai config|template ai/.test(m)) {
    return {
      agent: 'iris',
      text: '5 prompts en producción. El de "Outreach generator" tira 184 runs/mes. Querés editarlo?',
      canvas: null,
    };
  }

  return { agent: 'iris', text: 'Pedime: frameworks disponibles, scope a un cliente, usar un framework, prompts AI config.', canvas: null };
}
