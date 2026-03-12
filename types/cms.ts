export interface PortfolioMedia {
  url: string;
  type: 'image' | 'video' | 'gif';
  is_cover: boolean;
  caption?: string;
}

export interface ContentBlock {
  type: 'text' | 'heading' | 'quote';
  content: string;
  sort_order: number;
}

export interface CmsPortfolioItem {
  id: string;
  tenant_id: string;
  title: string;
  subtitle?: string | null;
  category?: string | null;
  services?: string | null;
  year?: string | null;
  image?: string | null;
  featured?: boolean;
  slug?: string | null;
  color?: string | null;
  colors?: string[] | null;
  description?: string | null;
  tech_tags?: string[] | null;
  display_order?: number | null;
  published?: boolean;
  media?: PortfolioMedia[];
  content_blocks?: ContentBlock[];
  // Legacy columns
  url?: string;
  cover_url?: string | null;
  project_type?: string | null;
  tags?: string[] | null;
  is_featured?: boolean | null;
  sort_order?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductStat {
  label: string;
  value: string;
}

export interface ProductProblem {
  title: string;
  desc: string;
}

export interface ProductFeature {
  title: string;
  desc: string;
}

export interface ProductWorkflowStep {
  step: string;
  title: string;
  desc: string;
}

export interface ProductPricing {
  monthly?: string;
  setup?: string;
  includes?: string[];
}

export interface CmsProduct {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  industry?: string | null;
  target?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  solution?: string | null;
  accent_color?: string | null;
  gradient?: string | null;
  dark_gradient?: string | null;
  hero_image?: string | null;
  gallery?: string[];
  published?: boolean;
  display_order?: number;
  portfolio_item_id?: string | null;
  stats?: ProductStat[];
  problems?: ProductProblem[];
  features?: ProductFeature[];
  workflow?: ProductWorkflowStep[];
  pricing?: ProductPricing;
  created_at?: string;
  updated_at?: string;
}

export interface CmsBlogPost {
  id: string;
  tenant_id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  excerpt?: string | null;
  content?: string | null;
  language?: string | null;
  cover_url?: string | null;
  tags?: string[] | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CmsClientLogo {
  id: string;
  tenant_id: string;
  name: string;
  logo_url: string;
  website_url?: string | null;
  is_visible?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export type CmsSection = 'portfolio' | 'products' | 'blog' | 'logos';
export type CmsViewMode = 'grid' | 'list';
