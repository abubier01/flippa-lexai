-- scripts/021_lifecycle_sync.sql
--
-- Fix CRITICAL contract lifecycle regression.
--
-- The Tier 1 modular analysis cutover (016/017) moved analysis status to
-- analysis_runs but did not update contracts.{status,risk_score}. Multiple
-- surfaces still gate UI on contracts.status (app/contracts/[id]/page.tsx:45,
-- app/contracts/page.tsx:30, app/dashboard/page.tsx:107, scripts/018:120),
-- so contracts inserted as 'pending' never transition to 'completed' and
-- users remain stuck "Analyzing" forever after a successful run.
--
-- Strategy A (smaller blast radius): extend the publish-path RPCs to mirror
-- the lifecycle fields onto contracts in the same transaction.
--   * promote_analysis_run — sets contracts.status='completed' + risk_score
--   * fail_analysis_run    — new SECURITY DEFINER RPC, atomic
--                            analysis_runs.status='failed' + diagnostic append
--                            + contracts.status='failed'. Mirrors lib/analysis/
--                            repo.ts::failRun but in a single txn.

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- promote_analysis_run — extended to sync contracts.status + risk_score.
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
  v_risk_score  int;
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

  -- Coerce risk_score safely; if absent/non-numeric, store NULL rather than
  -- raising — the run itself is still valid output.
  BEGIN
    v_risk_score := (p_output->>'risk_score')::int;
  EXCEPTION WHEN others THEN
    v_risk_score := NULL;
  END;

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

  -- (3) Sync the denormalized contract pointer + lifecycle fields.
  UPDATE contracts
     SET current_run_id = p_run_id,
         status         = 'completed',
         risk_score     = v_risk_score,
         updated_at     = now()
   WHERE id = v_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_analysis_run(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_analysis_run(uuid, jsonb) TO service_role;

-- ============================================================================
-- fail_analysis_run — atomic failure path (run + contract together).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fail_analysis_run(
  p_run_id     uuid,
  p_diagnostic jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_id uuid;
  v_diagnostics jsonb;
BEGIN
  SELECT contract_id, diagnostics
    INTO v_contract_id, v_diagnostics
    FROM analysis_runs
   WHERE id = p_run_id;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'analysis_run % not found', p_run_id USING ERRCODE = 'P0002';
  END IF;

  IF v_diagnostics IS NULL OR jsonb_typeof(v_diagnostics) <> 'array' THEN
    v_diagnostics := '[]'::jsonb;
  END IF;

  UPDATE analysis_runs
     SET status       = 'failed',
         diagnostics  = v_diagnostics || jsonb_build_array(p_diagnostic),
         completed_at = now()
   WHERE id = p_run_id;

  UPDATE contracts
     SET status     = 'failed',
         updated_at = now()
   WHERE id = v_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_analysis_run(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_analysis_run(uuid, jsonb) TO service_role;

COMMIT;
