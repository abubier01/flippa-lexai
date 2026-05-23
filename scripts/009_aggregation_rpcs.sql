-- 009_aggregation_rpcs.sql
-- SSR aggregation RPCs for the reports and dashboard pages.
--
-- These functions push aggregation work that previously happened in JS
-- (looping over full row sets after fetching from Supabase) down into
-- Postgres. Each function reads `auth.uid()` internally — never accept a
-- p_user_id parameter — and runs as SECURITY INVOKER so existing RLS on
-- contracts/contract_analyses continues to apply.
--
-- Idempotent: safe to re-run via the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Risk severity distribution across all of the caller's analyses.
-- Unrolls the JSONB `risks` array and buckets each risk into exactly three
-- severity bins: {high, medium, low}. NULL/unknown/other severities (e.g.
-- 'critical', 'info') all fall into 'low' to mirror the JS path in
-- app/reports/page.tsx, which does `if high … else if medium … else low`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_risk_distribution()
RETURNS TABLE(severity TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    CASE lower(r->>'severity')
      WHEN 'high'   THEN 'high'
      WHEN 'medium' THEN 'medium'
      ELSE 'low'
    END AS severity,
    COUNT(*)::BIGINT AS count
    FROM public.contract_analyses ca
    CROSS JOIN LATERAL jsonb_array_elements(ca.risks) AS r
   WHERE ca.user_id = auth.uid()
   GROUP BY CASE lower(r->>'severity')
     WHEN 'high'   THEN 'high'
     WHEN 'medium' THEN 'medium'
     ELSE 'low'
   END;
$$;

-- ---------------------------------------------------------------------------
-- Per-month contract counts for the trailing 12 months (caller-scoped).
-- Months with zero contracts are simply absent from the result — the caller
-- is expected to zero-fill in TS if it needs a dense series.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_monthly_contracts()
RETURNS TABLE(month TIMESTAMPTZ, count BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT date_trunc('month', created_at) AS month, COUNT(*)::BIGINT AS count
    FROM public.contracts
   WHERE user_id = auth.uid()
     AND created_at >= NOW() - INTERVAL '12 months'
   GROUP BY date_trunc('month', created_at)
   ORDER BY date_trunc('month', created_at);
$$;

-- ---------------------------------------------------------------------------
-- Per-contract risk scores for the caller, with the computed score derived
-- across all analyses for the contract. Mirrors `computeRiskScoreFromRisks`
-- in lib/risk-scoring.ts: average of severity weights (high=100, medium=55,
-- low=20, unknown=20), rounded to nearest integer, capped at 100. NULL when
-- the contract has no analyses (preserves the existing TS "no score" branch).
--
-- Aggregating across all analyses (not just the latest) matches the behavior
-- of the JS loop, which walked every analysis row for the contract.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_contract_risk_scores()
RETURNS TABLE(
  contract_id UUID,
  risk_score INTEGER,
  status TEXT,
  computed_risk_score INTEGER
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH per_contract AS (
    SELECT
      ca.contract_id,
      LEAST(
        100,
        ROUND(
          AVG(
            CASE lower(r->>'severity')
              WHEN 'high'   THEN 100
              WHEN 'medium' THEN 55
              WHEN 'low'    THEN 20
              -- NULL/unknown severities map to 20, mirroring `?? 20` in lib/risk-scoring.ts
              ELSE 20
            END
          )
        )
      )::INTEGER AS computed_risk_score
    FROM public.contract_analyses ca
    CROSS JOIN LATERAL jsonb_array_elements(ca.risks) AS r
    WHERE ca.user_id = auth.uid()
    GROUP BY ca.contract_id
  )
  SELECT
    c.id AS contract_id,
    c.risk_score,
    c.status,
    pc.computed_risk_score
  FROM public.contracts c
  LEFT JOIN per_contract pc ON pc.contract_id = c.id
  WHERE c.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Single-row summary used by the reports and dashboard pages so the entire
-- per-contract roll-up (counts + average + score buckets) happens in Postgres
-- instead of looping over `get_user_contract_risk_scores()` rows in JS.
--
-- Returns one row with:
--   total            — count of caller's contracts (any status)
--   completed_count  — count where status = 'completed'
--   high_risk_count  — completed contracts with effective_score >= 70
--   avg_risk_score   — ROUND(AVG(effective_score)) over completed; 0 if none
--   bucket_0_20      — completed contracts with effective_score in [0, 20]
--   bucket_21_40     — ...                                          (20, 40]
--   bucket_41_60     — ...                                          (40, 60]
--   bucket_61_80     — ...                                          (60, 80]
--   bucket_81_100    — ...                                          (80, ∞)
--
-- `effective_score` mirrors the TS chain `computed_risk_score ?? risk_score ?? 0`,
-- where `computed_risk_score` reuses the same CASE/AVG/LEAST construction as
-- `get_user_contract_risk_scores()` above. Bucket boundaries mirror the
-- if/else-if chain at app/reports/page.tsx (s <= 20, s <= 40, s <= 60,
-- s <= 80, else) — i.e. exact-20 lands in 0-20, exact-40 lands in 21-40, etc.
--
-- Even though we only ever return a single row, the function uses
-- `RETURNS TABLE(...)` for consistency with the other RPCs and so PostgREST
-- exposes it as an array of one row.
-- ---------------------------------------------------------------------------
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
      ca.contract_id,
      LEAST(
        100,
        ROUND(
          AVG(
            CASE lower(r->>'severity')
              WHEN 'high'   THEN 100
              WHEN 'medium' THEN 55
              WHEN 'low'    THEN 20
              ELSE 20
            END
          )
        )
      )::INTEGER AS computed_risk_score
    FROM public.contract_analyses ca
    CROSS JOIN LATERAL jsonb_array_elements(ca.risks) AS r
    WHERE ca.user_id = auth.uid()
    GROUP BY ca.contract_id
  ),
  scored AS (
    SELECT
      c.id,
      c.status,
      COALESCE(pc.computed_risk_score, c.risk_score, 0) AS effective_score
    FROM public.contracts c
    LEFT JOIN per_contract pc ON pc.contract_id = c.id
    WHERE c.user_id = auth.uid()
  )
  SELECT
    COUNT(*)::INTEGER                                                        AS total,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER                    AS completed_count,
    COUNT(*) FILTER (WHERE status = 'completed' AND effective_score >= 70)::INTEGER
                                                                             AS high_risk_count,
    COALESCE(
      ROUND(AVG(effective_score) FILTER (WHERE status = 'completed'))::INTEGER,
      0
    )                                                                        AS avg_risk_score,
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
  FROM scored;
$$;

-- ---------------------------------------------------------------------------
-- Supporting index for the monthly-contracts RPC and any user-scoped
-- listings that order by created_at DESC.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS contracts_user_id_created_at_idx
  ON public.contracts (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Grants: lock down to authenticated callers only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_user_risk_distribution()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_monthly_contracts()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_contract_risk_scores()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_contract_score_summary()   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_risk_distribution()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_monthly_contracts()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_contract_risk_scores()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_contract_score_summary()    TO authenticated;
