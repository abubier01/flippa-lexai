-- Codify the out-of-band columns that production already has, so fresh
-- environments match. Safe to run on prod (IF NOT EXISTS is a no-op there).
--
-- IMPORTANT: nullability is intentionally permissive (NULL allowed) to match
-- the most likely prod state. The RPC in migration 007 reads these via
-- `contracts_this_month + 1` and `date_trunc('month', usage_reset_at)`, which
-- both return NULL on NULL input — and the CASE expression handles that by
-- treating "no usage_reset_at" as month-rolled-over (the safe default).
-- Code reads coerce with `?? 0` / `?? new Date()` already.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contracts_this_month INT DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS usage_reset_at TIMESTAMPTZ DEFAULT NOW();
