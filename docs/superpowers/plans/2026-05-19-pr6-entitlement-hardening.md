# PR-6: Payment Entitlement Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-time-payment-equals-permanent-access model with a Stripe-subscription-driven entitlement system in which the Stripe webhook is the sole source of truth for `profiles.plan` and a new `subscriptions` row, while closing the team-invite escalation paths (C3/C6).

**Architecture:** Stripe Checkout in `mode: 'subscription'` creates real `customer.subscription` objects. A new `/api/stripe/webhook` route reads the raw body, verifies the signature, deduplicates events via a `billing_events` table (PK = Stripe `event.id`), and updates a new `subscriptions` table plus `profiles.plan`. All paid-feature gates route through a new `getActivePlan(user)` helper that joins `profiles` and `subscriptions`, so a `past_due` or `canceled` subscription downgrades access without a separate cron. The existing `verify` endpoint stops writing to the DB and becomes a UX-only confirmation. Team invites stop touching `profiles.plan`; team features are gated by `team_members` membership plus an active Team subscription on the inviter/owner.

**Tech Stack:** Next.js 16 App Router, Stripe Node SDK 17.x (`stripe.webhooks.constructEvent`, `billingPortal.sessions.create`), Supabase (`@supabase/ssr` for user auth, `@supabase/supabase-js` service-role for webhook writes), Vitest (new — for unit tests), Stripe CLI (`stripe trigger`, `stripe listen` — for integration tests against a local dev server).

**Out of scope (separate PRs):**
- C5 marketing/legal copy updates (`landing-pricing.tsx`, `terms/page.tsx`, `upgrade-client.tsx` copy line) — copy-only, ship separately.
- S7 per-feature flag enforcement (`sso`, `sharedLibrary`, `exportPdf`) beyond plan-tier gating.
- Tax (Stripe Tax), multi-currency (S13), annual plans, trial periods, proration UI, dunning banner UI.
- Existing-user migration strategy (backfill script *is* included as Task 18; the customer-comms email and refund/discount decision are operator calls).

**Operator pre-requisites (run before Task 1):**
- Create two Stripe Products in the Dashboard: `LexAI Pro` and `LexAI Team`. Add one recurring monthly Price to each (`$29` and `$99` USD). Copy the Price IDs.
- Enable Stripe Customer Portal in Dashboard → Settings → Customer Portal. Allow: cancel subscription, switch plan, update payment method, view invoices. Set the return URL to `${APP_URL}/settings`.
- Register webhook endpoint in Stripe Dashboard → Developers → Webhooks pointing at `${APP_URL}/api/stripe/webhook`. Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Copy the signing secret.
- Enable Stripe Smart Retries (Dashboard → Settings → Billing → Subscriptions and emails).
- Set the following env vars in Vercel **and** in local `.env.local` (test-mode values locally, live-mode in production):
  - `STRIPE_WEBHOOK_SECRET` (new — signing secret from the Dashboard webhook config)
  - `STRIPE_PRICE_PRO_MONTHLY` (new — recurring Price ID for Pro)
  - `STRIPE_PRICE_TEAM_MONTHLY` (new — recurring Price ID for Team)
  - `STRIPE_PORTAL_RETURN_URL` (new — e.g. `https://lexaicontracts.com/settings`)
  - Verify existing `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are present.

---

## File Structure

**New files:**
- `vitest.config.ts` — Vitest config (jsdom not needed; node env is fine for these unit tests).
- `scripts/005_subscriptions_and_billing_events.sql` — schema migration adding `subscriptions`, `billing_events`, and the column-level RLS update on `profiles`.
- `lib/stripe/customers.ts` — `getOrCreateStripeCustomer(userId, email)`; idempotent lookup-then-create; writes `stripe_customer_id` to `profiles`.
- `lib/stripe/idempotency-key.ts` — `buildSessionIdempotencyKey(userId, priceId)`; deterministic per-day key.
- `lib/stripe/handlers/checkout-session-completed.ts` — fetches the subscription, upserts `subscriptions` and `profiles.plan`.
- `lib/stripe/handlers/subscription-updated.ts` — for both `customer.subscription.created` and `customer.subscription.updated`; same handler, idempotent upsert.
- `lib/stripe/handlers/subscription-deleted.ts` — sets `subscriptions.status = 'canceled'`, reverts `profiles.plan` to `'free'`.
- `lib/stripe/handlers/invoice-payment-failed.ts` — sets `subscriptions.status = 'past_due'`.
- `lib/stripe/handlers/invoice-payment-succeeded.ts` — extends `current_period_end`, restores `status = 'active'`.
- `lib/stripe/event-deduper.ts` — `tryClaimEvent(eventId, type, payload)`; returns `true` if first-claim, `false` if already processed.
- `lib/stripe/price-to-plan.ts` — maps Stripe Price ID → `PlanType` using env vars.
- `lib/plan/access.ts` — `getActivePlan(user)` and `assertPaidPlan(user, minTier)`; the single source of truth for paid-feature gates.
- `app/api/stripe/webhook/route.ts` — raw-body signature verification, event dedup, dispatch to handlers.
- `app/api/stripe/portal/route.ts` — creates a Customer Portal session and returns the URL.
- `lib/stripe/__tests__/idempotency-key.test.ts` — pure-logic unit test.
- `lib/stripe/__tests__/price-to-plan.test.ts` — pure-logic unit test.
- `lib/plan/__tests__/access.test.ts` — unit test against a stubbed Supabase + subscription input.
- `scripts/backfill_legacy_paid_users.ts` — one-time backfill that creates Stripe Customers + grandfather subscriptions for users with `plan IN ('pro','team')` and no `stripe_customer_id`.

**Modified files:**
- `package.json` — add `vitest`, `@vitest/coverage-v8`, `dotenv` (devDeps); add `test`, `test:watch`, `test:integration` scripts.
- `app/actions/stripe.ts` — switch to `mode: 'subscription'`, use pre-created Price IDs, set `customer`, `client_reference_id`, and `idempotencyKey`.
- `app/api/stripe/verify/route.ts` — stop writing `profiles.plan`; return the plan derived from the session (read-only confirmation). Reject any verify that would lower the user's tier (defense-in-depth for S8 even though the webhook is now authoritative).
- `app/api/stripe/sync-plan/route.ts` — deprecate. Replace body with a 410 Gone that suggests refreshing the page (the webhook will have already updated state) and a support link.
- `app/settings/page.tsx` — hide the "Restore plan" details section (still calls deprecated endpoint, will now 410). Add a "Manage billing" button that POSTs to `/api/stripe/portal`.
- `app/api/team/join/route.ts` — remove the `plan: 'team'` write (C3); add inviter-plan assertion (C6); only insert into `team_members`.
- `app/api/team/invite/route.ts` — add the same `getActivePlan` check (was using `profile?.plan !== 'team'` directly).
- `app/api/team/route.ts`, `app/api/team/share-contract/route.ts`, `app/team/page.tsx`, `components/dashboard/sidebar.tsx` — replace `profile.plan === 'team'` with `getActivePlan(user)` calls.
- `app/api/contracts/upload/route.ts`, `app/api/contracts/chat/route.ts` — same migration to `getActivePlan`.
- `app/upgrade/page.tsx`, `app/dashboard/page.tsx`, `app/contracts/[id]/page.tsx` — same migration.

---

## Task 0: Test Framework Setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add Vitest as a dev dependency**

Run:
```bash
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add scripts to package.json**

