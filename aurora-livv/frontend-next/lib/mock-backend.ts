// TS mirror of evals/mock_backend_py.py.
// Same keyword rules so UI and eval-runner produce identical responses.
import type { AgentSlug } from './tokens';

export interface CanvasBlock { kind: string; [k: string]: any; }
export interface Canvas {
  type: 'display' | 'workflow' | 'interactive' | 'route';
  agent: AgentSlug;
  blocks?: CanvasBlock[];
  stepper?: { name: string; status: 'pending' | 'done' | 'failed' }[];
  diff?: any[];
  controls?: any[];
  submit?: { label: string };
  cta?: { confirm_label: string; cancel_label: string };
  cooldown_seconds?: number;
  confirm_phrase?: string;
  idempotency_key?: string;
  target_agent?: AgentSlug;
  reason?: string;
}

export interface AgentResponse {
  agent: AgentSlug;
  text: string;
  canvas: Canvas | null;
}

const sc = (items: any[]) => ({ kind: 'stat_cards', items });
const ll = (items: any[]) => ({ kind: 'lead_list', items });
const pg = (items: any[]) => ({ kind: 'project_grid', items });
const bc = (title: string, data: any[]) => ({ kind: 'bar_chart', title, data });
const dc = (title: string, data: any[]) => ({ kind: 'donut_chart', title, data });
const at = (rows: any[]) => ({ kind: 'attribution_table', rows });
const md = (body: string) => ({ kind: 'markdown_block', body });

export function respond(agent: AgentSlug, message: string): AgentResponse {
  const m = message.toLowerCase().trim();
  if (agent === 'atlas') return route(m);
  if (agent === 'solara') return solara(m);
  if (agent === 'marina') return marina(m);
  if (agent === 'nova')   return nova(m);
  return { agent: 'atlas', text: 'No estoy seguro a quién pasarte. Probá con "ventas", "plata" o "tráfico".', canvas: null };
}

function route(m: string): AgentResponse {
  let target: AgentSlug = 'solara';
  let reason = 'default';
  if (/factur|cobr|margen|expense|cashflow|cobranzas|plata/.test(m)) { target = 'marina'; reason = 'finance intent'; }
  else if (/funnel|atribuci|canal|origen|forecast|conversi|tráfico|trafico|growth|dashboard/.test(m)) { target = 'nova'; reason = 'growth intent'; }
  else if (/lead|deal|pipeline|prospect|cliente|propuesta/.test(m)) { target = 'solara'; reason = 'sales intent'; }
  return {
    agent: 'atlas',
    text: `Te paso con ${target === 'solara' ? 'Solara' : target === 'marina' ? 'Marina' : 'Nova'}.`,
    canvas: { type: 'route', agent: 'atlas', target_agent: target, reason, idempotency_key: 'noop' },
  };
}

