-- =============================================================================
-- Migration: 003_editorial_agent.sql
-- Description: Autonomous editorial agent — dedicated tables + restricted role
--
-- The agent picks a lead story from the last 24h of articles, writes a short
-- Hebrew opinion column with transparent reasoning, and publishes it under
-- "נכתב אוטונומית על ידי סוכן AI". Because `articles` rows are pruned after
-- 7 days (see prune_old_articles() in 001_init.sql), the tables below SNAPSHOT
-- article data (title_he, url, source, category) rather than reference
-- article ids by foreign key — the agent's output must remain readable even
-- after the source articles are gone.
--
-- SECURITY MODEL
-- ---------------------------------------------------------------------------
-- The Supabase `service_role` key bypasses RLS entirely, so it CANNOT be used
-- as the isolation boundary for a semi-trusted, API-driven agent that should
-- only ever touch its own three tables. Instead we create a dedicated
-- Postgres role, `newshub_agent`, with narrowly scoped GRANTs, and enforce RLS
-- policies on top of those grants (RLS applies to any non-`service_role`
-- role, including this one).
--
-- HOW TO MINT THE AGENT JWT (SUPABASE_AGENT_KEY)
-- ---------------------------------------------------------------------------
-- 1. Supabase dashboard → Settings → API → copy the "JWT Secret".
-- 2. Sign a JWT with that secret containing at least:
--      { "role": "newshub_agent", "iss": "supabase" }
--    Give it a long expiry (e.g. 10 years) since this is a machine credential
--    used only by GitHub Actions, not a user session token. Example using the
--    `jsonwebtoken` npm package (run once, locally, never commit the output):
--
--      node -e "
--        const jwt = require('jsonwebtoken');
--        const token = jwt.sign(
--          { role: 'newshub_agent', iss: 'supabase' },
--          '<paste JWT Secret here>',
--          { expiresIn: '10y' }
--        );
--        console.log(token);
--      "
--
-- 3. Store the printed token as the `SUPABASE_AGENT_KEY` secret (GitHub Actions
--    repo secret + local .env.local for testing). agent/run.ts sends it ONLY as
--    the `Authorization: Bearer` header; the project's regular anon key is sent
--    as the `apikey` header (the gateway validates `apikey` against the
--    project's known keys, so the custom JWT alone would be rejected with 401
--    before ever reaching PostgREST). Never use the service role key here.
-- 4. PostgREST resolves the `role` claim in the JWT to the Postgres role of
--    the same name via the `authenticator` role's GRANT chain (see below),
--    so requests made with this token run as `newshub_agent` and are subject
--    to the RLS policies defined here.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- TABLE: agent_columns
-- One row per published (or draft) opinion column written by the agent.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_columns (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Groups this column with its agent_decision_log row (same run_id).
    run_id          UUID        NOT NULL,

    -- Hebrew title of the column.
    title_he        TEXT        NOT NULL,

    -- Hebrew body, 200-350 words (validated by the agent before insert).
    body_he         TEXT        NOT NULL,

    -- Snapshot of the 2-3 source articles cited, so the column remains
    -- self-contained after the underlying `articles` rows are pruned.
    -- Shape: [{ "title_he": string, "url": string, "source": string, "category": string }, ...]
    source_refs     JSONB       NOT NULL DEFAULT '[]',

    -- Category of the chosen lead story (one of the six article categories).
    category        TEXT,

    -- Model id used to write this column, e.g. "claude-sonnet-5".
    model           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Publication gate. Defaults to false — see "week-1 silent mode" note in
    -- agent/run.ts. Flip to true manually (or via a future review step) to
    -- surface the column in the public UI.
    published       BOOLEAN     NOT NULL DEFAULT false
);

COMMENT ON TABLE  agent_columns              IS 'Opinion columns written autonomously by the editorial AI agent';
COMMENT ON COLUMN agent_columns.run_id       IS 'Correlates this column with its agent_decision_log row';
COMMENT ON COLUMN agent_columns.title_he     IS 'Hebrew column title';
COMMENT ON COLUMN agent_columns.body_he      IS 'Hebrew column body, 200-350 words';
COMMENT ON COLUMN agent_columns.source_refs  IS 'Snapshot array of {title_he, url, source, category} for cited sources';
COMMENT ON COLUMN agent_columns.category     IS 'Category of the chosen lead story';
COMMENT ON COLUMN agent_columns.model        IS 'Claude model id used to generate this column';
COMMENT ON COLUMN agent_columns.published    IS 'Gate for public visibility — defaults false (silent mode)';