Edit `package.json` `scripts` to add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 4: Verify the framework runs**

Run: `npm test`
Expected: `No test files found` (exit 0). If you see a non-zero exit due to no tests, add a temporary `lib/__tests__/sanity.test.ts` with `import { it } from 'vitest'; it('runs', () => {})` and re-run; delete it after.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit testing"
```

---

## Task 1: Schema Migration — subscriptions + billing_events + RLS

**Files:**
- Create: `scripts/005_subscriptions_and_billing_events.sql`

- [ ] **Step 1: Write the migration**

```sql
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
-- The webhook runs as service role and bypasses RLS + triggers via SECURITY DEFINER,
-- but a regular logged-in user UPDATE will hit this.
CREATE OR REPLACE FUNCTION public.guard_profile_billing_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Skip the check when running as service role (no JWT claim present).
  IF current_setting('request.jwt.claim.role', true) IS NULL THEN
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
```

- [ ] **Step 2: Apply the migration (human, via Supabase SQL Editor)**

The implementer subagent does NOT apply this migration — the human operator does. After writing the .sql file, the implementer should commit and stop. The controller will pause and prompt the operator:

> Migration is ready at `scripts/005_subscriptions_and_billing_events.sql`. Open the Supabase project → SQL Editor → New query → paste the file contents → Run. Confirm no errors before continuing.

- [ ] **Step 3: Verify the schema (human, via SQL Editor)**

In the Supabase SQL Editor, paste and run:
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='subscriptions' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='billing_events' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='stripe_customer_id';
```
Expected: each query returns the expected columns.

- [ ] **Step 4: Smoke-test the trigger (human, via SQL Editor)**

In the Supabase SQL Editor, run as a regular authenticated user (use the "Impersonate user" feature, NOT service role):
```sql
UPDATE public.profiles SET plan = 'team' WHERE id = auth.uid();
```
Expected: `ERROR: profiles.plan is not user-writable`.

Switch to the service role and run the same UPDATE against a real test profile id. Expected: succeeds without exception.

- [ ] **Step 5: Commit**

```bash
git add scripts/005_subscriptions_and_billing_events.sql
git commit -m "feat(db): add subscriptions and billing_events tables, lock down profiles.plan"
```

---

## Task 2: Pure helper — Stripe Price → Plan mapping

**Files:**
- Create: `lib/stripe/price-to-plan.ts`
- Test: `lib/stripe/__tests__/price-to-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/stripe/__tests__/price-to-plan.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { priceIdToPlan } from '../price-to-plan'

describe('priceIdToPlan', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_test'
    process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_team_test'
  })
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns "pro" for the configured pro price id', () => {
    expect(priceIdToPlan('price_pro_test')).toBe('pro')
  })

  it('returns "team" for the configured team price id', () => {
    expect(priceIdToPlan('price_team_test')).toBe('team')
  })

  it('returns null for an unknown price id', () => {
    expect(priceIdToPlan('price_unknown')).toBeNull()
  })

  it('throws when env vars are missing', () => {
    delete process.env.STRIPE_PRICE_PRO_MONTHLY
    expect(() => priceIdToPlan('price_pro_test')).toThrow(/STRIPE_PRICE_PRO_MONTHLY/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- price-to-plan`
Expected: FAIL — `Cannot find module '../price-to-plan'`.

- [ ] **Step 3: Write the implementation**

Create `lib/stripe/price-to-plan.ts`:
```ts
import 'server-only'
import type { PlanType } from '@/lib/plan-limits'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export function priceIdToPlan(priceId: string): PlanType | null {
  const pro = requireEnv('STRIPE_PRICE_PRO_MONTHLY')
  const team = requireEnv('STRIPE_PRICE_TEAM_MONTHLY')
  if (priceId === pro) return 'pro'
  if (priceId === team) return 'team'
  return null
}

export function planToPriceId(plan: PlanType): string {
  if (plan === 'pro') return requireEnv('STRIPE_PRICE_PRO_MONTHLY')
  if (plan === 'team') return requireEnv('STRIPE_PRICE_TEAM_MONTHLY')
  throw new Error(`No Stripe price configured for plan: ${plan}`)
}
```

Note: `'server-only'` will fail in Vitest if vitest tries to import it. If that happens, set `vitest.config.ts` test env vars to mark this safe, or split the helper into a pure file with no `server-only` import (preferred). For this file specifically, *do not* import `server-only` because the price ID lookup is pure logic and we want it testable. Remove the line if it blocks the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- price-to-plan`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/price-to-plan.ts lib/stripe/__tests__/price-to-plan.test.ts
git commit -m "feat(stripe): add priceIdToPlan/planToPriceId helpers"
```

---

## Task 3: Pure helper — Idempotency key builder

**Files:**
- Create: `lib/stripe/idempotency-key.ts`
- Test: `lib/stripe/__tests__/idempotency-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildSessionIdempotencyKey } from '../idempotency-key'

describe('buildSessionIdempotencyKey', () => {
  it('is deterministic for the same (userId, priceId, day)', () => {
    const day = new Date('2026-05-19T12:00:00Z')
    const a = buildSessionIdempotencyKey('user_1', 'price_pro', day)
    const b = buildSessionIdempotencyKey('user_1', 'price_pro', day)
    expect(a).toBe(b)
  })

  it('differs across users', () => {
    const day = new Date('2026-05-19T12:00:00Z')
    expect(buildSessionIdempotencyKey('user_1', 'price_pro', day))
      .not.toBe(buildSessionIdempotencyKey('user_2', 'price_pro', day))
  })

  it('differs across days (UTC)', () => {
    const day1 = new Date('2026-05-19T23:59:59Z')
    const day2 = new Date('2026-05-20T00:00:01Z')
    expect(buildSessionIdempotencyKey('user_1', 'price_pro', day1))
      .not.toBe(buildSessionIdempotencyKey('user_1', 'price_pro', day2))
  })

  it('is shorter than 255 chars (Stripe limit)', () => {
    const day = new Date('2026-05-19T12:00:00Z')
    expect(buildSessionIdempotencyKey('user_1', 'price_pro', day).length).toBeLessThan(255)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- idempotency-key`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export function buildSessionIdempotencyKey(
  userId: string,
  priceId: string,
  now: Date = new Date(),
): string {
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `session-${userId}-${priceId}-${yyyy}${mm}${dd}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- idempotency-key`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/idempotency-key.ts lib/stripe/__tests__/idempotency-key.test.ts
git commit -m "feat(stripe): add buildSessionIdempotencyKey helper"
```

---

## Task 4: getOrCreateStripeCustomer

**Files:**
- Create: `lib/stripe/customers.ts`

> Tested via the integration smoke test in Task 10 (it's a thin wrapper over Stripe SDK + Supabase; mocking both produces a tautology).

- [ ] **Step 1: Write the implementation**

```ts
import 'server-only'
import { getStripe } from '@/lib/stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string | null | undefined,
): Promise<string> {
  const supabase = service()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`Profile lookup failed: ${error.message}`)

  if (profile?.stripe_customer_id) return profile.stripe_customer_id

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId },
  })

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
  if (updateError) {
    // We've already created the Stripe customer. Log and surface so the
    // caller can decide; do not silently swallow.
    throw new Error(
      `Stripe customer ${customer.id} created but profile update failed: ${updateError.message}`,
    )
  }

  return customer.id
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to `lib/stripe/customers.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/stripe/customers.ts
git commit -m "feat(stripe): add getOrCreateStripeCustomer"
```

