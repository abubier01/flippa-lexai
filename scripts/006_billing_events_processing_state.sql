-- 006_billing_events_processing_state.sql
-- Hardens webhook deduplication with explicit processing state + lease recovery.

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','processed','failed')),
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE public.billing_events
SET status = 'processed'
WHERE processed_at IS NOT NULL;

UPDATE public.billing_events
SET status = 'failed'
WHERE processed_at IS NULL
  AND status = 'processing'
  AND processing_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS billing_events_status_idx ON public.billing_events(status);
CREATE INDEX IF NOT EXISTS billing_events_processing_expires_idx
  ON public.billing_events(processing_expires_at);
