/**
 * Brand Kit types — mirror the `brands` / `brand_moodboard` /
 * `brand_references` tables from migrations/2026-06-04_brands.sql.
 *
 * A brand kit captures everything the AI needs to generate on-brand
 * content for one brand: visual palette, tone sliders, voice examples,
 * audience, hashtags, content rules, plus a compiled `brand_prompt`
 * that the AI uses directly in content generation.
 */

export type BrandStatus = 'draft' | 'active' | 'archived';

export type BrandReferenceType = 'post' | 'ad' | 'video' | 'website' | 'email' | 'other';

/** Hashtags grouped by platform — { linkedin: ['#x'], instagram: ['#y'] } */
export type BrandHashtags = Record<string, string[]>;

/** Free-form content rules (do's / don'ts / format constraints / etc.) */
export interface BrandContentRules {
  do?: string[];
  dont?: string[];
  formats?: string[];
  /** Any other freeform keys — let the AI consume them. */
  [key: string]: unknown;
}

export interface Brand {
  id: string;
  tenant_id: string;

  // Identity
  name: string;
  logo_url: string | null;
  logo_secondary_url: string | null;
  logo_icon_url: string | null;
  tagline: string | null;
  industry: string | null;
  website_url: string | null;
  description: string | null;

  // Visual palette
  color_primary: string | null;
  color_secondary: string | null;
  color_accent: string | null;
  color_background: string | null;
  color_text: string | null;
  font_heading: string | null;
  font_body: string | null;
  photo_style_tags: string[];

  // Voice & tone — 4 sliders 0-100
  tone_formal_casual: number;
  tone_technical_accessible: number;
  tone_serious_playful: number;
  tone_direct_storytelling: number;
  words_include: string[];
  words_exclude: string[];
  voice_examples: string[];
  personality: string | null;

  // Audience / content rules
  audience_description: string | null;
  hashtags: BrandHashtags;
  ctas: string[];
  content_rules: BrandContentRules;

  /** Compiled brand prompt — populated by `train_brand_style`. NULL until first train. */
  brand_prompt: string | null;

  status: BrandStatus;
  created_at: string;
  updated_at: string;
}

export interface BrandMoodboardItem {
  id: string;
  brand_id: string;
  tenant_id: string;
  image_url: string;
  source: string | null;
  source_url: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface BrandReference {
  id: string;
  brand_id: string;
  tenant_id: string;
  type: BrandReferenceType;
  platform: string | null;
  content_text: string | null;
  image_url: string | null;
  source_url: string | null;
  metrics: Record<string, number | string>;
  notes: string | null;
  created_at: string;
}

/**
 * Subset used when creating a brand — server defaults the rest.
 * The `tenant_id` is supplied by the hook (current tenant context).
 */
export type BrandInsert = Partial<Omit<Brand, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>> & {
  name: string;
};