---

## Task 5: Webhook event deduper

**Files:**
- Create: `lib/stripe/event-deduper.ts`

> Tested via the webhook integration test in Task 9.

- [ ] **Step 1: Write the implementation**

```ts
import 'server-only'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Attempt to claim a Stripe event for processing.
 *
 * Why: Stripe retries webhooks on non-2xx and on its own schedule. We must
 * make every handler idempotent. INSERT with a primary key on event_id is
 * the cheapest mutual-exclusion primitive — the second INSERT fails with
 * 23505 (unique violation), which we treat as "already processed."
 *
 * Returns true if this caller owns the event; false if it was already claimed.
 */
export async function tryClaimEvent(
  eventId: string,
  type: string,
  userId: string | null,
  payload: unknown,
): Promise<boolean> {
  const supabase = service()
  const { error } = await supabase.from('billing_events').insert({
    event_id: eventId,
    type,
    user_id: userId,
    payload,
  })
  if (!error) return true
  // 23505 = unique_violation in Postgres.
  if (error.code === '23505') return false
  throw new Error(`Failed to claim event ${eventId}: ${error.message}`)
}

export async function markEventProcessed(eventId: string): Promise<void> {
  const supabase = service()
  const { error } = await supabase
    .from('billing_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', eventId)
  if (error) throw new Error(`Failed to mark event ${eventId} processed: ${error.message}`)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/stripe/event-deduper.ts
git commit -m "feat(stripe): add billing_events claim/process helpers"
```

---

## Task 6: Event handler — checkout.session.completed

**Files:**
- Create: `lib/stripe/handlers/checkout-session-completed.ts`

- [ ] **Step 1: Write the implementation**

```ts
import 'server-only'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { priceIdToPlan } from '@/lib/stripe/price-to-plan'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleCheckoutSessionCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<{ userId: string | null }> {
  const session = event.data.object
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null
  if (!userId) {
    throw new Error(`checkout.session.completed ${event.id}: no userId in client_reference_id or metadata`)
  }
  if (session.mode !== 'subscription' || !session.subscription) {
    // Ignore non-subscription sessions defensively — legacy one-time charges
    // should no longer be created after Task 10.
    return { userId }
  }

  const stripe = getStripe()
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id
  const sub = await stripe.subscriptions.retrieve(subscriptionId)

  const item = sub.items.data[0]
  if (!item) throw new Error(`Subscription ${sub.id}: no items`)
  const plan = priceIdToPlan(item.price.id)
  if (!plan) throw new Error(`Subscription ${sub.id}: unrecognized price ${item.price.id}`)

  const supabase = service()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  const { error: upsertError } = await supabase.from('subscriptions').upsert({
    id: sub.id,
    user_id: userId,
    stripe_customer_id: customerId,
    status: sub.status,
    plan,
    price_id: item.price.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  })
  if (upsertError) throw new Error(`subscriptions upsert failed: ${upsertError.message}`)

  // Mirror the plan onto profiles.plan as a denormalized cache.
  // getActivePlan() will still consult subscriptions.status to decide gating.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan, stripe_customer_id: customerId })
    .eq('id', userId)
  if (profileError) throw new Error(`profiles update failed: ${profileError.message}`)

  return { userId }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/stripe/handlers/checkout-session-completed.ts
git commit -m "feat(stripe): handle checkout.session.completed via subscription upsert"
```

---

## Task 7: Event handler — subscription updated/created

**Files:**
- Create: `lib/stripe/handlers/subscription-updated.ts`

- [ ] **Step 1: Write the implementation**

```ts
import 'server-only'
import type Stripe from 'stripe'
import { priceIdToPlan } from '@/lib/stripe/price-to-plan'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Handles customer.subscription.created and customer.subscription.updated.
// The two events carry the same shape; we treat created as a backstop in case
// checkout.session.completed was missed.
export async function handleSubscriptionUpserted(
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<{ userId: string | null }> {
  const sub = event.data.object
  const item = sub.items.data[0]
  if (!item) throw new Error(`Subscription ${sub.id}: no items`)
  const plan = priceIdToPlan(item.price.id)
  if (!plan) throw new Error(`Subscription ${sub.id}: unrecognized price ${item.price.id}`)

  const supabase = service()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve user_id via the stripe_customer_id we stored at checkout time.
  const { data: profile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  if (profileLookupError) {
    throw new Error(`No profile found for customer ${customerId}: ${profileLookupError.message}`)
  }
  const userId = profile.id

  const { error: upsertError } = await supabase.from('subscriptions').upsert({
    id: sub.id,
    user_id: userId,
    stripe_customer_id: customerId,
    status: sub.status,
    plan,
    price_id: item.price.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  })
  if (upsertError) throw new Error(`subscriptions upsert failed: ${upsertError.message}`)

  // Sync the denormalized profiles.plan based on subscription health.
  const planForProfile = (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')
    ? plan
    : 'free'
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan: planForProfile })
    .eq('id', userId)
  if (profileError) throw new Error(`profiles update failed: ${profileError.message}`)

  return { userId }
}
```

