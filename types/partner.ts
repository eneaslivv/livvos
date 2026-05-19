/**
 * Partner types — mirror migrations/2026-06-05_partners.sql.
 * A `Partner` is an EXTERNAL referrer/affiliate/agency/reseller that
 * sends leads with a `referral_code` and earns commission. NOT a
 * team member or collaborator.
 */

export type PartnerStatus = 'invited' | 'active' | 'paused' | 'archived';
export type PartnerType   = 'referrer' | 'affiliate' | 'agency' | 'reseller' | 'creator';

export interface PartnerCommissionModel {
  /** Flat $X per conversion, OR percent of deal size, OR recurring monthly */
  kind: 'flat' | 'percent' | 'recurring';
  amount: number;
  currency?: string;
  /** What the commission triggers on. Default = first_payment. */
  applies_to?: 'first_payment' | 'lifetime' | 'first_12mo';
  notes?: string;
}

export interface Partner {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  company: string | null;
  type: PartnerType;
  referral_code: string;
  referral_link: string | null;
  commission_model: PartnerCommissionModel;
  attribution_days: number;
  min_payout: number;
  status: PartnerStatus;
  portal_access: boolean;
  avatar_url: string | null;
  brand_color: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PartnerWidgetType = 'form' | 'banner' | 'calc' | 'cta' | 'card' | 'modal';
export type PartnerWidgetStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface PartnerWidgetConfig {
  theme?: 'light' | 'dark' | 'auto';
  headline?: string;
  sub?: string;
  cta_text?: string;
  cta_url?: string;
  fields?: Array<{ name: string; label: string; required?: boolean }>;
  colors?: { bg?: string; fg?: string; accent?: string };
  position?: 'inline' | 'floating-br' | 'floating-bl' | 'modal-trigger';
  /** Anything else free-form for design flexibility. */
  [key: string]: unknown;
}

export interface PartnerWidget {
  id: string;
  partner_id: string;
  tenant_id: string;
  type: PartnerWidgetType;
  name: string | null;
  config: PartnerWidgetConfig;
  embed_code: string | null;
  views: number;
  clicks: number;
  conversions: number;
  status: PartnerWidgetStatus;
  created_at: string;
  updated_at: string;
}

export type PartnerInsert = Partial<Omit<Partner, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>> & {
  name: string;
  referral_code: string;
};
