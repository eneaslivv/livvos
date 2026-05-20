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
  if (agent === 'halo')   return halo(m);
  if (agent === 'cobra')  return cobra(m);
  if (agent === 'selva')  return selva(m);
  if (agent === 'rune')   return rune(m);
  if (agent === 'echo')   return echo(m);
  if (agent === 'pulse')  return pulse(m);
  return { agent: 'atlas', text: 'Te paso con quien lo lleva.', canvas: null };
}

function atlas(m: string): AgentResponse {
  let target: AgentSlug = 'orion';
  let reason = 'default daily ops';
  // Order matters — most specific first. Platform > Master + Tenant
  // intent before any generic word matches.
  if (/tenant|master|churn|expansion|cross.?tenant|plataform|platform/.test(m)) {
    target = 'pulse'; reason = 'platform health intent';
  } else if (/partner|referr|comisión|comision|afiliad|payout|portal/.test(m)) {
    target = 'echo'; reason = 'partners intent';
  } else if (/team|equipo|capacit|hire|contratar|burnout|capacidad|carga|workload|comp|comp benchmark/.test(m)) {
    target = 'selva'; reason = 'team intent';
  } else if (/product|pricing|precio|tier|embed|stripe|suscripción|suscripcion/.test(m) && !/lead|propuesta/.test(m)) {
    target = 'rune'; reason = 'product intent';
  } else if (/cliente|client|retainer|nps|salud|relación|relacion|expansión|expansion deal|csm|customer success/.test(m)) {
    target = 'cobra'; reason = 'client relationship intent';
  } else if (/inbox|mail|mensaj|email|slack|triage|vip|reply|responder/.test(m)) {
    target = 'halo'; reason = 'inbox / triage intent';
  } else if (/icp|posicionamiento|positioning|brand|estrategia|estrategi|narrativa|propuesta de valor|value prop|principio/.test(m)) {
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
    halo: 'Halo', cobra: 'Cobra', selva: 'Selva', rune: 'Rune',
    echo: 'Echo', pulse: 'Pulse',
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

// ───────────────────────────────────────────────────────────────
// HALO — Triage Assistant (Communications / Inbox)
// Senior EA / Inside Sales mindset. Pattern-matches inbound across
// channels; flags VIPs; spots clusters that indicate content opps;
// drafts replies in voice.
// Reasoning style: "I see 3 of the same question this week — that's
// not random, that's a pattern. Worth a content piece."
// ───────────────────────────────────────────────────────────────
function halo(m: string): AgentResponse {
  if (/(pipeline|deal|propuesta)/.test(m))
    return { agent: 'halo', text: 'Eso ya pasó a venta — Solara lo lleva.', canvas: null };
  if (/(factur|cobr|invoice)/.test(m))
    return { agent: 'halo', text: 'Marina.', canvas: null };

  if (/inbox|qué tengo|que tengo|mensajes/.test(m)) {
    return {
      agent: 'halo',
      text: '12 mensajes nuevos. 1 hot: Mulberry contestó tu propuesta a las 08:42 ("budget needs CFO approval"). 4 que importan, 7 que pueden esperar. Empezamos por Mulberry.',
      canvas: { type: 'display', agent: 'halo', blocks: [
        sc([
          { label: 'Nuevos',        value: '12' },
          { label: 'Hot',            value: '1', tone: 'warn' },
          { label: 'VIP',            value: '4' },
          { label: 'Background',     value: '7' },
        ]),
        ll([
          { id: 'h1', name: 'Camila Ortiz · Mulberry',      status: 'hot',         last_touch: '12m', ai_score: 0.94 },
          { id: 'h2', name: 'Iris Wallace · Sable Loft',    status: 'partner',     last_touch: '2h',  ai_score: 0.71 },
          { id: 'h3', name: 'Mateo Cordero · Halcyon',      status: 'check-in',    last_touch: '3h',  ai_score: 0.58 },
          { id: 'h4', name: 'Newsletter list (3 replies)',   status: 'reactions',   last_touch: '1d',  ai_score: 0.32 },
        ]),
      ]},
    };
  }

  if (/clúster|cluster|patrón|patron|repetida|repetido|misma pregunta/.test(m)) {
    return {
      agent: 'halo',
      text: '3 leads diferentes preguntaron lo mismo esta semana ("¿cómo escopean strategy projects?"). Eso no es ruido — eso es señal de que falta un blog post o un Loom público.',
      canvas: { type: 'display', agent: 'halo', blocks: [
        sc([
          { label: 'Pregunta recurrente', value: '3x', sublabel: 'esta semana' },
          { label: 'Última vez (recordada)', value: 'Hace 11d' },
          { label: 'Frecuencia subiendo',    value: '+200%', tone: 'warn' },
        ]),
        ll([
          { id: 'q1', name: 'Sofía R. (Boutique)',  company: '"¿proceso para el sprint?"',  last_touch: '2d' },
          { id: 'q2', name: 'Andrés P. (Cremona)',   company: '"qué incluye el playbook"',  last_touch: '1d' },
          { id: 'q3', name: 'Lucas M. (Halcyon)',    company: '"cuántas horas reales"',     last_touch: '4h' },
        ]),
      ]},
    };
  }

  if (/draft|borrador|contestar|responder/.test(m)) {
    return {
      agent: 'halo',
      text: 'Listo, 2 variantes para Mulberry. La directa cierra mejor con CFOs.',
      canvas: { type: 'interactive', agent: 'halo',
        controls: [
          { kind: 'textarea', id: 'warm',   label: 'Warm — empática',  value: 'Camila, entiendo el gate de CFO. ¿Te sirve si te paso un PDF de 1 página con el ROI proyectado en formato presupuesto, para que se lo lleves directo?' },
          { kind: 'textarea', id: 'direct', label: 'Directa — número',  value: '$24K → $84K en 12 meses (ROI 3.5x). Te lo armo en 1 página para CFO. ¿Mando hoy?' },
        ],
        submit: { label: 'Mandar la directa' }},
    };
  }

  if (/response time|tiempo de respuesta|tarda|tardando/.test(m)) {
    return {
      agent: 'halo',
      text: 'Cremona te contesta cada vez más tarde: 4h → 12h → 18h en las últimas 3 semanas. Es la misma curva que mostró Halcyon antes de pausar en enero. Recomiendo Loom check-in esta semana antes que sea tarde.',
      canvas: null,
    };
  }

  if (/vip|important|priorit/.test(m)) {
    return {
      agent: 'halo',
      text: 'Tus VIP definidos: 4 clientes activos + 3 partners. De ellos, 2 sin tocar en >7 días (Sunnyside, Iris). El SLA tuyo es 24h — estás fuera.',
      canvas: null,
    };
  }

  return { agent: 'halo', text: 'Pedime: inbox del día, patrones repetidos, borradores, response time, VIP gaps.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// COBRA — Relationship Curator (Clients / CSM)
// Senior CSM mindset. Watches retainer health proactively — knows
// the patterns that predate churn (response time drop, sentiment
// shift, touchpoint gap) and the signals that predate expansion
// (extra project ask, internal champion change, NPS spike).
// Reasoning style: "Last 3 clients that did this churned within 5
// weeks. We have 4 to act."
// ───────────────────────────────────────────────────────────────
function cobra(m: string): AgentResponse {
  if (/(icp|posicionamiento)/.test(m))
    return { agent: 'cobra', text: 'Lumen para estrategia macro. Yo te muestro qué pasa hoy con cada uno.', canvas: null };

  if (/salud|health|cómo están|como estan|status clientes/.test(m)) {
    return {
      agent: 'cobra',
      text: '4 retainers. 2 verdes, 1 amarillo, 1 rojo. Halcyon en rojo: 23 días sin touch real (avg sano = 11d) + 2 mensajes sin respuesta. Es la misma cadencia que tuvo Cremona en marzo antes de pausar.',
      canvas: { type: 'display', agent: 'cobra', blocks: [
        sc([
          { label: 'Retainers',      value: '4' },
          { label: 'Verde',           value: '2' },
          { label: 'Amarillo',         value: '1', tone: 'warn' },
          { label: 'Rojo',             value: '1', tone: 'err' },
        ]),
        pg([
          { id: 'c1', title: 'Mulberry Group',     client: 'green',  health: 'expansion-ready', profit_margin: 42, total_agreed: 24000 },
          { id: 'c2', title: 'Cremona Capital',    client: 'green',  health: 'stable',           profit_margin: 38, total_agreed: 18000 },
          { id: 'c3', title: 'Sunnyside',          client: 'yellow', health: '11d no-touch',     profit_margin: 31, total_agreed: 12000 },
          { id: 'c4', title: 'Halcyon AI',         client: 'red',    health: '23d no-touch · 2 unread', profit_margin: 22, total_agreed: 14000 },
        ]),
      ]},
    };
  }

  if (/churn|riesgo|pausa|cancela/.test(m)) {
    return {
      agent: 'cobra',
      text: 'Halcyon: 73% probabilidad de pausa en 4-6 semanas si no intervenimos. Pattern match con Cremona Q1 (mismo response time decay + mismo no-show de check-in). Ventana de intervención: cierra el viernes que viene.',
      canvas: { type: 'workflow', agent: 'cobra', idempotency_key: uid(),
        stepper: [
          { name: 'Pattern detected (3 weeks)',  status: 'done' },
          { name: 'Compare to churn signals',     status: 'done' },
          { name: 'Draft Loom check-in',          status: 'pending' },
          { name: 'Schedule call',                 status: 'pending' },
        ],
        cta: { confirm_label: 'Generar Loom check-in', cancel_label: 'Cancelar' }},
    };
  }

  if (/expansi|upsell|crecer|grow/.test(m)) {
    return {
      agent: 'cobra',
      text: 'Mulberry compró 2 proyectos extra en 60 días + Camila promovió a Head of Marketing hace 3 semanas. Triple señal de expansión. NPS predicho 9+. Propondría retainer +$2.5K/mo o un Strategy Sprint additional.',
      canvas: { type: 'display', agent: 'cobra', blocks: [
        sc([
          { label: 'Extra projects · 60d',   value: '2' },
          { label: 'Champion promoted',       value: 'Yes', tone: 'ok' },
          { label: 'NPS predicho',            value: '9+', tone: 'ok' },
          { label: 'Upsell window',           value: 'Open', tone: 'ok' },
        ]),
      ]},
    };
  }

  if (/touch|check.?in|hablar|llamar/.test(m)) {
    return {
      agent: 'cobra',
      text: 'Gaps de touchpoint: Halcyon 23d (acción urgente), Sunnyside 11d (acción esta semana). Mulberry 4d, Cremona 6d — ambos sanos. El threshold mío para retainers es 14d.',
      canvas: null,
    };
  }

  if (/nps|sentiment|satisfacción|satisfaccion/.test(m)) {
    return {
      agent: 'cobra',
      text: 'NPS predicho desde sentiment de los últimos 30 mensajes por cliente: Mulberry 9, Cremona 8, Sunnyside 6 (cayendo de 8 hace 2 meses), Halcyon 4. El delta de Sunnyside es la señal real — sentiment cayó antes que touch frequency.',
      canvas: null,
    };
  }

  return { agent: 'cobra', text: 'Pedime: salud de retainers, riesgo de churn, oportunidades de expansion, gaps de touchpoint, NPS predicho.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// SELVA — Org Designer (TeamScaling)
// COO + Head of People mindset. Capacity-aware, burnout-sensitive,
// always thinking 2 quarters ahead about who you'll need vs what
// revenue forecast supports.
// Reasoning style: "Lucía at 110% for 3 weeks. Mateo did this last
// year — week 5 was when he broke. Redistribute now."
// ───────────────────────────────────────────────────────────────
function selva(m: string): AgentResponse {
  if (/(lead|pipeline|deal)/.test(m))
    return { agent: 'selva', text: 'Solara. Yo entro cuando hay que sumar gente para soportar el pipeline.', canvas: null };

  if (/burnout|cargad|sobrecarg|capacit|overload/.test(m)) {
    return {
      agent: 'selva',
      text: 'Lucía al 110% por 3 semanas seguidas. La misma curva que Mateo Q1 — semana 5 fue cuando agarró el covid + perdimos 2 semanas de delivery. Recomiendo redistribuir 2 tareas grandes a Sara (al 75%) esta semana.',
      canvas: { type: 'workflow', agent: 'selva', idempotency_key: uid(),
        stepper: [
          { name: 'Detect 3-week overload',       status: 'done' },
          { name: 'Match historical burnout pattern', status: 'done' },
          { name: 'Identify available capacity', status: 'done' },
          { name: 'Propose redistribution',       status: 'pending' },
        ],
        cta: { confirm_label: 'Re-asignar 2 tareas a Sara', cancel_label: 'Cancelar' }},
    };
  }

  if (/hire|contratar|cuando.*hire|cuándo.*hire|next hire/.test(m)) {
    return {
      agent: 'selva',
      text: 'Revenue +18% MoM consistente. Cap actual del team = ~22 clientes; vos tenés 19. Ventana de hire: M3-M4. El gap es Content (Vega te pide carga repetida) o un Strategy associate para soltar la dependencia de vos en discovery calls.',
      canvas: { type: 'display', agent: 'selva', blocks: [
        sc([
          { label: 'Clients ahora',     value: '19' },
          { label: 'Cap actual',         value: '22' },
          { label: 'Revenue MoM',        value: '+18%', tone: 'ok' },
          { label: 'Hire window',        value: 'M3-M4' },
        ]),
        ll([
          { id: 'r1', name: 'Content Producer (FT)',        company: '$3.5K/mo · Cost +14%' },
          { id: 'r2', name: 'Strategy Associate (PT)',      company: '$2.2K/mo · Cost +9%' },
          { id: 'r3', name: 'Operations Coordinator (CT)',  company: '$1.6K/mo · Cost +7%' },
        ]),
      ]},
    };
  }

  if (/capacidad.*equipo|capacity.*team|workload.*semana|carga.*semana/.test(m)) {
    return {
      agent: 'selva',
      text: 'Capacity semanal: vos 32/40h, Lucía 44/40h (rojo), Sara 30/40h, Mateo 12/20h. El viernes acumula 73% de las overdue — sistémico. Si arrancás reviews lunes/martes, la fricción del viernes desaparece.',
      canvas: { type: 'display', agent: 'selva', blocks: [
        bc('Hours assigned vs capacity', [
          { x: 'Eneas', y: 32 }, { x: 'Lucía', y: 44 }, { x: 'Sara', y: 30 }, { x: 'Mateo', y: 12 },
        ]),
      ]},
    };
  }

  if (/cost.*team|costo.*equipo|nómina|nomina|margen.*team/.test(m)) {
    return {
      agent: 'selva',
      text: 'Team cost actual: $24.6K/mo. Revenue $58K/mo. Margen 58%. Top quartile de agencias 5-15 está entre 45-65%, estás bien. Sumar 1 FT te pone en 52% — sostenible si revenue sigue ramp.',
      canvas: null,
    };
  }

  if (/comp|salar|benchmark/.test(m)) {
    return {
      agent: 'selva',
      text: 'Para los roles abiertos: Content Producer (LATAM remote) median $2.8K-3.8K/mo. Strategy Associate $2K-2.6K. Si querés top quartile, sumá 15%. Vos pagás abajo de market en Designer — un riesgo a 12 meses.',
      canvas: null,
    };
  }

  return { agent: 'selva', text: 'Pedime: capacity del team, burnout signals, cuándo hire, next role gap, comp benchmark, margen team.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// RUNE — Product Marketer (Products marketplace)
// Senior pricing strategist + lifecycle marketer. Reads tier
// psychology, spots underpricing, suggests when to bundle / split /
// sunset products.
// Reasoning style: "78% of buyers pick the middle tier — that's a
// tell that the top tier is too good. Raise it $50 to test."
// ───────────────────────────────────────────────────────────────
function rune(m: string): AgentResponse {
  if (/(lead|outreach|pipeline)/.test(m))
    return { agent: 'rune', text: 'Solara. Yo aparezco cuando hay que vender el producto, no a la persona.', canvas: null };

  if (/precio|pricing|tier|underpriced|caro|barato/.test(m)) {
    return {
      agent: 'rune',
      text: 'Pulse Studio tier en $349/mo. Benchmark de dashboards ejecutivos comparables (Notion+Tella+Causal combos) = $440 median. Estás 22% abajo. El test: subir a $399, medir 30 días, comparar conversion.',
      canvas: { type: 'display', agent: 'rune', blocks: [
        sc([
          { label: 'Pulse Studio',       value: '$349/mo' },
          { label: 'Market median',       value: '$440/mo' },
          { label: 'Gap',                  value: '-22%', tone: 'warn' },
          { label: 'Suggested test',       value: '$399/mo' },
        ]),
      ]},
    };
  }

  if (/tier.*psicolog|popular|78%|distribución de tiers/.test(m)) {
    return {
      agent: 'rune',
      text: 'En Pulse, 78% va al tier "Team" ($149). En tier psychology eso es señal de que Studio ($349) está demasiado lejos. Dos jugadas: 1) bajar Studio a $249 para capturar más middle, o 2) subir Team a $179 + meter feature de Studio. Voto por la 2 — mejor margen.',
      canvas: { type: 'display', agent: 'rune', blocks: [
        dc('Distribución por tier · Pulse', [
          { label: 'Solo · $49',   value: 14 },
          { label: 'Team · $149',  value: 144 },
          { label: 'Studio · $349', value: 26 },
        ]),
      ]},
    };
  }

  if (/embed|widget|conversi/.test(m)) {
    return {
      agent: 'rune',
      text: 'Buy button embed en partner sites convierte 4.2%, en Pulse landing 2.1%. El embed de Iris (Sable Loft) tira el 60% de las ventas. La acción: contactá a 5 partners más para que pongan el embed — es tu canal con mejor unit economics.',
      canvas: null,
    };
  }

  if (/sunset|eol|matar|killer/.test(m)) {
    return {
      agent: 'rune',
      text: 'Pricing Architecture: 96 units en 11 meses, pero las últimas 6 ventas fueron solo en mayo (todas vino de un newsletter mention). Sin canal sostenido. Dos opciones: 1) bundlear con Sales OS como upsell, 2) rebrand a "Pricing Sprint" y meter Loom de 60min — diferenciás.',
      canvas: null,
    };
  }

  if (/best.*seller|top.*product|que.*vende.*mas|qué.*vende.*más/.test(m)) {
    return {
      agent: 'rune',
      text: 'Top performers por revenue: 1) Agency OS $124K (LTV/customer $3.2K — el de mejor números), 2) Content Pack $41K, 3) Pulse $27K. Por unidades: AI Prompts (524 units) — perfecto para tier $39 entry-level. Pulse tiene el mejor CAC/LTV ratio.',
      canvas: { type: 'display', agent: 'rune', blocks: [
        pg([
          { id: 'p1', title: 'Agency OS',         client: 'System',   profit_margin: 78, total_agreed: 124200, total_collected: 124200 },
          { id: 'p2', title: 'Content Pack',      client: 'Template', profit_margin: 92, total_agreed: 41280,  total_collected: 41280 },
          { id: 'p3', title: 'Pulse',              client: 'App',      profit_margin: 64, total_agreed: 27416,  total_collected: 27416 },
        ]),
      ]},
    };
  }

  return { agent: 'rune', text: 'Pedime: pricing benchmark, tier distribution, embed conversion, sunset signal, top sellers.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// ECHO — Partner Activator (Partners portal)
// Senior partnerships manager. Knows which partners are referring
// high-LTV leads, who's dormant but worth reviving, when to ship a
// "partner of the month" lever (6-7x ROI when done right).
// Reasoning style: "Iris hasn't sent a ref in 47 days. Her last 3
// closed at 100%. That's not lost — that's worth a Loom hoy."
// ───────────────────────────────────────────────────────────────
function echo(m: string): AgentResponse {
  if (/(lead.*especific|outreach.*lead)/.test(m))
    return { agent: 'echo', text: 'Solara. Yo manejo a los partners, no a los leads que ellos te mandan.', canvas: null };

  if (/top|mejor|estrella|partner.*month/.test(m)) {
    return {
      agent: 'echo',
      text: 'Iris @ Sable Loft: 3 refs en 90 días, 100% close rate, $48K total. Sin competencia. Partner of the month obvio — la propuesta: featured spot en tu landing + bump de commission 15% → 20% por Q. ROI histórico de mover esta palanca = 6-7x.',
      canvas: { type: 'display', agent: 'echo', blocks: [
        sc([
          { label: 'Iris · refs',        value: '3', sublabel: '90d' },
          { label: 'Close rate',          value: '100%', tone: 'ok' },
          { label: 'Total cerrado',       value: '$48K' },
          { label: 'LTV potencial',       value: '$140K' },
        ]),
      ]},
    };
  }

  if (/dormant|dormido|inactivo|sin.*referir|sin.*tocar/.test(m)) {
    return {
      agent: 'echo',
      text: '8 partners firmaron hace >60 días y nunca mandaron una ref. 3 de ellos tienen >50% historical close rate (Carla, Bruno, Sofi). No es ruido — es señal de que el onboarding del partner program no está activando. Re-engagement loop con un Loom de 2min cada uno.',
      canvas: { type: 'display', agent: 'echo', blocks: [
        ll([
          { id: 'p1', name: 'Carla Mendez',  company: '67d dormant · 80% close rate',  ai_score: 0.82 },
          { id: 'p2', name: 'Bruno Esteban', company: '74d dormant · 60% close rate',  ai_score: 0.71 },
          { id: 'p3', name: 'Sofi Petraglia',company: '69d dormant · 55% close rate',  ai_score: 0.66 },
          { id: 'p4', name: '5 partners más',company: '62-89d dormant · sin track record', ai_score: 0.34 },
        ]),
      ]},
    };
  }

  if (/atribuci|atribuc|attribution|tracking|decay/.test(m)) {
    return {
      agent: 'echo',
      text: 'Referral code IRWALL (Iris): clicks bajaron 70% week-over-week. O Iris dejó de compartir, o el landing rompió, o Google penalizó el redirect. Verificá la página → si está OK, ping a Iris hoy. Window de recuperación: ~5 días antes que pierda momentum.',
      canvas: null,
    };
  }

  if (/quality|canal|cuál.*mejor|cual.*mejor/.test(m)) {
    return {
      agent: 'echo',
      text: 'Partners es tu mejor canal por LTV: close rate 35% vs LinkedIn 22% vs Inbound 29%. Y el deal size promedio es 2.3x. La consecuencia operativa: por cada hora que ponés en outbound, deberías poner 2.3h en activar partners. No estás cerca de ese ratio.',
      canvas: null,
    };
  }

  if (/payout|comisión|comision|pagar/.test(m)) {
    return {
      agent: 'echo',
      text: 'Comisiones pendientes: Iris $1,200 (3 deals cerrados), Bruno $400 (1 deal), Roberto $0 (deals en negociación). Política saludable es pagar dentro de 30 días del cobro al cliente — Iris ya está en 38d. Genero los payouts ahora?',
      canvas: { type: 'workflow', agent: 'echo', idempotency_key: uid(),
        stepper: [
          { name: 'Check earned commissions',  status: 'done' },
          { name: 'Match against payouts already issued', status: 'done' },
          { name: 'Generate payout batch',     status: 'pending' },
        ],
        cta: { confirm_label: 'Generar payouts ($1,600)', cancel_label: 'Cancelar' }},
    };
  }

  return { agent: 'echo', text: 'Pedime: top partner, dormant partners, attribution health, quality por canal, payouts pendientes.', canvas: null };
}

// ───────────────────────────────────────────────────────────────
// PULSE — Tenant Health Monitor (Master mode)
// Cross-tenant ops. Sees the platform from above. Identifies the
// patterns that predict churn (typically 4-6 weeks out) and the
// signals that predict expansion (feature wall hits, seat caps,
// usage spikes).
// Only visible to platform_admin users (gated at switch level too).
// Reasoning style: "Payper2025 dropped 60% activity in week 4. Same
// pattern as 2 churned tenants. Window closes ~10 days."
// ───────────────────────────────────────────────────────────────
function pulse(m: string): AgentResponse {
  if (/churn|riesgo|cancel/.test(m)) {
    return {
      agent: 'pulse',
      text: 'Payper2025: 7d active users -60% vs prior. Matches el patrón exacto de 2 tenants que churnearon en semana 6 (Mar-2026 y Sep-2025). Probabilidad de churn 73% si no intervenimos. Ventana cierra en ~10 días. Propondría: 1 call de health + audit del onboarding.',
      canvas: { type: 'display', agent: 'pulse', blocks: [
        sc([
          { label: 'Payper2025 · DAU',   value: '-60%', tone: 'err' },
          { label: 'P(churn) · 6w',       value: '73%', tone: 'err' },
          { label: 'Intervention window', value: '10d', tone: 'warn' },
          { label: 'Historical matches',  value: '2/2' },
        ]),
        pg([
          { id: 't1', title: 'Payper2025',  client: 'Trial · 30d', health: 'red',    total_agreed: 0 },
          { id: 't2', title: 'PartnerOne',  client: 'Pro',          health: 'green',  total_agreed: 149 },
          { id: 't3', title: 'StudioFlow',  client: 'Pro',          health: 'green',  total_agreed: 149 },
          { id: 't4', title: 'Bravado Co',  client: 'Trial · 14d', health: 'yellow', total_agreed: 0 },
        ]),
      ]},
    };
  }

  if (/expansion|upgrade|crecimient/.test(m)) {
    return {
      agent: 'pulse',
      text: 'Sunnyside agotó seats hace 2 días + chocó con feature wall en document_versioning. Señal de upgrade clarísima — históricamente, tenants que pegan seat cap + feature wall mismo ciclo upgradean o churnean dentro de 7 días. Cero zona gris.',
      canvas: { type: 'display', agent: 'pulse', blocks: [
        sc([
          { label: 'Seat cap hit',         value: 'Yes', tone: 'warn' },
          { label: 'Feature wall hit',      value: 'document_versioning' },
          { label: 'Window',               value: '7d' },
          { label: 'Upgrade rate hist.',  value: '68%' },
        ]),
      ]},
    };
  }

  if (/onboarding|activación|activacion|tenants nuevos/.test(m)) {
    return {
      agent: 'pulse',
      text: '8 tenants signups en 30d. De ellos, 5 completaron week-2 activation (62%). Top quartile industry es 60% — vos un poquito arriba. El bottleneck: 3 de los que no activaron nunca conectaron una integración. Recomiendo onboarding email day-3 que empuje a conectar Slack o Gmail.',
      canvas: null,
    };
  }

  if (/feature.*usage|uso.*feature|qué.*usan|que.*usan/.test(m)) {
    return {
      agent: 'pulse',
      text: 'Master + Sales + Content los usan el 92% de healthy tenants. Los tenants que no tocan Sales por week 3 churnean a 4x el rate de los que sí. Significa que Sales es activation feature — no opcional. Empuje en onboarding day-7.',
      canvas: null,
    };
  }

  if (/plataforma|platform stats|cómo.*va.*plataforma|como.*va.*plataforma/.test(m)) {
    return {
      agent: 'pulse',
      text: '23 tenants activos (+3 mes). MRR $4.2K. NRR 112% (top quartile SMB SaaS). Gross churn 4% (sano). Quick-ratio 4.8 (excelente). El único tema: trial→paid es 41% (target 50%). Hay margen para apretar el onboarding.',
      canvas: { type: 'display', agent: 'pulse', blocks: [
        sc([
          { label: 'Active tenants',      value: '23' },
          { label: 'MRR',                  value: '$4.2K' },
          { label: 'NRR',                  value: '112%', tone: 'ok' },
          { label: 'Quick-ratio',          value: '4.8', tone: 'ok' },
          { label: 'Trial→Paid',           value: '41%', sublabel: 'target 50%', tone: 'warn' },
          { label: 'Gross churn',          value: '4%', tone: 'ok' },
        ]),
      ]},
    };
  }

  return { agent: 'pulse', text: 'Pedime: churn risk, expansion signals, onboarding health, feature usage patterns, platform stats.', canvas: null };
}