> `past_due` keeps the plan label so the UI can show "Past due — update your card." `getActivePlan()` (Task 12) will still block paid features for `past_due` after a grace period.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/stripe/handlers/subscription-updated.ts
git commit -m "feat(stripe): handle customer.subscription created/updated"
```

---

## Task 8: Event handler — subscription deleted + invoice payment failed/succeeded

**Files:**
- Create: `lib/stripe/handlers/subscription-deleted.ts`
- Create: `lib/stripe/handlers/invoice-payment-failed.ts`
- Create: `lib/stripe/handlers/invoice-payment-succeeded.ts`

- [ ] **Step 1: Write subscription-deleted.ts**

```ts
import 'server-only'
import type Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<{ userId: string | null }> {
  const sub = event.data.object
  const supabase = service()

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const { data: profile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  if (profileLookupError) {
    throw new Error(`No profile found for customer ${customerId}: ${profileLookupError.message}`)
  }
  const userId = profile.id

  const { error: subError } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', sub.id)
  if (subError) throw new Error(`subscriptions update failed: ${subError.message}`)

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan: 'free' })
    .eq('id', userId)
  if (profileError) throw new Error(`profiles downgrade failed: ${profileError.message}`)

  return { userId }
}
```

- [ ] **Step 2: Write invoice-payment-failed.ts**

```ts
import 'server-only'
import type Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
): Promise<{ userId: string | null }> {
  const invoice = event.data.object
  if (!invoice.subscription) return { userId: null }
  const subId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id

  const supabase = service()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('id', subId)
    .single()

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('id', subId)
  if (error) throw new Error(`subscriptions past_due update failed: ${error.message}`)

  return { userId: sub?.user_id ?? null }
}
```

- [ ] **Step 3: Write invoice-payment-succeeded.ts**

```ts
import 'server-only'
import type Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleInvoicePaymentSucceeded(
  event: Stripe.InvoicePaymentSucceededEvent,
): Promise<{ userId: string | null }> {
  const invoice = event.data.object
  if (!invoice.subscription) return { userId: null }
  const subId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id
  if (!invoice.period_end) return { userId: null }

  const supabase = service()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('id', subId)
    .single()

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_end: new Date(invoice.period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', subId)
  if (error) throw new Error(`subscriptions renewal update failed: ${error.message}`)

  return { userId: sub?.user_id ?? null }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/handlers/
git commit -m "feat(stripe): add deleted/payment-failed/payment-succeeded handlers"
```

---

## Task 9: Webhook route with raw-body verification + dispatch

**Files:**
- Create: `app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/stripe/webhook/route.ts
//
// CRITICAL: Stripe signature verification REQUIRES the unparsed request body.
// Do NOT use req.json() in this file; use req.text() and parse manually.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { tryClaimEvent, markEventProcessed } from '@/lib/stripe/event-deduper'
import { handleCheckoutSessionCompleted } from '@/lib/stripe/handlers/checkout-session-completed'
import { handleSubscriptionUpserted } from '@/lib/stripe/handlers/subscription-updated'
import { handleSubscriptionDeleted } from '@/lib/stripe/handlers/subscription-deleted'
import { handleInvoicePaymentFailed } from '@/lib/stripe/handlers/invoice-payment-failed'
import { handleInvoicePaymentSucceeded } from '@/lib/stripe/handlers/invoice-payment-succeeded'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const body = await req.text()
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature'
    console.warn('[stripe-webhook] signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const userId = extractUserId(event)
  let claimed: boolean
  try {
    claimed = await tryClaimEvent(event.id, event.type, userId, event as unknown)
  } catch (err) {
    console.error('[stripe-webhook] claim failed:', event.id, err)
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 })
  }
  if (!claimed) {
    // Already processed (or in-flight). 200 so Stripe stops retrying.
    return NextResponse.json({ received: true, deduped: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpserted(event)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event)
        break
      default:
        // Ignored by design — still mark processed so we never retry it.
        break
    }
    await markEventProcessed(event.id)
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler failed'
    console.error('[stripe-webhook] handler error:', event.id, event.type, message)
    // Returning 500 makes Stripe retry. The dedup row remains with
    // processed_at = NULL; the retry will see claim=false but the event still
    // needs to run. Adjust strategy: delete the dedup row on handler failure
    // so the retry can re-claim. See cleanup below.
    await releaseClaim(event.id)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}

function extractUserId(event: Stripe.Event): string | null {
  // Best-effort. The handlers resolve user_id authoritatively via
  // stripe_customer_id. This is just for the billing_events.user_id column.
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session
    return s.client_reference_id ?? s.metadata?.userId ?? null
  }
  return null
}

async function releaseClaim(eventId: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  await supabase.from('billing_events').delete().eq('event_id', eventId)
}
```

- [ ] **Step 2: Local integration smoke test — checkout flow**

In one terminal:
```bash
npx stripe listen --forward-to localhost:3000/api/stripe/webhook
```
Copy the `whsec_...` it prints into `.env.local` as `STRIPE_WEBHOOK_SECRET` and restart the dev server.

In another terminal:
```bash
npx stripe trigger checkout.session.completed
```
Expected: webhook receives a 2xx; `psql "$SUPABASE_DB_URL" -c "SELECT event_id, type, processed_at FROM billing_events ORDER BY received_at DESC LIMIT 1;"` shows a row for `checkout.session.completed` with `processed_at IS NOT NULL`.

Note: `stripe trigger` creates a synthetic test customer/subscription that won't have a matching `stripe_customer_id` in our `profiles` table — the handler will throw. That's acceptable for this smoke test; check the `billing_events` row was *claimed* (it should have been deleted by `releaseClaim` on the handler error). Then re-trigger to see the dedup row gets re-created cleanly. Full end-to-end is validated in Task 10.

- [ ] **Step 3: Local integration smoke test — dedup**

```bash
npx stripe trigger invoice.payment_failed
npx stripe trigger invoice.payment_failed   # same event ID? No — Stripe trigger always issues a fresh event.id.
```

Replay the *same* event by capturing its raw body and signature from `stripe listen` output and re-POSTing with curl. Expected: second POST returns `{ "received": true, "deduped": true }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat(stripe): add webhook route with raw-body verification and dedup"
```

---

## Task 10: Subscription-mode Checkout + customer + idempotency key

**Files:**
- Modify: `app/actions/stripe.ts`
- Modify: `components/stripe/embedded-checkout.tsx`

- [ ] **Step 1: Rewrite startCheckoutSession**

Replace the body of `app/actions/stripe.ts` with:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { getProductById } from '@/lib/products'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customers'
import { planToPriceId } from '@/lib/stripe/price-to-plan'
import { buildSessionIdempotencyKey } from '@/lib/stripe/idempotency-key'

export async function startCheckoutSession(
  productId: string,
): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in to upgrade.')

  const product = getProductById(productId)
  if (!product) throw new Error(`Invalid product: ${productId}`)

  const customerId = await getOrCreateStripeCustomer(user.id, user.email)
  const priceId = planToPriceId(product.plan)

  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: 'embedded',
      redirect_on_completion: 'never',
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
        productId: product.id,
        plan: product.plan,
      },
    },
    { idempotencyKey: buildSessionIdempotencyKey(user.id, priceId) },
  )

  if (!session.client_secret) throw new Error('Failed to create checkout session.')
  return { clientSecret: session.client_secret, sessionId: session.id }
}
```

- [ ] **Step 2: Cache the clientSecret in embedded-checkout.tsx**

Edit `components/stripe/embedded-checkout.tsx`. The current `fetchClientSecret` is wrapped in `useCallback` keyed only on `productId`, but Stripe's `EmbeddedCheckoutProvider` calls it on each mount — and a React strict-mode double-invoke or remount will fire it again. With `idempotencyKey` on the server side this is now safe (Stripe returns the same session for the same key), but cache it client-side too to avoid the round trip.

Replace the existing `fetchClientSecret`:
```ts
const clientSecretRef = useRef<string | null>(null)

const fetchClientSecret = useCallback(async () => {
  if (clientSecretRef.current) return clientSecretRef.current
  const { clientSecret, sessionId } = await startCheckoutSession(productId)
  clientSecretRef.current = clientSecret
  sessionIdRef.current = sessionId
  return clientSecret
}, [productId])
```

