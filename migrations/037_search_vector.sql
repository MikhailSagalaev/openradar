-- 037_search_vector.sql: Precomputed weighted search vector for high-performance full-text search

CREATE OR REPLACE FUNCTION leads_generate_search_vector(
    p_title TEXT,
    p_skills JSONB,
    p_direction TEXT,
    p_category TEXT,
    p_text TEXT
) RETURNS tsvector AS $$
DECLARE
    skills_text TEXT := '';
BEGIN
    IF p_skills IS NOT NULL AND jsonb_typeof(p_skills) = 'array' THEN
        SELECT COALESCE(string_agg(elem, ' '), '') INTO skills_text FROM jsonb_array_elements_text(p_skills) AS elem;
    END IF;
    RETURN (
        setweight(to_tsvector('russian', COALESCE(p_title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(p_title, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(skills_text, '')), 'B') ||
        setweight(to_tsvector('russian', COALESCE(p_direction, '') || ' ' || COALESCE(p_category, '')), 'B') ||
        setweight(to_tsvector('russian', left(COALESCE(p_text, ''), 2500)), 'C') ||
        setweight(to_tsvector('english', left(COALESCE(p_text, ''), 2500)), 'C')
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. Add search_vector column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Trigger function to keep search_vector automatically synced on INSERT / UPDATE
CREATE OR REPLACE FUNCTION leads_search_vector_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := leads_generate_search_vector(
        NEW.title,
        NEW.skills_json,
        NEW.direction,
        NEW.category,
        NEW.text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_search_vector ON leads;
CREATE TRIGGER trg_leads_search_vector
BEFORE INSERT OR UPDATE OF title, text, skills_json, direction, category
ON leads
FOR EACH ROW
EXECUTE FUNCTION leads_search_vector_trigger();

-- 3. Backfill existing active and recent leads
UPDATE leads
SET search_vector = leads_generate_search_vector(title, skills_json, direction, category, text)
WHERE search_vector IS NULL AND created_at >= NOW() - INTERVAL '60 days';

-- 4. Create GIN index
CREATE INDEX IF NOT EXISTS idx_leads_search_vector ON leads USING GIN(search_vector);
