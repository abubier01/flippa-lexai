-- Backfill legacy profiles that still store the old free-tier label.
-- Safe to run multiple times.
UPDATE public.profiles
SET plan = 'solo'
WHERE plan = 'free';
