-- scripts/020_protect_is_platform_admin.down.sql
-- Revert the is_platform_admin guard. Note: we do NOT restore the broken
-- legacy `request.jwt.claim.role` check — that was a latent vuln. Down
-- keeps the working current_user-based check but only for plan +
-- stripe_customer_id (matching what 005 intended to guard).

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_profile_billing_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'profiles.plan is not user-writable';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'profiles.stripe_customer_id is not user-writable';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
