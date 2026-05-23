-- Atomic claim-and-increment for the monthly quota.
-- Returns (allowed, current_count). Resets the counter if the month rolled over.
--
-- IMPORTANT: this function deliberately reads `auth.uid()` internally rather
-- than accepting a user ID as a parameter. Combined with SECURITY DEFINER,
-- accepting a user_id parameter would let any caller pass another user's UUID
-- and silently mutate their counter. By binding to auth.uid(), the function
-- can only ever touch the caller's own row.
CREATE OR REPLACE FUNCTION public.claim_monthly_contract(p_limit INT)
RETURNS TABLE(allowed BOOLEAN, current_count INT) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_now TIMESTAMPTZ := NOW();
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claim_monthly_contract requires an authenticated caller';
  END IF;

  -- Single statement does reset-if-needed + conditional increment atomically.
  -- COALESCE handles legacy rows where the columns may be NULL (the migration
  -- 006 columns are nullable to match prod schema; see that migration's notes).
  -- A NULL usage_reset_at is treated as "month rolled over" — the safe default.
  UPDATE public.profiles
     SET
       contracts_this_month = CASE
         WHEN date_trunc('month', COALESCE(usage_reset_at, 'epoch'::timestamptz)) < date_trunc('month', v_now)
         THEN 1
         ELSE COALESCE(contracts_this_month, 0) + 1
       END,
       usage_reset_at = CASE
         WHEN date_trunc('month', COALESCE(usage_reset_at, 'epoch'::timestamptz)) < date_trunc('month', v_now)
         THEN v_now
         ELSE usage_reset_at
       END
   WHERE id = v_uid
     AND (
       p_limit = -1
       OR date_trunc('month', COALESCE(usage_reset_at, 'epoch'::timestamptz)) < date_trunc('month', v_now)
       OR COALESCE(contracts_this_month, 0) < p_limit
     )
  RETURNING contracts_this_month INTO v_count;

  IF v_count IS NULL THEN
    SELECT COALESCE(contracts_this_month, 0) INTO v_count
      FROM public.profiles WHERE id = v_uid;
    RETURN QUERY SELECT FALSE, COALESCE(v_count, 0);
  END IF;

  RETURN QUERY SELECT TRUE, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Decrement for rollback when the upload itself fails after a successful claim.
-- Same auth.uid() binding as claim_monthly_contract — never trust a parameter.
CREATE OR REPLACE FUNCTION public.release_monthly_contract()
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'release_monthly_contract requires an authenticated caller';
  END IF;
  UPDATE public.profiles
     SET contracts_this_month = GREATEST(0, COALESCE(contracts_this_month, 0) - 1)
   WHERE id = v_uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to authenticated users only.
REVOKE EXECUTE ON FUNCTION public.claim_monthly_contract(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_monthly_contract() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_monthly_contract(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_monthly_contract() TO authenticated;
