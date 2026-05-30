-- scripts/017_admin_rpcs.sql
--
-- Phase 3 — race-safe SECURITY DEFINER RPCs for the publish path.
--
-- Two functions:
--   * promote_analysis_run(p_run_id uuid, p_output jsonb)
--       Atomically demote any prior current run for the same contract, promote
--       p_run_id (set is_current=true, status='completed', output, completed_at),
--       and sync contracts.current_run_id. Caller (lib/analysis/repo.ts) retries
--       on 23505 unique_violation per spec § Publish Mechanics.
--
--   * publish_persona_draft(p_persona_id text, p_user_id uuid)
--       Atomically promote the persona draft row → published. Computes
--       version_number = max(published version_number) + 1. The caller
--       (lib/persona/repo.ts) sets content_hash before calling so canonical
--       serialization stays in TS. Returns the published row id.
--
-- Both run as SECURITY DEFINER so they bypass RLS — they're invoked via
-- service_role from server-only paths.

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- promote_analysis_run — single-transaction publish for analysis_runs.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.promote_analysis_run(
  p_run_id uuid,
  p_output jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_id uuid;
BEGIN
  SELECT contract_id INTO v_contract_id
    FROM analysis_runs
   WHERE id = p_run_id;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'analysis_run % not found', p_run_id USING ERRCODE = 'P0002';
  END IF;

  -- Serialize promotes per-contract to avoid pointer/update races under
  -- concurrent publish attempts.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(replace(v_contract_id::text, '-', ''), 1, 16))::bit(64)::bigint
  );

  -- (1) Demote the prior current run (if any) for the same contract.
  UPDATE analysis_runs
     SET is_current = false
   WHERE contract_id = v_contract_id
     AND is_current  = true
     AND id <> p_run_id;

  -- (2) Promote this run.
  UPDATE analysis_runs
     SET is_current   = true,
         status       = 'completed',
         output       = p_output,
         completed_at = now()
   WHERE id = p_run_id;

  -- (3) Sync the denormalized contract pointer.
  UPDATE contracts
     SET current_run_id = p_run_id
   WHERE id = v_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_analysis_run(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_analysis_run(uuid, jsonb) TO service_role;

-- ============================================================================
-- publish_persona_draft — single-transaction draft → published flip.
--
-- Caller is responsible for:
--   * validating the draft content (Zod PersonaSchema) before invoking;
--   * computing content_hash from canonical serialization and writing it via
--     an UPDATE on persona_versions BEFORE this RPC (or pass it as part of a
--     wrapper). We do NOT recompute the hash in SQL — canonical serialization
--     lives in TS (lib/prompt/compile.ts canonicalSerializePersona).
--
-- This function only handles the atomic flip:
--   * Locate the single draft row (FOR UPDATE to serialize concurrent calls).
--   * Compute next version_number = coalesce(max(published version_number), 0)+1.
--   * UPDATE the row: status='published', version_number, published_at, published_by.
--   * UPDATE personas.current_version_id.
-- Returns the published row id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publish_persona_draft(
  p_persona_id text,
  p_user_id    uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft_id uuid;
  v_next_version int;
BEGIN
  SET LOCAL lock_timeout = '5s';

  -- Lock the draft row to serialize concurrent publish calls for the same persona.
  SELECT id INTO v_draft_id
    FROM persona_versions
   WHERE persona_id = p_persona_id
     AND status     = 'draft'
   FOR UPDATE;

  IF v_draft_id IS NULL THEN
    RAISE EXCEPTION 'no draft to publish for persona %', p_persona_id USING ERRCODE = 'P0002';
  END IF;

  -- Next monotonic version_number for this persona's published series.
  SELECT coalesce(max(version_number), 0) + 1
    INTO v_next_version
    FROM persona_versions
   WHERE persona_id = p_persona_id
     AND status     = 'published';

  UPDATE persona_versions
     SET status         = 'published',
         version_number = v_next_version,
         published_at   = now(),
         published_by   = p_user_id
   WHERE id = v_draft_id;

  UPDATE personas
     SET current_version_id = v_draft_id,
         updated_at         = now()
   WHERE id = p_persona_id;

  RETURN v_draft_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_persona_draft(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_persona_draft(text, uuid) TO service_role;

COMMIT;
