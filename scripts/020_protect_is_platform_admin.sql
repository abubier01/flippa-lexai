-- scripts/020_protect_is_platform_admin.sql
--
-- Fix CRITICAL self-escalation: profiles.is_platform_admin was added in 016
-- but the existing column-protection trigger (guard_profile_billing_columns,
-- scripts/005:74) only guards plan + stripe_customer_id. Worse: the role check
-- in 005 reads `current_setting('request.jwt.claim.role', true)` — a legacy
-- PostgREST GUC that modern Supabase/PostgREST no longer populates. Modern
-- PostgREST writes `request.jwt.claims` (JSON) and switches the Postgres role
-- to `authenticated` | `anon` | `service_role`.
--
-- Result of the old guard: BOTH plan and stripe_customer_id were also writable
-- by authenticated users (confirmed empirically). is_platform_admin missing
-- from the column list compounded the issue.
--
-- This migration:
--   1. Replaces the role-detection mechanism with `current_user` (the Postgres
--      role PostgREST switched to) — bullet-proof against future PostgREST
--      GUC churn.
--   2. Adds is_platform_admin to the guarded column list.
--   3. Keeps a defensive bypass for direct DB connections (postgres /
--      supabase_admin) used by migrations and reaper scripts.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_profile_billing_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Bypass when the caller is the service role (webhook handlers) or a
  -- privileged DB role (migrations, admin scripts). PostgREST sets the role
  -- via SET ROLE before executing the request body, so current_user is the
  -- authoritative signal.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'profiles.plan is not user-writable';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'profiles.stripe_customer_id is not user-writable';
  END IF;
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    RAISE EXCEPTION 'profiles.is_platform_admin is not user-writable';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
