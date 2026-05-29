-- scripts/018_aggregation_rpcs_v2.sql
--
-- Tier 1 modular analysis cutover — Phase 4 RPC port.
--
-- Rewrites the 3 user-facing aggregation RPCs (originally defined in 009) to
-- read from contracts ⋈ analysis_runs (via contracts.current_run_id) instead
-- of the now-removed public.contract_analyses table. Function names + return
-- shapes are preserved verbatim so the 2 caller pages
-- (app/dashboard/page.tsx, app/reports/page.tsx) do not change.
--
-- Schema deltas vs. 009:
--   * Source: contract_analyses → contracts JOIN analysis_runs ON
--     ar.id = c.current_run_id (we only consider the CURRENT run per contract,
--     not "all analyses ever for this contract" — Tier 1 semantics).
--   * risk_score: pulled directly from (ar.output->>'risk_score')::int rather
--     than recomputed from severity averages. The model now emits an integer
--     band per the persona rubric; the JS severity-averaging logic in
--     lib/risk-scoring.ts is retired for Tier 1.
--   * Severity enum: v2 schema introduces 'critical' (was {low,medium,high}).
--     get_user_risk_distribution buckets 'critical' INTO 'high' to preserve
--     the existing 3-bin return shape (so the UI doesn't have to change in
--     Phase 4). The dashboard/reports UI can surface 'critical' separately
--     in a follow-up — out of Tier 1 scope.
--   * get_user_contract_risk_scores: computed_risk_score is the same column
--     as risk_score in Tier 1 (single source). Kept for back-compat with any
--     UI code that destructures `computed_risk_score`.
--   * get_user_contract_score_summary: high_risk_count threshold preserved
--     EXACTLY from 009 (>= 70, gated by status='completed'); bucket boundaries
--     preserved verbatim (s <= 20, s > 20 AND s <= 40, ...).
--
-- All 3 stay SECURITY INVOKER + STABLE so auth.uid() resolves to the caller
-- and analysis_runs_select RLS gates correctly.
--
-- get_user_monthly_contracts (also in 009) is unchanged — it only reads
-- public.contracts, never touched contract_analyses — and is intentionally
-- omitted here.

\set ON_ERROR_STOP on

-- ============================================================================
-- (1) get_user_risk_distribution — severity buckets across the caller's
--     CURRENT analysis runs.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_risk_distribution()
RETURNS TABLE(severity TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    CASE lower(r->>'severity')
      WHEN 'high'     THEN 'high'
      WHEN 'critical' THEN 'high'   -- v2 introduces 'critical'; bucket → 'high'
      WHEN 'medium'   THEN 'medium'
      ELSE 'low'
    END AS severity,
    COUNT(*)::BIGINT AS count
    FROM public.contracts c
    JOIN public.analysis_runs ar ON ar.id = c.current_run_id
    CROSS JOIN LATERAL jsonb_array_elements(ar.output -> 'risks') AS r
   WHERE c.user_id = auth.uid()
   GROUP BY 1;
$$;

-- ============================================================================
-- (2) get_user_contract_risk_scores — per-contract scores (caller-scoped).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_contract_risk_scores()
RETURNS TABLE(
  contract_id          UUID,
  risk_score           INTEGER,
  status               TEXT,
  computed_risk_score  INTEGER
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    c.id                                            AS contract_id,
    (ar.output->>'risk_score')::INTEGER             AS risk_score,
    c.status,
    -- Same source as risk_score in Tier 1; column kept for back-compat with
    -- existing UI consumers that destructure `computed_risk_score`.
    (ar.output->>'risk_score')::INTEGER             AS computed_risk_score
  FROM public.contracts c
  LEFT JOIN public.analysis_runs ar ON ar.id = c.current_run_id
  WHERE c.user_id = auth.uid();
$$;

-- ============================================================================
-- (3) get_user_contract_score_summary — single-row roll-up.
--
-- Boundaries preserved verbatim from 009:
--   high_risk_count:  status='completed' AND effective_score >= 70
--   buckets:          s <= 20, s > 20 AND s <= 40, s > 40 AND s <= 60,
--                     s > 60 AND s <= 80, s > 80 — gated by status='completed'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_contract_score_summary()
RETURNS TABLE(
  total           INTEGER,
  completed_count INTEGER,
  high_risk_count INTEGER,
  avg_risk_score  INTEGER,
  bucket_0_20     INTEGER,
  bucket_21_40    INTEGER,
  bucket_41_60    INTEGER,
  bucket_61_80    INTEGER,
  bucket_81_100   INTEGER
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH per_contract AS (
    SELECT
      c.id,
      c.status,
      -- Mirrors the TS chain `output.risk_score ?? c.risk_score ?? 0`. In
      -- Tier 1 c.risk_score is no longer written; current run's
      -- output->>'risk_score' is the source of truth.
      COALESCE((ar.output->>'risk_score')::INTEGER, c.risk_score, 0) AS effective_score
    FROM public.contracts c
    LEFT JOIN public.analysis_runs ar ON ar.id = c.current_run_id
    WHERE c.user_id = auth.uid()
  )
  SELECT
    COUNT(*)::INTEGER                                                            AS total,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER                        AS completed_count,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score >= 70)::INTEGER
                                                                                 AS high_risk_count,
    COALESCE(
      ROUND(AVG(effective_score) FILTER (WHERE status = 'completed'))::INTEGER,
      0
    )                                                                            AS avg_risk_score,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score <= 20)::INTEGER
                                                                                 AS bucket_0_20,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score > 20  AND effective_score <= 40)::INTEGER
                                                                                 AS bucket_21_40,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score > 40  AND effective_score <= 60)::INTEGER
                                                                                 AS bucket_41_60,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score > 60  AND effective_score <= 80)::INTEGER
                                                                                 AS bucket_61_80,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score > 80)::INTEGER
                                                                                 AS bucket_81_100
  FROM per_contract;
$$;

-- Re-apply grants (CREATE OR REPLACE preserves them, but be explicit).
REVOKE EXECUTE ON FUNCTION public.get_user_risk_distribution()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_contract_risk_scores()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_contract_score_summary()   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_risk_distribution()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_contract_risk_scores()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_contract_score_summary()    TO authenticated;