- [ ] **Step 3: End-to-end smoke test — full subscribe flow**

With `stripe listen` running from Task 9 and `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_TEAM_MONTHLY` set to test-mode Price IDs:

1. Start `npm run dev`.
2. Sign in as a test user. Navigate to `/upgrade?plan=pro`.
3. Complete checkout with `4242 4242 4242 4242`, any future date, any CVC.
4. Verify in `stripe listen` terminal: `checkout.session.completed`, `customer.subscription.created`, `invoice.payment_succeeded` all return 200.
5. Verify in DB:
   ```sql
   SELECT plan, stripe_customer_id FROM profiles WHERE id = '<your test user id>';
   SELECT id, status, plan, current_period_end FROM subscriptions WHERE user_id = '<your test user id>';
   ```
   Expected: `profiles.plan = 'pro'`, `profiles.stripe_customer_id` populated, one `subscriptions` row with `status = 'active'`.

- [ ] **Step 4: Commit**

```bash
git add app/actions/stripe.ts components/stripe/embedded-checkout.tsx
git commit -m "feat(stripe): switch checkout to subscription mode with customer + idempotency"
```

---

## Task 11: Demote verify endpoint to UX-only

**Files:**
- Modify: `app/api/stripe/verify/route.ts`

- [ ] **Step 1: Rewrite verify**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import type { PlanType } from '@/lib/plan-limits'