function solara(m: string): AgentResponse {
  if (/(factur|cobr|cashflow|margen|revenue)/.test(m))
    return { agent: 'solara', text: 'Eso lo tiene Marina, te paso con ella.', canvas: null };
  if (/(canal|atribuci|funnel|origen)/.test(m))
    return { agent: 'solara', text: 'Eso lo tiene Nova.', canvas: null };

  if (/pepe lopez|pepe lópez/.test(m))
    return { agent: 'solara', text: "No encontré a 'pepe lopez' en tu pipeline.", canvas: null };

  if (/stale|sin tocar/.test(m)) {
    return {
      agent: 'solara',
      text: 'Tenés 3 hot sin tocar (últimos 30 días, n=3). Martín Gomez urgente.',
      canvas: { type: 'display', agent: 'solara', blocks: [
        sc([{ label: 'Stale hot', value: '3' }, { label: 'Oldest touch', value: '4d' }, { label: 'Pipeline at risk', value: '$27,500' }]),
        ll([
          { id: 'b1111111', name: 'Martín Gomez', company: 'Startup.io', status: 'qualified', ai_score: 0.87, last_touch: '4d ago' },
          { id: 'b5555555', name: 'Diego López', company: 'Medium Co', status: 'negotiation', ai_score: 0.78, last_touch: '2d ago' },
          { id: 'b3333333', name: 'Carlos Rivera', company: 'Old Co', status: 'contacted', ai_score: 0.22, last_touch: '30d ago' },
        ]),
      ]},
    };
  }

  if (/pipeline|panorama/.test(m)) {
    return {
      agent: 'solara',
      text: 'Pipeline activo: 5 deals abiertos, $46,500 ponderado.',
      canvas: { type: 'display', agent: 'solara', blocks: [
        sc([
          { label: 'Open deals', value: '5' },
          { label: 'Pipeline value', value: '$58,000' },
          { label: 'Weighted', value: '$46,500' },
          { label: 'Hot', value: '2' },
        ]),
        ll([
          { id: 'b5555555', name: 'Diego López', company: 'Medium Co', status: 'negotiation', ai_score: 0.78 },
          { id: 'b2222222', name: 'Sarah Lee', company: 'Boutique Co', status: 'proposal', ai_score: 0.64 },
          { id: 'b1111111', name: 'Martín Gomez', company: 'Startup.io', status: 'qualified', ai_score: 0.87 },
          { id: 'b4444444', name: 'Ana Pérez', company: 'NewCo', status: 'new', ai_score: 0.45 },
          { id: 'b3333333', name: 'Carlos Rivera', company: 'Old Co', status: 'contacted', ai_score: 0.22 },
        ]),
      ]},
    };
  }

  if (/hot|calientes/.test(m)) {
    return { agent: 'solara', text: 'Top hot esta semana: Martín y Diego.', canvas: { type: 'display', agent: 'solara', blocks: [
      ll([
        { id: 'b1111111', name: 'Martín Gomez', company: 'Startup.io', status: 'qualified', ai_score: 0.87 },
        { id: 'b5555555', name: 'Diego López', company: 'Medium Co', status: 'negotiation', ai_score: 0.78 },
      ]),
    ]}};
  }

  if (/pasá a (carlos|carlos rivera)/.test(m) || /carlos.*proposal/.test(m))
    return { agent: 'solara', text: "Carlos está en 'contacted'. No puedo saltearlo a 'proposal' sin pasar por 'qualified' (te hace falta una discovery primero).", canvas: null };

  if (/draft|follow-?up|seguim/.test(m)) {
    return { agent: 'solara', text: 'Listo, te dejo 2 variantes — warm y direct. Editá antes de copiar.', canvas: { type: 'interactive', agent: 'solara', controls: [
      { kind: 'textarea', label: 'Warm version', id: 'warm', value: 'Martín — vi tu mensaje sobre el rebranding. ¿Te sirve una llamada de 20 min esta semana para definir scope?' },
      { kind: 'textarea', label: 'Direct version', id: 'direct', value: 'Martín — ¿te mando la propuesta el martes o preferís terminar de definir el scope antes?' },
    ], submit: { label: 'Guardar draft en historial' }}};
  }

  if (/perdí|perdimos|lo perd/.test(m))
    return { agent: 'solara', text: 'Lamento la pérdida — pasa. ¿Querés que registre la razón y veamos qué aprender? Si fue precio, hay 2 más en el pipeline con perfil parecido.', canvas: null };

  if (/conver.*martín|conver.*martin/.test(m))
    return { agent: 'solara', text: 'Antes de convertir necesito propuesta aceptada. ¿Ya la firmaron?', canvas: null };

  if (/conver.*(lucía|lucia)/.test(m)) {
    return { agent: 'solara', text: 'Lucía está en "won". Conversión lista.', canvas: { type: 'workflow', agent: 'solara', idempotency_key: crypto.randomUUID(), stepper: [
      { name: 'Create project', status: 'pending' },
      { name: 'Copy metadata', status: 'pending' },
      { name: 'Update lead', status: 'pending' },
      { name: 'Log activity', status: 'pending' },
    ], diff: [{ table: 'projects', row_id: 'new', field: 'client', from: null, to: 'Happy Co' }], cta: { confirm_label: 'Convertir', cancel_label: 'Cancelar' }}};
  }

  return { agent: 'solara', text: 'Contame qué necesitás del pipeline. Puedo abrir leads, stale, drafts o conversiones.', canvas: null };
}

