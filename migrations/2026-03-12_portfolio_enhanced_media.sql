-- =============================================
-- Portfolio: enhanced media, content blocks, multiple colors
-- =============================================

-- JSONB media gallery with type + cover flag
-- Structure: [{url, type: "image"|"video"|"gif", is_cover: bool, caption?: string}]
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

-- Dynamic content blocks
-- Structure: [{type: "text"|"heading"|"quote", content: string, sort_order: int}]
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]'::jsonb;

-- Multiple accent colors
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}';

NOTIFY pgrst, 'reload config';
