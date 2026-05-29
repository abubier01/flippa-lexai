-- 019: check_current_run_invariants RPC
--
-- Tier 1 modular analysis — P7.3 (weekly invariant cron).
-- Wraps the drift query from scripts/_checks/current_run_invariants.sql as a
-- SECURITY DEFINER function so the cron route can call it via supabase.rpc()
-- (Supabase JS doesn't trivially run multi-statement SQL).
--
-- Returns ZERO rows on a healthy DB. Each row = one invariant violation.
--
-- Checks:
--   1. pointer_not_current — contracts.current_run_id → run with is_current=false
--   2. pointer_missing_or_mismatch — is_current run exists, pointer disagrees
--   3. multiple_current — > 1 is_current=true rows per contract

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public.check_current_run_invariants()
RETURNS TABLE(kind text, contract_id uuid, run_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- (1) Pointer points to a non-current run.
  SELECT 'pointer_not_current'::text AS kind,
         c.id                        AS contract_id,
         c.current_run_id            AS run_id
    FROM contracts c
    JOIN analysis_runs ar ON ar.id = c.current_run_id
   WHERE ar.is_current = false

  UNION ALL

  -- (2) is_current run exists but pointer disagrees.
  SELECT 'pointer_missing_or_mismatch'::text AS kind,
         c.id                                AS contract_id,
         ar.id                               AS run_id
    FROM contracts c
    JOIN analysis_runs ar
      ON ar.contract_id = c.id
     AND ar.is_current  = true
   WHERE c.current_run_id IS DISTINCT FROM ar.id

  UNION ALL

  -- (3) More than one current run per contract.
  SELECT 'multiple_current'::text AS kind,
         ar.contract_id           AS contract_id,
         NULL::uuid               AS run_id
    FROM analysis_runs ar
   WHERE ar.is_current = true
   GROUP BY ar.contract_id
  HAVING count(*) > 1;
$$;

REVOKE EXECUTE ON FUNCTION public.check_current_run_invariants() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_current_run_invariants() TO service_role;

COMMIT;