function marina(m: string): AgentResponse {
  if (/(lead|prospecto|pipeline|stale|caliente)/.test(m))
    return { agent: 'marina', text: 'Eso lo lleva Solara.', canvas: null };
  if (/(canal|funnel|atribuci|growth)/.test(m))
    return { agent: 'marina', text: 'Eso lo lleva Nova.', canvas: null };

  if (/mes/.test(m)) {
    return { agent: 'marina', text: 'Mayo (parcial): cobrado $44,000.00 vs comprometido $72,000.00. Margen ponderado 31%. 1 proyecto en pérdida.', canvas: { type: 'display', agent: 'marina', blocks: [
      sc([
        { label: 'Cobrado', value: '$44,000.00', sublabel: 'mes parcial' },
        { label: 'Comprometido', value: '$72,000.00' },
        { label: 'Margen', value: '31%', trend: '+4%' },
        { label: 'Loss projects', value: '1', tone: 'warn' },
      ]),
    ]}};
  }

  if (/pérdida|perdida|loss|en rojo/.test(m)) {
    return { agent: 'marina', text: '1 proyecto en pérdida: Fintech Dashboard (Bank Corp, $3,000 abajo).', canvas: { type: 'display', agent: 'marina', blocks: [
      pg([{ id: 'a1111111', title: 'Fintech Dashboard', client: 'Bank Corp', health: 'loss', profit_margin: -12.5, total_agreed: 24000, total_collected: 12000 }]),
    ]}};
  }

  if (/bank corp.*(por qué|porque)|por qué.*bank corp/.test(m))
    return { agent: 'marina', text: 'Bank Corp está en pérdida por collection lag — total_agreed $24,000.00 vs total_collected $12,000.00 (50%). Direct expenses normales, lo imputado se comió el margen.', canvas: null };

  if (/mové|move/.test(m) && /imputado|imputed/.test(m) && /directo|direct/.test(m)) {
    return { agent: 'marina', text: 'Reclasifico $400.00 de imputed a direct en SaaS Branding. Margen pasa de 53% a 48%.', canvas: { type: 'workflow', agent: 'marina', idempotency_key: crypto.randomUUID(), stepper: [
      { name: 'Read finances', status: 'done' },
      { name: 'Reclassify', status: 'pending' },
      { name: 'Recompute health (trigger)', status: 'pending' },
    ], diff: [
      { table: 'finances', row_id: 'a3333333', field: 'direct_expenses', from: 100, to: 500 },
      { table: 'finances', row_id: 'a3333333', field: 'imputed_expenses', from: 3500, to: 3100 },
    ], cta: { confirm_label: 'Reclasificar', cancel_label: 'Cancelar' }}};
  }

  if (/aging|debe|recibir/.test(m)) {
    return { agent: 'marina', text: 'AR breakdown: $12,000.00 en 0-30, $0 en 31-60, $0 en 61-90, $0 en 90+.', canvas: { type: 'display', agent: 'marina', blocks: [
      sc([{ label: 'Total AR', value: '$12,000.00' }, { label: 'Over 60d', value: '0%', tone: 'ok' }]),
      bc('AR aging', [{ x: '0-30', y: 12000 }, { x: '31-60', y: 0 }, { x: '61-90', y: 0 }, { x: '90+', y: 0 }]),
    ]}};
  }

  if (/12 semanas|próximas|proximas|projection|proyección/.test(m)) {
    return { agent: 'marina', text: 'Proyección a 12 semanas: $28,000.00. Depende de que paguen a tiempo — Bank Corp es el más riesgoso.', canvas: { type: 'display', agent: 'marina', blocks: [
      sc([{ label: 'Expected inflow', value: '$28,000.00', sublabel: '12 semanas' }, { label: 'At-risk deals', value: '1', tone: 'warn' }]),
      bc('Expected inflow / week', [{ x: 'w22', y: 6000 }, { x: 'w23', y: 4000 }, { x: 'w24', y: 0 }, { x: 'w25', y: 8000 }, { x: 'w26', y: 0 }, { x: 'w27', y: 10000 }]),
    ]}};
  }

  if (/cobr.*lucía|cobr.*lucia|invoice.*lucía/.test(m)) {
    return { agent: 'marina', text: 'Lucía está en "won" con proposal aceptada. Te genero el borrador de factura.', canvas: { type: 'workflow', agent: 'marina', idempotency_key: crypto.randomUUID(), stepper: [
      { name: 'Read proposal', status: 'done' },
      { name: 'Compose draft', status: 'pending' },
      { name: 'Save draft', status: 'pending' },
    ], diff: [{ table: 'proposals', row_id: 'p_lucia', field: 'invoice_data', from: null, to: '{ amount: 8000, due_date: ... }' }], cta: { confirm_label: 'Crear borrador', cancel_label: 'Cancelar' }}};
  }

  if (/runway/.test(m))
    return { agent: 'marina', text: 'Livv todavía no tracea expenses a nivel compañía — solo a nivel proyecto. Para calcular runway necesito que conectemos un libro contable o ingreses fixed costs.', canvas: null };

  if (/subscription/.test(m))
    return { agent: 'marina', text: '"subscription" no es válido. Las opciones son: fixed, hourly, retainer.', canvas: null };

  if (/2026|ytd|año/.test(m))
    return { agent: 'marina', text: '2026 YTD (mayo): $44,000.00 cobrado.', canvas: { type: 'display', agent: 'marina', blocks: [sc([{ label: 'YTD 2026', value: '$44,000.00' }])] }};

  return { agent: 'marina', text: 'Decime qué número querés ver. Tengo mes, AR aging, proyección 12 semanas, salud por proyecto.', canvas: null };
}

