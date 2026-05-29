-- scripts/016_persona_and_analysis_runs.down.sql
--
-- Inverse of 016_persona_and_analysis_runs.sql. Failed-Phase-4 unwind only.
-- Data is NOT restored — spec confirms no production data on contract_analyses.
-- Order: reverse of up. Drop policies → drop indexes → drop tables (CASCADE
-- where FKs require it) → recreate empty contract_analyses shell.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Drop in reverse FK order. contracts.current_run_id → analysis_runs(id);
-- analysis_runs.persona_version_id → persona_versions(id);
-- personas.current_version_id ↔ persona_versions.
-- ---------------------------------------------------------------------------

-- Drop ALL policies first — persona_versions_select_via_run references
-- analysis_runs, so it must go before analysis_runs drops.
DROP POLICY IF EXISTS persona_versions_select_via_run ON persona_versions;
DROP POLICY IF EXISTS persona_versions_admin_all     ON persona_versions;
DROP POLICY IF EXISTS personas_admin_all             ON personas;
DROP POLICY IF EXISTS analysis_runs_select           ON analysis_runs;

-- Remove the read pointer next so analysis_runs can drop cleanly.
ALTER TABLE contracts DROP COLUMN IF EXISTS current_run_id;

DROP INDEX IF EXISTS analysis_runs_one_current_per_contract;
DROP TABLE IF EXISTS analysis_runs;

-- personas ↔ persona_versions circular FK — break it before dropping tables.
ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_current_version_fk;

DROP INDEX IF EXISTS persona_versions_one_draft_per_persona;
DROP TABLE IF EXISTS persona_versions;
DROP TABLE IF EXISTS personas;

-- Remove the admin flag column added at the head of the up migration.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_platform_admin;

-- ---------------------------------------------------------------------------
-- Recreate empty contract_analyses shell (columns from scripts/001_create_schema.sql).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT,
  key_points JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  clauses JSONB DEFAULT '{}',
  suggestions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contract_analyses ENABLE ROW LEVEL SECURITY;

-- Policies recreated idempotently — re-running the down migration must not
-- error if the legacy table + policies were already restored.
DROP POLICY IF EXISTS "analyses_select_own" ON public.contract_analyses;
DROP POLICY IF EXISTS "analyses_insert_own" ON public.contract_analyses;
DROP POLICY IF EXISTS "analyses_update_own" ON public.contract_analyses;
DROP POLICY IF EXISTS "analyses_delete_own" ON public.contract_analyses;
CREATE POLICY "analyses_select_own" ON public.contract_analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "analyses_insert_own" ON public.contract_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "analyses_update_own" ON public.contract_analyses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "analyses_delete_own" ON public.contract_analyses FOR DELETE USING (auth.uid() = user_id);

COMMIT;
