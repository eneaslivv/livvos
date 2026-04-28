-- =============================================
-- AI FEEDBACK LOOP (Phase 2 + 3 substrate)
-- =============================================
-- Stores every successful AI output along with its embedding so we can:
--   1. Capture explicit feedback (thumbs up/down + correction text)
--   2. Retrieve top-N similar past outputs with positive feedback as few-shot
--      examples in future requests of the same type.
--
-- Embedding model: text-embedding-3-small (1536 dims). Cost: ~$0.02 per 1M
-- tokens, ~$0.0001 per typical request. Cheap enough to embed every output.

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── ai_output_log ──────────────────────────────────────────────
-- One row per successful AI response. Fed by the gemini Edge Function.

CREATE TABLE IF NOT EXISTS ai_output_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    request_type TEXT NOT NULL,                 -- 'task' | 'proposal' | 'blog' | etc.
    input_text TEXT NOT NULL,                   -- raw input string
    input_hash TEXT NOT NULL,                   -- hash of input for fast dedup lookup
    output_json JSONB NOT NULL,                 -- the validated AI response
    embedding vector(1536),                     -- nullable: backfilled async if embedding fails
    tokens_input INT,
    tokens_output INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_output_log_tenant_type ON ai_output_log(tenant_id, request_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_output_log_hash ON ai_output_log(input_hash);

-- HNSW index for fast cosine-similarity search. Created only if there's data
-- (HNSW on empty table is fine but the comment notes that for prod-scale
-- consider lower m/ef_construction tradeoffs).
CREATE INDEX IF NOT EXISTS idx_ai_output_log_embedding
    ON ai_output_log
    USING hnsw (embedding vector_cosine_ops);

-- ─── ai_feedback ────────────────────────────────────────────────
-- Explicit user feedback on a logged output. One row per user vote.
-- Multiple rows per output_id allowed (different users in same tenant) but
-- a single user can only have one rating per output (UNIQUE constraint below).

CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    output_id UUID NOT NULL REFERENCES ai_output_log(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating IN (-1, 0, 1)),  -- -1 thumbs down | 0 neutral | 1 thumbs up
    correction TEXT,                                          -- optional text: "should have used a friendlier tone"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (output_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_output ON ai_feedback(output_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_tenant ON ai_feedback(tenant_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_feedback_updated_at ON ai_feedback;
CREATE TRIGGER trg_ai_feedback_updated_at
    BEFORE UPDATE ON ai_feedback
    FOR EACH ROW EXECUTE FUNCTION update_ai_feedback_updated_at();

-- =============================================
-- RPC: search_similar_ai_outputs
-- =============================================
-- Returns top-N past outputs of the same request_type from the SAME tenant,
-- with positive feedback (rating > 0), ranked by cosine similarity to the
-- query embedding. Used by the Edge Function as few-shot retrieval.
--
-- Filters:
--   - tenant_id: only the calling tenant's outputs (privacy)
--   - request_type: same feature (task examples for task, blog for blog, etc.)
--   - has_positive_feedback: at least 1 thumbs-up; we don't want to imitate failures
--   - similarity threshold (>= 0.5): if no past examples are close enough,
--     return empty rather than injecting irrelevant noise.

CREATE OR REPLACE FUNCTION search_similar_ai_outputs(
    p_tenant_id UUID,
    p_request_type TEXT,
    p_query_embedding vector(1536),
    p_limit INT DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    input_text TEXT,
    output_json JSONB,
    similarity REAL,
    avg_rating NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ol.id,
        ol.input_text,
        ol.output_json,
        (1 - (ol.embedding <=> p_query_embedding))::REAL AS similarity,
        AVG(fb.rating)::NUMERIC AS avg_rating
    FROM ai_output_log ol
    INNER JOIN ai_feedback fb ON fb.output_id = ol.id
    WHERE ol.tenant_id = p_tenant_id
      AND ol.request_type = p_request_type
      AND ol.embedding IS NOT NULL
    GROUP BY ol.id, ol.input_text, ol.output_json, ol.embedding
    HAVING AVG(fb.rating) > 0
       AND (1 - (ol.embedding <=> p_query_embedding)) >= 0.5
    ORDER BY ol.embedding <=> p_query_embedding ASC
    LIMIT p_limit;
$$;

-- =============================================
-- RLS
-- =============================================

ALTER TABLE ai_output_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

-- ai_output_log: tenant members can read their own logs (transparency).
-- Writes go through Edge Function (service role), no client INSERT needed.
DROP POLICY IF EXISTS "Tenant members read own AI output log" ON ai_output_log;
CREATE POLICY "Tenant members read own AI output log"
    ON ai_output_log FOR SELECT
    USING (
        tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    );

-- ai_feedback: tenant members can read their tenant's feedback and write their own
DROP POLICY IF EXISTS "Tenant members read own AI feedback" ON ai_feedback;
CREATE POLICY "Tenant members read own AI feedback"
    ON ai_feedback FOR SELECT
    USING (
        tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Tenant members create own AI feedback" ON ai_feedback;
CREATE POLICY "Tenant members create own AI feedback"
    ON ai_feedback FOR INSERT
    WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        AND user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Tenant members update own AI feedback" ON ai_feedback;
CREATE POLICY "Tenant members update own AI feedback"
    ON ai_feedback FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Tenant members delete own AI feedback" ON ai_feedback;
CREATE POLICY "Tenant members delete own AI feedback"
    ON ai_feedback FOR DELETE
    USING (user_id = auth.uid());

-- Sanity log
DO $$
BEGIN
    RAISE NOTICE 'AI feedback loop migration complete';
END $$;
