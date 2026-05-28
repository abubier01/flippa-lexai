-- scripts/_checks/current_run_invariants.sql
--
-- Drift-detection query for the weekly invariant cron (plan § G, P7.3).
-- Three checks; expected result: ZERO ROWS on a healthy DB.
--
--   1. contracts.current_run_id points to a run that is not is_current=true.
--   2. A contract has an is_current run but contracts.current_run_id is
--      null or mismatched.
--   3. A contract has > 1 is_current=true rows. (Impossible under the
--      partial unique index analysis_runs_one_current_per_contract, but
--      cheap to check — guards against accidental index drop.)

-- (1) Pointer points to a non-current run.
SELECT 'pointer_not_current' AS kind,
       c.id                  AS contract_id,
       c.current_run_id      AS run_id
  FROM contracts c
  JOIN analysis_runs ar ON ar.id = c.current_run_id
 WHERE ar.is_current = false

UNION ALL

-- (2) is_current run exists but pointer disagrees.
SELECT 'pointer_missing_or_mismatch' AS kind,
       c.id                          AS contract_id,
       ar.id                         AS run_id
  FROM contracts c
  JOIN analysis_runs ar
    ON ar.contract_id = c.id
   AND ar.is_current  = true
 WHERE c.current_run_id IS DISTINCT FROM ar.id

UNION ALL

-- (3) More than one current run per contract.
SELECT 'multiple_current' AS kind,
       ar.contract_id     AS contract_id,
       NULL::uuid         AS run_id
  FROM analysis_runs ar
 WHERE ar.is_current = true
 GROUP BY ar.contract_id
HAVING count(*) > 1;
