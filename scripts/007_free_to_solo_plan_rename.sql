-- 007_free_to_solo_plan_rename.sql
-- Renames base plan literals from free -> solo in profiles/subscriptions.

-- Defensive data rewrite (expected zero rows in greenfield).
UPDATE public.profiles
SET plan = 'solo'
WHERE plan = 'free';

UPDATE public.subscriptions
SET plan = 'solo'
WHERE plan = 'free';

-- Default for newly created profiles.
ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'solo';

-- Normalize plan checks on both tables.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('solo', 'pro', 'team'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('solo', 'pro', 'team'));