function nova(m: string): AgentResponse {
  if (/(lead urgente|hot|caliente|follow-?up)/.test(m))
    return { agent: 'nova', text: 'Eso lo tiene Solara.', canvas: null };
  if (/(cobr|facturé|cashflow|margen|revenue)/.test(m))
    return { agent: 'nova', text: 'Eso lo tiene Marina.', canvas: null };

  if (/funnel|embudo/.test(m)) {
    return { agent: 'nova', text: 'Funnel (últimos 30 días, n=47): new→contacted 60%, contacted→qualified 45%, qualified→proposal 38%, proposal→won 20%.', canvas: { type: 'display', agent: 'nova', blocks: [
      sc([{ label: 'Top of funnel', value: '47' }, { label: 'Qualified', value: '13' }, { label: 'Won', value: '2' }, { label: 'E2E', value: '4.3%' }]),
      bc('Funnel (n=47)', [{ x: 'new', y: 47 }, { x: 'contacted', y: 28 }, { x: 'qualified', y: 13 }, { x: 'proposal', y: 5 }, { x: 'won', y: 1 }]),
    ]}};
  }

  if (/dónde vienen|donde vienen|atribuci|source/.test(m)) {
    return { agent: 'nova', text: 'Últimos 30 días (n=47): Web Form 38%, Instagram 26%, Referral 17%, LinkedIn 11%, Unattributed 8%.', canvas: { type: 'display', agent: 'nova', blocks: [
      dc('Sources', [{ label: 'Web Form', value: 18 }, { label: 'Instagram', value: 12 }, { label: 'Referral', value: 8 }, { label: 'LinkedIn', value: 5 }, { label: 'Unattributed', value: 4 }]),
      at([
        { source: 'Web Form', leads_n: 18, qualified_n: 7, won_n: 1, revenue: 8000 },
        { source: 'Instagram', leads_n: 12, qualified_n: 6, won_n: 1, revenue: 7500 },
        { source: 'Referral', leads_n: 8, qualified_n: 2, won_n: 0, revenue: 0 },
        { source: 'LinkedIn', leads_n: 5, qualified_n: 1, won_n: 0, revenue: 0 },
        { source: 'Unattributed', leads_n: 4, qualified_n: 0, won_n: 0, revenue: 0 },
      ]),
    ]}};
  }

  if (/forecast.*trimestre|quarter/.test(m)) {
    return { agent: 'nova', text: 'Forecast quarter (n=5 deals abiertos): best $46,500, likely $24,800, worst $11,000.', canvas: { type: 'display', agent: 'nova', blocks: [
      sc([{ label: 'Best', value: '$46,500' }, { label: 'Likely', value: '$24,800' }, { label: 'Worst', value: '$11,000' }]),
    ]}};
  }

  if (/forecast.*(12 meses|año)/.test(m))
    return { agent: 'nova', text: 'No hago forecast a 12 meses — el horizonte introduce demasiada varianza. Cap es 1 trimestre.', canvas: null };

  if (/perdiendo.*negotiation/.test(m))
    return { agent: 'nova', text: 'En negotiation tenés n=1 (Diego). Muestra muy chica para concluir bottleneck.', canvas: null };

  if (/perdiendo|bottleneck/.test(m)) {
    return { agent: 'nova', text: 'El choke point es qualified → proposal: perdés 8 de 13 (últimos 30 días, n=47).', canvas: { type: 'display', agent: 'nova', blocks: [
      bc('Drops', [{ x: 'new→contacted', y: 19 }, { x: 'contacted→qualified', y: 15 }, { x: 'qualified→proposal', y: 8 }, { x: 'proposal→neg', y: 2 }]),
    ]}};
  }

  if (/semana.*va|cómo me va|como me va/.test(m))
    return { agent: 'nova', text: 'Confirmame ventana: ¿últimos 7 días corridos o esta semana calendario (lun-hoy)?', canvas: null };

  if (/wbr|business review/.test(m))
    return { agent: 'nova', text: 'WBR de la semana — preview antes de guardar.', canvas: { type: 'workflow', agent: 'nova', idempotency_key: crypto.randomUUID(), stepper: [
      { name: 'Funnel snapshot', status: 'done' },
      { name: 'Attribution', status: 'done' },
      { name: 'Forecast', status: 'done' },
      { name: 'Bottleneck', status: 'done' },
      { name: 'Compose narrative', status: 'done' },
      { name: 'Save artifact', status: 'pending' },
    ], diff: [{ table: 'agents.artifacts', row_id: 'new', field: 'kind', from: null, to: 'wbr' }], cta: { confirm_label: 'Guardar WBR', cancel_label: 'Cancelar' }}};

  if (/probabilidad|ajustar/.test(m))
    return { agent: 'nova', text: 'Tuneá las probabilidades por etapa y recalculo el forecast.', canvas: { type: 'interactive', agent: 'nova', controls: [
      { kind: 'slider', label: 'new',        min: 0, max: 1, step: 0.01, value: 0.05, id: 'p_new' },
      { kind: 'slider', label: 'contacted',  min: 0, max: 1, step: 0.01, value: 0.10, id: 'p_contacted' },
      { kind: 'slider', label: 'qualified',  min: 0, max: 1, step: 0.01, value: 0.25, id: 'p_qualified' },
      { kind: 'slider', label: 'proposal',   min: 0, max: 1, step: 0.01, value: 0.50, id: 'p_proposal' },
      { kind: 'slider', label: 'negotiation', min: 0, max: 1, step: 0.01, value: 0.75, id: 'p_negotiation' },
    ], submit: { label: 'Recalcular forecast' }}};

  return { agent: 'nova', text: 'Decime qué métrica y qué ventana. Tengo funnel, atribución, forecast, bottleneck, WBR.', canvas: null };
}
