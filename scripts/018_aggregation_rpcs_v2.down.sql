-- scripts/018_aggregation_rpcs_v2.down.sql
--
-- Restores the 3 RPCs to their 009 bodies (sourced from contract_analyses).
-- Not load-bearing for prod (no rollback after is_current=true per plan); kept
-- for local up/down testing only. Requires contract_analyses to exist — run
-- before 016's transaction-2 drop, or re-create the table.

\set ON_ERROR_STOP on

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
