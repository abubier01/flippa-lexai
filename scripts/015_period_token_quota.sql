-- 015: period-token quota release
-- Fix: P0-4 from docs/audits/AUDIT_REPORT.md
--
-- Replaces the racy `release_monthly_contract()` with a period-token-guarded
-- version, and has `claim_monthly_contract(INT)` return the token it claimed
-- against. The period_token is a DATE (no time, no timezone) — tz-agnostic
-- by construction.
--
-- Preserved semantics from 007:
--   - SECURITY DEFINER binding to auth.uid() (never trust a caller-supplied id)
--   - p_limit = -1 means "unlimited" (always allowed)
--   - usage_reset_at NULL is treated as "month rolled over" (safe default)
--   - Counter resets when usage_reset_at's UTC month differs from now's UTC month

DROP FUNCTION IF EXISTS public.claim_monthly_contract(INT);
DROP FUNCTION IF EXISTS public.release_monthly_contract();

CREATE OR REPLACE FUNCTION public.claim_monthly_contract(p_limit INT)
RETURNS TABLE(allowed BOOLEAN, current_count INT, period_token DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_current_count INT;
  v_reset_at timestamptz;
  v_needs_reset BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claim_monthly_contract requires an authenticated caller';
  END IF;

  SELECT COALESCE(contracts_this_month, 0), usage_reset_at
    INTO v_current_count, v_reset_at
    FROM public.profiles
   WHERE id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    -- No profile row — nothing to claim against. Surface as denied with a
    -- zero count and the current month token rather than raising; callers
    -- already handle the denied path cleanly.
    RETURN QUERY SELECT
      false,
      0,
      (date_trunc('month', v_now AT TIME ZONE 'UTC'))::date;
    RETURN;
  END IF;

  -- Reset the counter if we've crossed a UTC month boundary, or if the
  -- timestamp is missing (legacy rows from migration 006).
  v_needs_reset := v_reset_at IS NULL
    OR date_trunc('month', v_reset_at AT TIME ZONE 'UTC')
       <> date_trunc('month', v_now AT TIME ZONE 'UTC');

  IF v_needs_reset THEN
    v_current_count := 0;
    v_reset_at := v_now;
  END IF;

  -- p_limit = -1 means unlimited.
  IF p_limit <> -1 AND v_current_count >= p_limit THEN
    -- Persist a reset if one was needed but we are still denying (so the
    -- bookkeeping reflects the new period even on a denied claim).
    IF v_needs_reset THEN
      UPDATE public.profiles
         SET contracts_this_month = 0,
             usage_reset_at = v_reset_at
       WHERE id = v_uid;
    END IF;
    RETURN QUERY SELECT
      false,
      v_current_count,
      (date_trunc('month', v_reset_at AT TIME ZONE 'UTC'))::date;
    RETURN;
  END IF;

  v_current_count := v_current_count + 1;

  UPDATE public.profiles
     SET contracts_this_month = v_current_count,
         usage_reset_at = v_reset_at
   WHERE id = v_uid;

  RETURN QUERY SELECT
    true,
    v_current_count,
    (date_trunc('month', v_reset_at AT TIME ZONE 'UTC'))::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_monthly_contract(p_expected_period DATE)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'release_monthly_contract requires an authenticated caller';
  END IF;

  WITH updated AS (
    UPDATE public.profiles
       SET contracts_this_month = GREATEST(0, COALESCE(contracts_this_month, 0) - 1)
     WHERE id = v_uid
       AND usage_reset_at IS NOT NULL
       AND (date_trunc('month', usage_reset_at AT TIME ZONE 'UTC'))::date = p_expected_period
    RETURNING id
  )
  SELECT count(*)::INT INTO v_updated FROM updated;
  RETURN COALESCE(v_updated, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_monthly_contract(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_monthly_contract(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_monthly_contract(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_monthly_contract(DATE) TO authenticated;
