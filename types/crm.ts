export type LeadStatus = 'new' | 'contacted' | 'following' | 'closed' | 'lost';
export type LeadTemperature = 'cold' | 'warm' | 'hot';
export type LeadCategory = 'branding' | 'web-design' | 'ecommerce' | 'saas' | 'creators' | 'other';

export interface Lead {
  id: string;
  name: string;
  email: string;
  message: string;
  origin: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
  status: LeadStatus;
  createdAt: string;
  lastInteraction: string;
  company?: string;
  phone?: string;
  source?: string;
  budget?: number;
  category?: LeadCategory;
  temperature?: LeadTemperature;
  aiAnalysis?: {
    category: LeadCategory;
    temperature: LeadTemperature;
    summary: string;
    recommendation: string;
  };
  history: {
    id: string;
    type: 'email' | 'note' | 'status_change' | 'system';
    content: string;
    date: string;
  }[];
  converted_to_project_id?: string;
  converted_at?: string;
}

export interface WebAnalytics {
  totalVisits: number;
  uniqueVisitors: number;
  bounceRate: number;
  conversions: number;
  topPages: { path: string; views: number }[];
  dailyVisits: { date: string; value: number }[];
}

export type ProposalStatus = 'draft' | 'sent' | 'approved' | 'rejected';

export interface Proposal {
  id: string;
  tenant_id: string;
  lead_id?: string | null;
  client_id?: string | null;
  title: string;
  summary?: string | null;
  status: ProposalStatus;
  content?: string | null;
  pricing_snapshot?: Record<string, any>;
  timeline?: Record<string, any>;
  currency?: string | null;
  project_type?: string | null;
  language?: string | null;
  brief_text?: string | null;
  portfolio_ids?: string[] | null;
  complexity?: string | null;
  complexity_factor?: number | null;
  pricing_total?: number | null;
  consent_text?: string | null;
  public_token?: string | null;
  public_enabled?: boolean;
  sent_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
  updated_at: string;
}