const TIER_ORDER: Record<PlanType, number> = { free: 0, pro: 1, team: 2 }

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'Session ID required' }, { status: 400 })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }
    if (session.client_reference_id !== user.id && session.metadata?.userId !== user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 })
    }

    const plan = session.metadata?.plan as PlanType
    if (!plan || !['pro', 'team'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan in session' }, { status: 400 })
    }

    // Defense-in-depth (S8): even though the webhook owns DB writes, surface
    // any tier-downgrade attempt as an error so the success page can show a
    // sensible message instead of celebrating a downgrade.
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    const currentTier = TIER_ORDER[(profile?.plan as PlanType) ?? 'free']
    if (TIER_ORDER[plan] < currentTier) {
      return NextResponse.json(
        { error: 'Cannot downgrade via checkout. Use the billing portal.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, plan })
  } catch (err) {
    console.error('[stripe-verify]', err)
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke test**

Re-run the Task 10 step 3 flow. Verify the success page still navigates correctly. Then confirm in `psql` that the only DB write came from the webhook — restore the test user to `plan = 'free'`, replay the verify endpoint by hand with the session ID, and confirm `profiles.plan` is **still `free`** (because the webhook has already done its work; this call no longer writes).

```bash
curl -X POST http://localhost:3000/api/stripe/verify \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"sessionId":"cs_test_..."}'
```
Expected response: `{ "success": true, "plan": "pro" }`. Expected DB state: unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/verify/route.ts
git commit -m "refactor(stripe): demote verify to UX-only; webhook is source of truth"
```

---

## Task 12: getActivePlan helper

**Files:**
- Create: `lib/plan/access.ts`
- Test: `lib/plan/__tests__/access.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { decideActivePlan, GRACE_PERIOD_DAYS } from '../access'

describe('decideActivePlan', () => {
  const now = new Date('2026-05-19T12:00:00Z')

  it('returns free when no subscription exists', () => {
    expect(decideActivePlan(null, now)).toEqual({ tier: 'free', status: 'none' })
  })

  it('returns the plan when subscription is active', () => {
    expect(decideActivePlan({
      status: 'active', plan: 'pro',
      current_period_end: '2026-06-19T00:00:00Z',
    }, now)).toEqual({ tier: 'pro', status: 'active' })
  })

  it('returns the plan when trialing', () => {
    expect(decideActivePlan({
      status: 'trialing', plan: 'team',
      current_period_end: '2026-06-19T00:00:00Z',
    }, now)).toEqual({ tier: 'team', status: 'trialing' })
  })

  it('keeps the plan during the grace period for past_due', () => {
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: recent,
    }, now)).toEqual({ tier: 'pro', status: 'past_due' })
  })

  it('downgrades to free when past_due exceeds the grace period', () => {
    const old = new Date(now.getTime() - (GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: old,
    }, now)).toEqual({ tier: 'free', status: 'past_due_expired' })
  })

  it('returns free for canceled subscriptions', () => {
    expect(decideActivePlan({
      status: 'canceled', plan: 'pro', current_period_end: '2026-04-01T00:00:00Z',
    }, now)).toEqual({ tier: 'free', status: 'canceled' })
  })

  it('returns free for incomplete_expired', () => {
    expect(decideActivePlan({
      status: 'incomplete_expired', plan: 'pro', current_period_end: '2026-04-01T00:00:00Z',
    }, now)).toEqual({ tier: 'free', status: 'incomplete_expired' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- access`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { PlanType } from '@/lib/plan-limits'

export const GRACE_PERIOD_DAYS = 3

export interface SubscriptionRow {
  status: string
  plan: PlanType
  current_period_end: string  // ISO timestamp
}

export interface ActivePlan {
  tier: PlanType
  status: string  // 'none' | 'active' | 'trialing' | 'past_due' | 'past_due_expired' | 'canceled' | ...
}

export function decideActivePlan(
  sub: SubscriptionRow | null,
  now: Date = new Date(),
): ActivePlan {
  if (!sub) return { tier: 'free', status: 'none' }

  if (sub.status === 'active' || sub.status === 'trialing') {
    return { tier: sub.plan, status: sub.status }
  }

  if (sub.status === 'past_due') {
    const end = new Date(sub.current_period_end).getTime()
    const ageMs = now.getTime() - end
    const ageDays = ageMs / (24 * 60 * 60 * 1000)
    if (ageDays <= GRACE_PERIOD_DAYS) {
      return { tier: sub.plan, status: 'past_due' }
    }
    return { tier: 'free', status: 'past_due_expired' }
  }

  return { tier: 'free', status: sub.status }
}
```

Now add the data-fetching wrapper at the bottom of the same file:

```ts
import 'server-only'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getActivePlan(userId: string): Promise<ActivePlan> {
  const supabase = service()
  // Most-recent non-canceled sub per user. There is one in practice; this is
  // defensive ordering in case multiple sub rows exist.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)

  return decideActivePlan(subs?.[0] ?? null)
}

export async function assertPaidPlan(
  userId: string,
  minTier: PlanType,
): Promise<ActivePlan> {
  const active = await getActivePlan(userId)
  const order: Record<PlanType, number> = { free: 0, pro: 1, team: 2 }
  if (order[active.tier] < order[minTier]) {
    throw new Error(`Requires ${minTier} plan; user is on ${active.tier} (${active.status})`)
  }
  return active
}
```

Important: split this into two files if the `'server-only'` import causes Vitest to fail. Pattern: `lib/plan/access-logic.ts` (pure, tested) + `lib/plan/access.ts` (re-exports + adds `getActivePlan`/`assertPaidPlan`). Update the test to import from `access-logic`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- access`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/access.ts lib/plan/__tests__/access.test.ts
git commit -m "feat(plan): add getActivePlan with grace-period logic"
```

---

## Task 13: Migrate paid-feature gates to getActivePlan

**Files (modify, one at a time, commit between):**
- `app/api/contracts/upload/route.ts`
- `app/api/contracts/chat/route.ts`
- `app/api/team/invite/route.ts`
- `app/api/team/route.ts`
- `app/api/team/share-contract/route.ts`

> The UI files (`app/team/page.tsx`, `app/dashboard/page.tsx`, `app/contracts/[id]/page.tsx`, `app/upgrade/page.tsx`, `components/dashboard/sidebar.tsx`, `app/settings/page.tsx`) can keep reading `profiles.plan` as a display cache — the webhook keeps it in sync. Server-side enforcement is the only place that must call `getActivePlan`.

- [ ] **Step 1: Migrate `app/api/contracts/upload/route.ts`**

Find the existing block around line 41 that reads `profile.plan`:
```ts
const plan = (profile?.plan || 'free') as PlanType
```

Replace with:
```ts
import { getActivePlan } from '@/lib/plan/access'
// ...
const active = await getActivePlan(user.id)
const plan = active.tier
```

Run: `npx tsc --noEmit`
Expected: no errors.

Commit:
```bash
git add app/api/contracts/upload/route.ts
git commit -m "refactor(contracts): gate uploads via getActivePlan"
```

- [ ] **Step 2: Migrate `app/api/contracts/chat/route.ts`**

Same pattern as Step 1. Commit:
```bash
git add app/api/contracts/chat/route.ts
git commit -m "refactor(contracts): gate chat via getActivePlan"
```

- [ ] **Step 3: Migrate `app/api/team/invite/route.ts`**

Find the existing check (around line 29):
```ts
if (profile?.plan !== 'team' || !profile?.team_id) {
```

Replace with:
```ts
import { getActivePlan } from '@/lib/plan/access'
// ...
const active = await getActivePlan(user.id)
if (active.tier !== 'team' || !profile?.team_id) {
```

Commit:
```bash
git add app/api/team/invite/route.ts
git commit -m "refactor(team): gate invite issuance via active team plan"
```

- [ ] **Step 4: Migrate `app/api/team/route.ts` and `app/api/team/share-contract/route.ts`**

Same pattern. One commit per file:
```bash
git add app/api/team/route.ts
git commit -m "refactor(team): gate team route via getActivePlan"
git add app/api/team/share-contract/route.ts
git commit -m "refactor(team): gate share-contract via getActivePlan"
```

- [ ] **Step 5: Smoke test — past_due downgrade**

In the database, manually set the test user's subscription to past_due with an old `current_period_end`:
```sql
UPDATE subscriptions
SET status = 'past_due',
    current_period_end = NOW() - INTERVAL '5 days',
    updated_at = NOW()
WHERE user_id = '<test user id>';
```

Try to upload a contract via the API (or in the UI). Expected: 403/upgrade prompt (whatever the existing flow does for free tier), because `getActivePlan` returns `{ tier: 'free', status: 'past_due_expired' }`.

Restore the test user:
```sql
UPDATE subscriptions SET status = 'active', current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
WHERE user_id = '<test user id>';
```

---

## Task 14: Team join — remove plan write (C3) + assert inviter plan (C6)

**Files:**
- Modify: `app/api/team/join/route.ts`

- [ ] **Step 1: Rewrite the join handler**

Replace `app/api/team/join/route.ts` body with:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan/access'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token is required.' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: invite } = await service
    .from('team_invites')
    .select('*, teams:team_id(name, owner_id)')
    .eq('token', token)
    .eq('status', 'pending')
    .single()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite.' }, { status: 404 })

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('team_invites').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'This invite has expired.' }, { status: 410 })
  }

  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address.' }, { status: 403 })
  }

  // C6: the inviter (team owner) must hold an active Team plan.
  const ownerId = (invite.teams as { owner_id: string })?.owner_id
  if (!ownerId) {
    return NextResponse.json({ error: 'Team owner is missing.' }, { status: 500 })
  }
  const ownerPlan = await getActivePlan(ownerId)
  if (ownerPlan.tier !== 'team') {
    return NextResponse.json(
      { error: 'Team subscription is not active. Ask the team owner to renew.' },
      { status: 402 },
    )
  }

  const { count } = await service
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', invite.team_id)
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Team is full (max 10 members).' }, { status: 403 })
  }

  await service.from('team_members').upsert({
    team_id: invite.team_id,
    user_id: user.id,
    role: 'member',
  })

  // C3: do NOT touch profiles.plan. Team features are gated by team_members
  // membership (already enforced in the UI gates) plus an active owner plan.
  await service.from('profiles').update({ team_id: invite.team_id }).eq('id', user.id)

  await service.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id)

  return NextResponse.json({ success: true, teamName: (invite.teams as { name: string })?.name })
}
```

> Confirm the `teams` table has an `owner_id` column. If it doesn't (e.g. ownership is tracked via `team_members.role = 'owner'`), replace the owner lookup with: `service.from('team_members').select('user_id').eq('team_id', invite.team_id).eq('role','owner').single()`.

- [ ] **Step 2: Update team feature gates to consider membership**

The existing gates in Task 13 currently require `active.tier === 'team'` on the *caller*. After this change, a team *member* (not owner) will have `tier === 'free'` (or whatever their personal plan is). Team feature access should be granted when EITHER:
- The user has `active.tier === 'team'` (owner with their own Team sub), OR
- The user is a `team_members` row whose team's owner has an active Team sub.

Add to `lib/plan/access.ts`:
```ts
export async function hasTeamAccess(userId: string): Promise<{
  ok: boolean
  via: 'own' | 'membership' | null
  teamId: string | null
}> {
  const own = await getActivePlan(userId)
  if (own.tier === 'team') {
    // Find their team_id from profiles if any.
    const supabase = service()
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', userId)
      .single()
    return { ok: true, via: 'own', teamId: profile?.team_id ?? null }
  }

  const supabase = service()
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, teams:team_id(owner_id)')
    .eq('user_id', userId)
    .single()
  if (!membership?.team_id) return { ok: false, via: null, teamId: null }

  const ownerId = (membership.teams as { owner_id: string })?.owner_id
  if (!ownerId) return { ok: false, via: null, teamId: membership.team_id }

  const owner = await getActivePlan(ownerId)
  if (owner.tier === 'team') {
    return { ok: true, via: 'membership', teamId: membership.team_id }
  }
  return { ok: false, via: null, teamId: membership.team_id }
}
```

Then update the three team gates from Task 13 (`app/api/team/invite/route.ts`, `app/api/team/route.ts`, `app/api/team/share-contract/route.ts`) to call `hasTeamAccess(user.id)` instead of comparing `active.tier === 'team'`. The invite route should *additionally* require `via === 'own'` (only owners can invite).

- [ ] **Step 3: Test the C3/C6 paths**

Create a fresh free-tier user `A`. Try the historical exploit:
1. Insert a row in `teams` (use SQL editor) owned by `A`.
2. Insert a `team_invites` row owned by `A`.
3. Sign in as another fresh user `B` and call `POST /api/team/join` with the token.

Expected: 402 — "Team subscription is not active." Verify `profiles.plan` for `B` is unchanged (still `'free'`).

Now subscribe `A` to Team via the real flow. Re-run join for `B`. Expected: 200. Verify `profiles.plan` for `B` is **still `'free'`** (C3 fix held) but `team_members` has a row for `B`.

Verify `B` can access team UI: with the new `hasTeamAccess`, `B` should see the team page. Without it (regression check), they would not.

- [ ] **Step 4: Commit**

```bash
git add app/api/team/join/route.ts lib/plan/access.ts \
  app/api/team/invite/route.ts app/api/team/route.ts app/api/team/share-contract/route.ts
