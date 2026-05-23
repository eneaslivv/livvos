// Aurora multi-agent chat — shared types.
// Used by client (context + components) and Supabase Edge Function aurora-chat.

export type AgentSlug =
  // ── Aurora — product-level agents (Payper / eneas-os) ───────────────
  | 'atlas'   // Orchestrator
  | 'solara'  // Sales
  | 'marina'  // Finance
  | 'nova'    // Growth
  | 'lumen'   // Strategy
  | 'vega'    // Content
  | 'orion'   // Daily ops
  | 'iris'    // Toolkit / Engagements
  | 'halo'    // Triage Assistant (Communications / Inbox)
  | 'cobra'   // Relationship Curator (Clients / CSM)
  | 'selva'   // Org Designer (TeamScaling)
  | 'rune'    // Product Marketer (Products marketplace)
  | 'echo'    // Partner Activator (Partners portal)
  | 'pulse'   // Tenant Health Monitor (Master mode, cross-tenant)
  // ── livv OS — studio-level agents (founder only, gated server-side) ──
  // MVS (Sprint 1):
  | 'norte'   // CEO / Manager del studio (único punto de contacto cotidiano)
  | 'tesoro'  // Finanzas / Runway / Treasury del studio
  | 'pulso'   // Product portfolio metrics (cross-product, NOT cross-tenant)
  | 'memoria' // Knowledge / Lessons learned cross-producto (el moat)
  // Strategy + Operations + Borde (Sprints 2-5):
  | 'cumbre'  // Strategy / Foresight (12-24mo, simulación, stress test)
  | 'forja'   // Engineering / Tech ops / Infra
  | 'trazo'   // Design / Brand / Visual system
  | 'ola'     // Growth / Marketing / Build-in-public
  | 'raiz'    // People / Talent / Allocation (on-demand)
  | 'brujula'; // Bizdev / Partnerships / Adjacencies (on-demand)
export type AuroraMode = 'multi' | 'unified';

export interface AgentMeta {
  slug: AgentSlug;
  display_name: string;
  tagline: string;
  domain: string;
  accent_hex: string;
  accent_soft: string;
  accent_text: string;
  glyph: string;
  /** Long-form marketing copy explaining who the agent is, what they do
   *  particularly well, and when you would talk to them vs another agent.
   *  Shown on hover popover in the chip rail. Aim for 2-3 sentences. */
  pitch?: string;
  /** 3-4 concrete example prompts a user can click to seed the chat input.
   *  Each should be a real query in español rioplatense, not generic. */
  example_prompts?: string[];
  /** Group label for the chip rail (helps visual separation Aurora vs livv OS). */
  group?: 'aurora' | 'livv_os';
}

export type CanvasType = 'display' | 'workflow' | 'interactive' | 'route';

export interface StatCardItem {
  label: string;
  value: string;
  sublabel?: string;
  trend?: string;
  tone?: 'ok' | 'warn' | 'err' | 'neutral';
}
export interface LeadListItem {
  id: string;
  name: string;
  company?: string;
  status?: string;
  ai_score?: number;
  last_touch?: string;
}
export interface ProjectGridItem {
  id: string;
  title: string;
  client?: string;
  health?: string;
  profit_margin?: number;
  total_agreed?: number;
  total_collected?: number;
}
export interface ChartPoint { x: string; y: number }
export interface DonutPoint  { label: string; value: number }
export interface AttributionRow {
  source: string;
  leads_n: number;
  qualified_n: number;
  won_n: number;
  revenue: number;
}

export type CanvasBlock =
  | { kind: 'stat_cards'; items: StatCardItem[] }
  | { kind: 'lead_list'; items: LeadListItem[] }
  | { kind: 'project_grid'; items: ProjectGridItem[] }
  | { kind: 'bar_chart'; title?: string; data: ChartPoint[] }
  | { kind: 'donut_chart'; title?: string; data: DonutPoint[] }
  | { kind: 'attribution_table'; rows: AttributionRow[] }
  | { kind: 'markdown_block'; body: string };

export interface CanvasStep { name: string; status: 'pending' | 'done' | 'failed' }
export interface CanvasDiff { table: string; row_id: string; field: string; from: any; to: any }
export interface CanvasControl {
  kind: 'textarea' | 'slider' | 'toggle';
  id: string;
  label: string;
  value: any;
  min?: number; max?: number; step?: number;
}

export interface Canvas {
  type: CanvasType;
  agent: AgentSlug;
  blocks?: CanvasBlock[];
  stepper?: CanvasStep[];
  diff?: CanvasDiff[];
  controls?: CanvasControl[];
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
  request_id?: string;
}

export interface AuroraMessage {
  id: string;
  role: 'user' | 'agent';
  agent?: AgentSlug;
  text: string;
  canvas?: Canvas | null;
  createdAt: number;
  /** Structured inbox messages for rich card rendering (from orchestrator rawData) */
  inboxMessages?: any[];
  /** Proposed write actions from the orchestrator */
  proposedActions?: any[];
}

export interface AuroraSendOptions {
  /** Force the next user message to this agent (overrides current active). */
  agent?: AgentSlug;
  /** Module the user is currently looking at — Atlas uses for routing hints. */
  moduleContext?: string;
}
