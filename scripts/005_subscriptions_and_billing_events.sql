-- 005_subscriptions_and_billing_events.sql
-- Adds Stripe subscription tracking and webhook event dedup.

-- A) Add Stripe customer ID to profiles. We keep the existing `plan` column as a
-- denormalized read cache; subscriptions is the source of truth.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- B) The subscriptions table mirrors Stripe Subscription objects.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,                 -- Stripe subscription ID (sub_...)
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'trialing','active','past_due','canceled',
    'incomplete','incomplete_expired','unpaid','paused'
  )),
  plan TEXT NOT NULL CHECK (plan IN ('pro','team')),
  price_id TEXT NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx
  ON public.subscriptions(stripe_customer_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
-- Users can read their own subscription row. No INSERT/UPDATE/DELETE policy —
-- only the service role (webhook handler) writes to this table.
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- C) billing_events is the idempotency log keyed on Stripe event.id.
CREATE TABLE IF NOT EXISTS public.billing_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS billing_events_user_id_idx ON public.billing_events(user_id);
CREATE INDEX IF NOT EXISTS billing_events_type_idx ON public.billing_events(type);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access. Users cannot read or write.

-- D) Lock down profiles columns the user must not be able to self-mutate.
-- The existing profiles_update_own policy allows the user to UPDATE any column
-- on their own row. That's a privilege escalation risk for the new billing
-- columns and for plan. Replace it with a column-restricted policy.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own_safe"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- We rely on the application + service role for plan and
    -- stripe_customer_id writes. Postgres RLS doesn't natively gate by
    -- column on the new value, so we add a trigger below.
  );

-- Trigger: reject user-initiated UPDATEs that change plan or stripe_customer_id.
-- Service-role webhook writes bypass via the role check below.
-- Authenticated/anon UPDATEs from app code will hit this guard.
CREATE OR REPLACE FUNCTION public.guard_profile_billing_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Bypass when the request is from the service role (webhook handlers).
  -- PostgREST sets request.jwt.claim.role to 'service_role' for service-role
  -- requests; 'authenticated' or 'anon' for users. Direct DB connections (no
  -- JWT) return NULL — bypass those too since they're admin/maintenance scripts.
  IF current_setting('request.jwt.claim.role', true) IN ('service_role')
     OR current_setting('request.jwt.claim.role', true) IS NULL THEN
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

DROP TRIGGER IF EXISTS profiles_guard_billing ON public.profiles;
CREATE TRIGGER profiles_guard_billing
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_billing_columns();