git commit -m "fix(team): remove plan grant on join (C3); assert active team owner (C6)"
```

---

## Task 15: Customer Portal route + Manage Billing button

**Files:**
- Create: `app/api/stripe/portal/route.ts`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Write the portal route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer for this user.' }, { status: 404 })
  }

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL
  if (!returnUrl) {
    return NextResponse.json({ error: 'Portal not configured.' }, { status: 500 })
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: returnUrl,
  })
  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 2: Add the button to /settings**

Edit `app/settings/page.tsx`. Inside the existing "Billing & Plan" card, after the current plan banner (around line 275), add:

```tsx
{currentPlan !== 'free' && (
  <Button
    size="sm"
    variant="outline"
    onClick={async () => {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to open billing portal')
      }
    }}
  >
    Manage billing
  </Button>
)}
```

- [ ] **Step 3: Smoke test**

Sign in as the subscribed test user, navigate to `/settings`, click "Manage billing." Expected: redirect to a `billing.stripe.com/...` URL where the user can update card, switch plan, or cancel.

Cancel via the portal. Watch `stripe listen` output: a `customer.subscription.updated` event fires with `cancel_at_period_end: true`, followed by `customer.subscription.deleted` when the period ends (Stripe CLI can simulate the deletion). Verify `profiles.plan` reverts to `'free'`.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/portal/route.ts app/settings/page.tsx
git commit -m "feat(stripe): add customer portal route and Manage Billing button"
```

---

## Task 16: Deprecate sync-plan endpoint and hide its UI

**Files:**
- Modify: `app/api/stripe/sync-plan/route.ts`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Return 410 from sync-plan**

Replace `app/api/stripe/sync-plan/route.ts` with:
```ts
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Plan changes are processed automatically by Stripe webhooks. If your plan looks wrong, refresh the page or contact support.',
    },
    { status: 410 },
  )
}
```

- [ ] **Step 2: Remove the sync UI from settings**

Edit `app/settings/page.tsx`. Delete:
- The `syncSessionId` and `syncing` state hooks (around lines 25–26).
- The `handleSyncPlan` function (lines 81–96).
- The "Restore plan from Stripe session" `<details>` block (lines 278–294).
- The `RefreshCw` import if no longer referenced.

- [ ] **Step 3: Smoke test**

Reload `/settings`. Expected: no "Restore plan" section visible. POST to the endpoint:
```bash
curl -X POST http://localhost:3000/api/stripe/sync-plan -H "Content-Type: application/json" -d '{"sessionId":"cs_test_x"}'
```
Expected: 410.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/sync-plan/route.ts app/settings/page.tsx
git commit -m "chore(stripe): deprecate sync-plan endpoint and hide manual restore UI"
```

---

## Task 17: Backfill script for legacy paid users

**Files:**
- Create: `scripts/backfill_legacy_paid_users.ts`

> This script handles existing users who already have `profiles.plan IN ('pro','team')` but no `stripe_customer_id` and no subscription. Strategy: **grandfather** — create a Stripe Customer for each, and a Stripe Subscription with `trial_end` 100 years in the future on the appropriate Price ID, so they continue to have access at no charge. The webhook will populate `subscriptions` and `stripe_customer_id` via the `customer.subscription.created` event.

- [ ] **Step 1: Write the script**

```ts
// scripts/backfill_legacy_paid_users.ts
// Run with: tsx scripts/backfill_legacy_paid_users.ts --dry-run
//          tsx scripts/backfill_legacy_paid_users.ts --apply
//
// Requires: STRIPE_SECRET_KEY (live or test), NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_TEAM_MONTHLY.

import 'dotenv/config'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PRICE_BY_PLAN: Record<'pro' | 'team', string> = {
  pro: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY!,
}

const FAR_FUTURE_UNIX = Math.floor(new Date('2125-01-01T00:00:00Z').getTime() / 1000)

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, plan, stripe_customer_id')
    .in('plan', ['pro', 'team'])
    .is('stripe_customer_id', null)
  if (error) throw error
  console.log(`[backfill] found ${users.length} legacy paid users`)

  for (const u of users) {
    const plan = u.plan as 'pro' | 'team'
    const priceId = PRICE_BY_PLAN[plan]
    if (!priceId) {
      console.warn(`[backfill] skip ${u.id}: no price configured for plan ${plan}`)
      continue
    }

    // Look up the auth email via the auth admin API.
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(u.id)
    if (authError || !authUser?.user?.email) {
      console.warn(`[backfill] skip ${u.id}: no email`)
      continue
    }
    const email = authUser.user.email

    console.log(`[backfill] ${apply ? 'APPLY' : 'DRY'} ${u.id} (${plan}) -> grandfather subscription`)
    if (!apply) continue

    const customer = await stripe.customers.create({ email, metadata: { userId: u.id, backfill: 'legacy' } })
    await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_end: FAR_FUTURE_UNIX,
      proration_behavior: 'none',
      metadata: { userId: u.id, backfill: 'legacy' },
    })
    // The webhook will populate profiles.stripe_customer_id and the
    // subscriptions row when customer.subscription.created fires.
  }
  console.log('[backfill] done')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Install tsx for one-shot script execution**

```bash
npm install --save-dev tsx dotenv
```

- [ ] **Step 3: Dry-run the script in test mode**

Insert a synthetic legacy user manually:
```sql
-- Sign up a user first via the app or supabase auth, then:
UPDATE profiles SET plan = 'pro', stripe_customer_id = NULL WHERE id = '<test user id>';
```

