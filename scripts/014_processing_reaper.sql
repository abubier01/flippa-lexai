-- 014: stuck-processing reaper
-- Fix: P0-3 from docs/audits/AUDIT_REPORT.md
-- Adds processing_started_at marker + the RPC the cron route (Task 5) calls.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.reap_stuck_processing()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reaped_count INT;
BEGIN
  WITH updated AS (
    UPDATE public.contracts
       SET status = 'failed',
           processing_started_at = NULL,
           updated_at = now()
     WHERE status = 'processing'
       AND processing_started_at IS NOT NULL
       AND processing_started_at < now() - interval '10 minutes'
    RETURNING id
  )
  SELECT count(*) INTO reaped_count FROM updated;
  RETURN reaped_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reap_stuck_processing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reap_stuck_processing() TO service_role;
