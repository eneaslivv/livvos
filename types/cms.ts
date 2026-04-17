export interface PortfolioMedia {
  url: string;
  type: 'image' | 'video' | 'gif';
  is_cover: boolean;
  caption?: string;
}

// ── Content Block Types (discriminated union) ──────────────────────

interface ContentBlockBase {
  sort_order: number;
}

export interface TextBlock extends ContentBlockBase {
  type: 'text';
  content: string;
}

export interface HeadingBlock extends ContentBlockBase {
  type: 'heading';
  content: string;
}

export interface QuoteBlock extends ContentBlockBase {
  type: 'quote';
  content: string;
}

export interface HeroImageBlock extends ContentBlockBase {
  type: 'hero_image';
  image_url: string;
  alt?: string;
}

export interface ChallengeBlock extends ContentBlockBase {
  type: 'challenge';
  label: string;
  heading: string;
  paragraphs: string[];
  tools: string[];
  kpis: { text: string }[];
}

export interface ImageShowcaseBlock extends ContentBlockBase {
  type: 'image_showcase';
  label?: string;
  layout: 'single' | 'side_by_side' | 'wireframe';
  images: { url: string; alt?: string; theme?: 'light' | 'dark'; caption?: string }[];
}

export interface DesignSystemBlock extends ContentBlockBase {
  type: 'design_system';
  label: string;
  heading: string;
  description?: string;
  typeface?: {
    name: string;
    weights: { value: string; label: string }[];
    /** Optional uploaded font files injected via @font-face */
    sources?: { url: string; weight: string; style?: 'normal' | 'italic'; format?: string }[];
  };
  colors: { name: string; hex: string }[];
  spacing?: { sizes: { px: number; rem: string }[] };
  components?: {
    buttons?: { label: string; variant?: 'primary' | 'secondary' | 'outline' }[];
    inputs?: { placeholder: string }[];
  };
  /** Optional extra assets (logos, icons, marks) shown in a gallery card */
  assets?: { url: string; name: string; kind?: 'logo' | 'icon' | 'image' }[];
}

export interface BannerBlock extends ContentBlockBase {
  type: 'banner';
  heading: string;
  subtext?: string;
  background_color?: string;
}

export type ContentBlock =
  | TextBlock
  | HeadingBlock
  | QuoteBlock
  | HeroImageBlock
  | ChallengeBlock
  | ImageShowcaseBlock
  | DesignSystemBlock
  | BannerBlock;

export type ContentBlockType = ContentBlock['type'];

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

export type LogoCategory = 'client' | 'award' | 'alliance' | 'media';

export const LOGO_CATEGORIES: { value: LogoCategory; label: string }[] = [
  { value: 'client', label: 'Clients' },
  { value: 'award', label: 'Awards' },
  { value: 'alliance', label: 'Alliances' },
  { value: 'media', label: 'Media' },
];

export interface CmsClientLogo {
  id: string;
  tenant_id: string;
  name: string;
  logo_url: string;
  website_url?: string | null;
  category?: LogoCategory;
  is_visible?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export type CmsSection = 'portfolio' | 'products' | 'blog' | 'logos';
export type CmsViewMode = 'grid' | 'list';