Run:
```bash
npx tsx scripts/backfill_legacy_paid_users.ts
```
Expected: `[backfill] found 1 legacy paid users` and a `DRY` line for that user. No Stripe API calls have been made (you can verify in the Stripe Dashboard's test mode logs).

- [ ] **Step 4: Apply in test mode**

```bash
npx tsx scripts/backfill_legacy_paid_users.ts --apply
```
Expected: `APPLY` log line. In Stripe Dashboard (test mode), see one new customer and one new subscription with `trial_end` in 2125. After `stripe listen` processes the `customer.subscription.created` webhook, verify in the DB:
```sql
SELECT plan, stripe_customer_id FROM profiles WHERE id = '<test user id>';
SELECT id, status, plan FROM subscriptions WHERE user_id = '<test user id>';
```
Expected: `stripe_customer_id` populated, subscription row exists with `status = 'trialing'`.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill_legacy_paid_users.ts package.json package-lock.json
git commit -m "feat(scripts): add backfill for legacy paid users (grandfather)"
```

---

## Task 18: Verification, documentation, and PR

**Files:**
- Create: `docs/runbooks/stripe-webhook.md`

- [ ] **Step 1: Write the runbook**

Create a short runbook covering:
- How to roll the `STRIPE_WEBHOOK_SECRET` (rotate in Dashboard → Webhooks → reveal → update env var → redeploy).
- How to replay a failed event (`stripe events resend evt_...`).
- How to inspect `billing_events` for a stuck event and force re-processing (delete the row, then resend from the Dashboard).
- What each event handler does and which DB tables it writes.
- The grace-period semantics for `past_due` (3 days).
- Where the legacy backfill grandfather subscriptions live and how to identify them (`metadata.backfill = 'legacy'`).

Keep it under one page. Example skeleton:
```markdown
# Stripe Webhook Runbook

## Source of truth
- `profiles.plan`, `profiles.stripe_customer_id`, `subscriptions`, `billing_events`.
- The webhook (`/api/stripe/webhook`) is the only path that writes plan changes.

## Rotating the signing secret
1. Stripe Dashboard → Developers → Webhooks → endpoint → Roll signing secret.
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel for production, in `.env.local` for dev.
3. Redeploy. The old secret is invalidated immediately.

## Replaying a stuck event
1. Find the event ID in Stripe Dashboard → Developers → Events.
2. Delete the dedup row if you need to force re-processing:
   `DELETE FROM billing_events WHERE event_id = 'evt_...';`
3. Click "Resend" in the Stripe Dashboard or run `stripe events resend evt_...`.

## Past-due grace period
- We keep the user on their paid plan for 3 days after `current_period_end` if the subscription is `past_due` (Stripe Smart Retries is attempting recovery).
- After 3 days, `getActivePlan` returns `tier: 'free'` even though `subscriptions.status` is still `past_due`. The user retains the option to update their card via the Customer Portal.

## Backfill grandfather subscriptions
- Created by `scripts/backfill_legacy_paid_users.ts` for users who paid once under the old one-time-charge flow.
- Identified by `metadata.backfill = 'legacy'` on the Stripe Subscription and a `trial_end` in 2125.
- These never charge.
```

- [ ] **Step 2: Full regression test**

Run the full happy-path again from scratch with a brand new test user:
1. Sign up.
2. `/upgrade?plan=team` → complete checkout.
3. Verify in DB: `subscriptions.status = 'active'`, `profiles.plan = 'team'`, `stripe_customer_id` set.
4. Invite a second user to the team via `/team`. Confirm the invitee can join.
5. Confirm `profiles.plan` for the invitee is still `'free'`.
6. Confirm the invitee can access team features (via `hasTeamAccess`).
7. In Stripe Dashboard → Customers → cancel the owner's subscription immediately.
8. Confirm `profiles.plan` for the owner reverts to `'free'`.
9. Confirm the invitee loses team access (next request returns the upgrade prompt).

Run: `npm test`
Expected: all unit tests pass (Tasks 2, 3, 12).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors related to this PR (pre-existing lint issues outside the changed files are out of scope).

- [ ] **Step 3: Open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(billing): subscription model + webhook source-of-truth (PR-6)" --body "$(cat <<'EOF'
## Summary
- Switch Stripe Checkout from `mode: 'payment'` to `mode: 'subscription'` with pre-created Price IDs (`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_TEAM_MONTHLY`).
- Add `/api/stripe/webhook` with raw-body signature verification, `billing_events`-based dedup, and handlers for `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_{succeeded,failed}`.
- New schema: `subscriptions` and `billing_events` tables, `profiles.stripe_customer_id`, and a trigger that blocks user-initiated writes to `profiles.plan`.
- Demote `/api/stripe/verify` to a UX-only confirmation; the webhook owns DB writes.
- Add `/api/stripe/portal` and a "Manage billing" button in `/settings`.
- Close C3/C6: team join no longer grants the team plan; require an active Team plan on the inviter.
- Migrate all server-side paid-feature gates to `getActivePlan` with a 3-day grace period for `past_due`.
- Backfill script for legacy paid users (grandfather subscriptions).
- Deprecate `/api/stripe/sync-plan` and remove its settings UI.

## Test plan
- [ ] Vitest unit tests pass (`npm test`).
- [ ] Type-check passes (`npx tsc --noEmit`).
- [ ] Full subscribe + cancel flow works end-to-end with Stripe test mode + `stripe listen`.
- [ ] Past-due → grace-period → expired transitions downgrade access correctly.
- [ ] Team join with inactive owner returns 402; team join with active owner does NOT mutate invitee `profiles.plan`.
- [ ] Backfill dry-run + apply both behave as expected in test mode.

## Out of scope
- Marketing/legal copy (C5), tax, multi-currency, annual plans, trials, dunning banner UI, per-feature flag enforcement.
EOF
)"
```

- [ ] **Step 4: Final commit (runbook)**

```bash
git add docs/runbooks/stripe-webhook.md
git commit -m "docs: stripe webhook runbook"
git push
```

---

## Self-Review Notes

- **Spec coverage:** Every item in PAYMENTS_REVIEW.md §9.12 is addressed by a task. C3 → Task 14. C6 → Task 14. C1 → Task 10. C2 → Task 9. C4 → Task 15. S1 → Task 4 + Task 10. S2 → Task 3 + Task 10. S3 → Task 10 (pre-created prices via env). S8 → Task 11 (downgrade rejection). S9 → Task 9 (raw body). S10 → already in `lib/stripe.ts`. S12 → Task 11 (verify no longer writes; webhook upsert via PK is race-safe). C5 / S4 / S5 / S7 / S11 / S13 are explicitly out of scope and listed in the header.
- **Placeholder scan:** Every TDD step has a code block. No "TBD" / "implement later" / "similar to Task N." Webhook tests rely on Stripe CLI fixtures rather than mocked SDK because that's the realistic verification path; this is called out explicitly.
- **Type consistency:** `PlanType` is reused from `lib/plan-limits.ts` throughout. `ActivePlan.tier` is `PlanType`, status is a discriminated string. `getActivePlan` returns the same shape everywhere. The `subscriptions` schema's CHECK constraints match the strings used in handlers.
- **Known fragility:** the `'server-only'` import in Vitest-tested files. Mitigation: the pure-logic files (`price-to-plan.ts`, `idempotency-key.ts`, `decideActivePlan`) avoid `'server-only'`; the data-fetching wrappers (`getActivePlan`, `getOrCreateStripeCustomer`, handlers) import `'server-only'` and are not unit-tested. The split-file fallback is documented in Task 12 Step 3.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-19-pr6-entitlement-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