-- ---------------------------------------------------------------------------
-- TABLE: agent_decision_log
-- One row per agent run — records what was considered, what was chosen, and
-- why, in Hebrew. Powers a transparency / "how did it decide?" page.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_decision_log (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Correlates with agent_columns.run_id (1:1 per successful run).
    run_id                  UUID        NOT NULL,

    -- Every candidate story the agent considered before choosing.
    -- Shape: [{ "title_he": string, "url": string, "source": string, "category": string, "note": string }, ...]
    candidates_considered   JSONB       NOT NULL DEFAULT '[]',

    -- The story the agent chose. Shape: { "title_he": string, "url": string, "source": string, "category": string }
    chosen                  JSONB,

    -- Free-text Hebrew explanation of why this story was chosen over the rest.
    reasoning_he            TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  agent_decision_log                     IS 'Per-run transparency log: candidates considered + reasoning, in Hebrew';
COMMENT ON COLUMN agent_decision_log.run_id              IS 'Correlates this log row with its agent_columns row';
COMMENT ON COLUMN agent_decision_log.candidates_considered IS 'Array of {title_he, url, source, category, note} — capped at 40 entries';
COMMENT ON COLUMN agent_decision_log.chosen               IS 'The chosen story: {title_he, url, source, category}';
COMMENT ON COLUMN agent_decision_log.reasoning_he         IS 'Transparent Hebrew reasoning for the choice';


-- ---------------------------------------------------------------------------
-- TABLE: agent_memory
-- Single-row (id=1) running memory the agent reads and updates every run —
-- e.g. "don't repeat the same angle two runs in a row", style notes, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_memory (
    id          INT         PRIMARY KEY,
    content     TEXT        NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  agent_memory             IS 'Single-row (id=1) persistent memory the agent reads/updates each run';
COMMENT ON COLUMN agent_memory.content     IS 'Free-text memory content, <=1500 chars, rewritten by the agent each run';

-- Seed the single memory row.
INSERT INTO agent_memory (id, content)
VALUES (1, '')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- Public/archive read pattern: published columns newest-first.
CREATE INDEX IF NOT EXISTS idx_agent_columns_published_created
    ON agent_columns (published, created_at DESC);

-- Join column <-> decision log by run_id.
CREATE INDEX IF NOT EXISTS idx_agent_columns_run_id
    ON agent_columns (run_id);

CREATE INDEX IF NOT EXISTS idx_agent_decision_log_run_id
    ON agent_decision_log (run_id);

CREATE INDEX IF NOT EXISTS idx_agent_decision_log_created
    ON agent_decision_log (created_at DESC);


-- ---------------------------------------------------------------------------
-- RESTRICTED ROLE: newshub_agent
-- A dedicated, narrowly-scoped Postgres role for the editorial agent. Unlike
-- service_role, this role is subject to RLS, and its GRANTs are the only
-- tables/operations it can ever touch — by design, it has zero code/repo
-- write access and cannot modify `articles` or any other table.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'newshub_agent') THEN
        CREATE ROLE newshub_agent NOLOGIN;
    END IF;
END
$$;

-- Let PostgREST's `authenticator` role switch into newshub_agent for requests
-- authenticated with a JWT whose `role` claim is "newshub_agent".
GRANT newshub_agent TO authenticator;

-- Schema usage is required before any table-level GRANT takes effect.
GRANT USAGE ON SCHEMA public TO newshub_agent;

-- Read-only access to the news firehose — the agent picks its lead story
-- from here but can never modify it.
GRANT SELECT ON articles TO newshub_agent;

-- Agent can create its own columns and decision-log entries, and read them
-- back (e.g. to check for duplicates across runs), but never update/delete —
-- every run's output is immutable once written.
GRANT SELECT, INSERT ON agent_columns TO newshub_agent;
GRANT SELECT, INSERT ON agent_decision_log TO newshub_agent;

-- Memory is the one place the agent updates in place (single row, id=1).
GRANT SELECT, INSERT, UPDATE ON agent_memory TO newshub_agent;


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE agent_columns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decision_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory        ENABLE ROW LEVEL SECURITY;

-- ── Public (anon) policies ──────────────────────────────────────────────────

-- Anonymous visitors only ever see published columns.
CREATE POLICY "anon_select_published_agent_columns"
    ON agent_columns
    FOR SELECT
    TO anon
    USING (published = true);

-- The decision log is fully public — it's the transparency mechanism behind
-- the "איך הוא החליט?" ("how did it decide?") page, and reasoning for
-- unpublished/rejected runs is also meant to be inspectable.
CREATE POLICY "anon_select_agent_decision_log"
    ON agent_decision_log
    FOR SELECT
    TO anon
    USING (true);

-- No anon policy on agent_memory — it's an internal working-memory scratchpad
-- for the agent, not user-facing content.

-- ── newshub_agent policies ──────────────────────────────────────────────────
-- RLS applies to this role (it is not service_role), so explicit permissive
-- policies are required for every operation granted above.

-- `articles` has RLS enabled (001_init.sql) and GRANTs and RLS are independent
-- gates — without this policy the GRANT SELECT above returns zero rows.
CREATE POLICY "agent_select_articles"
    ON articles
    FOR SELECT
    TO newshub_agent
    USING (true);

CREATE POLICY "agent_select_agent_columns"
    ON agent_columns
    FOR SELECT
    TO newshub_agent
    USING (true);

CREATE POLICY "agent_insert_agent_columns"
    ON agent_columns
    FOR INSERT
    TO newshub_agent
    WITH CHECK (true);

CREATE POLICY "agent_select_agent_decision_log"
    ON agent_decision_log
    FOR SELECT
    TO newshub_agent
    USING (true);

CREATE POLICY "agent_insert_agent_decision_log"
    ON agent_decision_log
    FOR INSERT
    TO newshub_agent
    WITH CHECK (true);

CREATE POLICY "agent_select_agent_memory"
    ON agent_memory
    FOR SELECT
    TO newshub_agent
    USING (true);

CREATE POLICY "agent_insert_agent_memory"
    ON agent_memory
    FOR INSERT
    TO newshub_agent
    WITH CHECK (true);

CREATE POLICY "agent_update_agent_memory"
    ON agent_memory
    FOR UPDATE
    TO newshub_agent
    USING (true)
    WITH CHECK (true);
