-- scripts/021_lifecycle_sync.down.sql
-- Restore promote_analysis_run to its 017 definition and drop fail_analysis_run.

\set ON_ERROR_STOP on

BEGIN;

DROP FUNCTION IF EXISTS public.fail_analysis_run(uuid, jsonb);

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

  UPDATE analysis_runs
     SET is_current = false
   WHERE contract_id = v_contract_id
     AND is_current  = true
     AND id <> p_run_id;

  UPDATE analysis_runs
     SET is_current   = true,
         status       = 'completed',
         output       = p_output,
         completed_at = now()
   WHERE id = p_run_id;

  UPDATE contracts
     SET current_run_id = p_run_id
   WHERE id = v_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_analysis_run(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_analysis_run(uuid, jsonb) TO service_role;

COMMIT;
