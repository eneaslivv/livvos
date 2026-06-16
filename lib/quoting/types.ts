// ============================================================
// Quoting — shared types (pure).
// ============================================================

export interface ServicePricing {
  id?: string;
  name: string;
  description?: string | null;
  fixed_price?: number | null;
  hourly_rate?: number | null;
  estimated_weeks?: number | null;
  complexity?: string | null;
  tech_stack?: string[] | null;
  deliverables?: string[] | null;
  is_active?: boolean | null;
  simple_factor?: number;
  standard_factor?: number;
  advanced_factor?: number;
  complex_factor?: number;
}

export interface PriceResult {
  livvPrice: number;
  suggestedClientPrice: number;
  breakdown: Record<string, unknown>;
}

export interface LineItem {
  name: string;
  description?: string;
  livv: number;
  client: number | null;
  complexity?: string;
  timeline?: string;
  source?: 'catalog' | 'custom_request' | 'manual';
  bullets?: string[];
}

export interface PricingSnapshot {
  items: LineItem[];
  totals: { livv: number; client: number };
  currency: string;
  options?: unknown;
}

export interface CustomRequestLike {
  status?: string;
  approved_price?: number | null;
  client_facing_note?: string | null;
  original_text?: string;
  affected_modules?: string[] | null;
  complexity?: string | null;
}

// --- Onboarding ---------------------------------------------

export interface OnboardingTask {
  ref?: string;
  depends_on?: string | null;
  depends_on_ref?: string | null;
  order_index?: number;
  title: string;
  owner_role?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | string;
  status?: string;
  tag?: string | null;
  assignee?: unknown;
  description?: string | null;
  module?: string | null;
  internal_note?: string | null;
  optional?: boolean;
  client_task?: boolean;
  estimated_hours?: number | null;
  group_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  due_date?: string | null;
}

export interface OnboardingStage {
  key: string;
  title: string;
  status?: string;
  due_date?: string | null;
  tasks: OnboardingTask[];
}

export interface OnboardingPlan {
  project?: Record<string, unknown>;
  modules?: string[];
  approved_extras?: string[];
  out_of_scope?: string[];
  special_requirements?: string[];
  stages?: OnboardingStage[];
  assets_pending?: Array<Record<string, unknown>>;
  accesses_needed?: Array<{ service?: string; needed_for?: string; url?: string | null; notes?: string | null }>;
  owners_suggested?: Record<string, unknown>;
  suggested_dates?: Record<string, unknown>;
  risks?: Array<Record<string, unknown>>;
  missing_info?: string[];
  custom_notes?: unknown[];
  [k: string]: unknown;
}

export interface OnboardingRecord {
  id?: string;
  tenant_id?: string;
  proposal_id?: string | null;
  client_id?: string | null;
  project_id?: string | null;
  status?: string;
  approved_value?: number | null;
  currency?: string | null;
  plan: OnboardingPlan;
}
