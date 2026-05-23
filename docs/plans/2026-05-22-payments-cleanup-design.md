# Payments Cleanup & Free→Solo Conversion — Design

**Date:** 2026-05-22
**Branch baseline:** `chore/post-pr1-cleanup` at `HEAD`
**Status:** Draft — design validated, ready for implementation planning
**Source review:** `PAYMENTS_REVIEW.md` (local-only, not committed)

## Context

`PAYMENTS_REVIEW.md` was re-validated against the current code. Most of the
original Critical/Significant findings are resolved. Nine actionable items
remain. This plan also folds in a product change: rename the `free` plan to
`solo` and convert it from $0 to $1/month, with a mandatory post-signup
Stripe Checkout step.

This plan slots around the security follow-up sprint
(`2026-05-22-security-followup-sprint.md`); it touches different files and
does not block or get blocked by PR-A…F there. CI from security PR-B is a
soft prerequisite (typecheck + test gates make PAY-3's logger refactor
safer).

### Findings closed by this sprint

| ID | Source | Resolution PR |
|---|---|---|
| **C5** | Upgrade-page copy contradicts subscription model | PAY-1 |
| **N1** | `charge.refunded` not handled | PAY-4 |
| **N2** | No in-app dunning UI | PAY-5 |
| **N3** | `profile.plan` + `getActivePlan` dual read | PAY-2 |
| **S4** | Confirm Stripe API version pin is GA | PAY-6 |
| **S5** | No structured logging / PII redaction | PAY-3 |
| **S7** | Boolean feature flags not enforced server-side | PAY-2 |
| **S11** | No retry/backoff on Stripe API reads | PAY-4 |
| **S13** | USD-only / no tax — document the assumption | PAY-6 |
| **NEW** | Free → Solo rename + $1/month Stripe Price | PAY-0a |
| **NEW** | Mandatory post-signup checkout + middleware | PAY-0b |

---

## Sequence

Eight PRs. PAY-0 is split into PAY-0a (plan rename) and PAY-0b
(mandatory checkout + middleware) so the load-bearing middleware change
can be reviewed and rolled back independently from the mechanical
rename.

| # | PR | Changes | Depends on |
|---|---|---|---|
| **PAY-0a** | Free → Solo rename + Solo Stripe Price + copy sweep | Plan enum, schema, products, prices, copy. No signup-flow change. | none |
| **PAY-0b** | Mandatory post-signup checkout + `/onboarding/subscribe` + fail-closed middleware (feature-flagged) | Signup-flow change behind `NEXT_PUBLIC_REQUIRE_SUBSCRIPTION` | PAY-0a |
| **PAY-1** | Upgrade-page copy fix | C5 | PAY-0a |
| **PAY-2** | Feature-flag server enforcement | S7, N3 | PAY-0a |
| **PAY-3** | Structured logger | S5 (infra only) | security PR-B (CI) |
| **PAY-4** | Webhook hardening: refunds + retry | N1, S11 | PAY-3 |
| **PAY-5** | Dunning UX | N2 | PAY-3, PAY-0b |
| **PAY-6** | Ops hygiene | S4, S13 | none |

**Rationale for splitting PAY-0:**
- The rename (PAY-0a) is a mechanical refactor — schema, enum, copy,
  Stripe Price. Tests catch most regressions. Greppable acceptance
  (`grep "free"` returns zero hits). Rollback = revert + small SQL
  down-migration.
- The signup-flow change (PAY-0b) sits in front of every authenticated
  request. Rollback = flip the env flag; code stays in place.
- Bundled, a reviewer can't separately reason about "is the rename
  correct?" from "is the middleware safe?" A production middleware bug
  would force rolling back the rename too.
- Between the two PRs the app is in a valid intermediate state: marketing
  shows "Solo $1/mo" but the old free-signup path still works. Useful
  soft-launch window.

**Rationale for PAY-0 first:**
- Most disruptive — `PlanType` enum changes, signup flow gains a Stripe
  step, every UI mentioning "Free" must be updated.
- Doing it after PAY-1 would re-touch the upgrade page twice.
- Doing it after PAY-2 would mean writing feature gates against `free`
  then immediately rewriting them against `solo`.
- Largest blast radius — benefits most from being reviewed in isolation.

---

## PAY-0a — Free → Solo rename + Solo Stripe Price + copy sweep

**Goal:** rename the `free` plan to `solo` everywhere in code, schema,
and copy. Create the Solo Stripe Price. **No signup-flow change** — the
new Price is dormant infrastructure waiting for PAY-0b to wire it up.

**Greenfield note:** there are no existing users, so no
migration/backfill script is needed beyond the schema rename.

### Schema changes

- Migration updates `TEXT` plan columns and constraints (there is no SQL
  enum today): rewrite any `'free'` literals in `profiles.plan` and
  `subscriptions.plan` to `'solo'` (defensive — should be zero rows).
- `profiles.plan` default changes from `'free'` to `'solo'`.
- CHECK constraint on both columns: `plan IN ('solo','pro','team')`.
- TypeScript narrowing updated in [lib/plan-limits.ts](../../lib/plan-limits.ts).

### Stripe Dashboard work (documented in PR)

- Create `STRIPE_PRICE_SOLO_MONTHLY` Price = $1/month, recurring.
- Add env vars to `.env.example` and Vercel (test + prod):
  `STRIPE_PRICE_SOLO_MONTHLY`, `PRICE_SOLO_CENTS=100`.
- Update [lib/stripe/price-to-plan.ts](../../lib/stripe/price-to-plan.ts)
  to map the new price ID ↔ `'solo'`.
- Update [lib/products.ts](../../lib/products.ts): add `lexai-solo`
  product with `priceInCents: parseInt(process.env.PRICE_SOLO_CENTS ?? '100', 10)`.

### `PLAN_LIMITS` rewrite

[lib/plan-limits.ts](../../lib/plan-limits.ts) — the `free` entry becomes
`solo`. **Solo limits = today's Free limits:** 5 contracts/mo, 20
msgs/contract, no boolean features. Preserves Pro/Team upgrade incentive.

### Copy / UI sweep

- Landing page: every mention of "Free" → "Solo $1/mo" or removed.
- [components/landing/landing-pricing.tsx](../../components/landing/landing-pricing.tsx) — add Solo as leftmost card.
- [app/(public)/terms/page.tsx:35](../../app/(public)/terms/page.tsx#L35) — rewrite the Free paragraph as Solo.
- [components/landing/landing-cta.tsx:26](../../components/landing/landing-cta.tsx#L26) — remove "No credit card required" copy (PAY-0b will require one).
- Settings page plan badges.

### Tests

- `getActivePlan` returns `solo` for users with an active $1 sub.
- Webhook accepts the new Solo price ID via `priceIdToPlan`.
- Greppable assertion: no occurrence of the literal `'free'` in `app/`
  or `lib/` outside of test fixtures and migration files.

### Acceptance

- `grep -rn "'free'\|\"free\"" app/ lib/ components/` returns no hits
  outside `__tests__/` fixtures and migration files.
- A user with `subscriptions.status = 'active'` and `plan = 'solo'` hits
  the 5/20 limits.
- The old free-signup path still works (no gating change yet — that
  comes in PAY-0b). New users land on the app as before, just labeled
  Solo.
- Stripe Dashboard shows the new Solo Price; PR description notes it's
  dormant until PAY-0b.

### Out of scope

- Signup-flow change — PAY-0b.
- Onboarding page or middleware — PAY-0b.
- Admin UI to manage plans (separate sprint).

### Risk

Low. Mechanical refactor with greppable acceptance. Rollback = revert
the PR and run the down-migration.

---

## PAY-0b — Mandatory post-signup checkout + middleware

**Goal:** require an active Stripe subscription before any authenticated
app access. Land behind a feature flag so the middleware can be enabled
in preview before production.

**Prerequisite:** PAY-0a — the `solo` plan and Stripe Price must exist.

### Signup flow change

Today (after PAY-0a): signup → email verify → app access as Solo, but
with no actual subscription (since the rename didn't change the flow).

After PAY-0b:

1. Signup → email verify (unchanged).
2. Post-verification redirect to a new `/onboarding/subscribe` page that
   renders Stripe Embedded Checkout for Solo by default with a "Choose
   Pro or Team instead" toggle.
3. **Authenticated gating** applies by surface:
   - Page routes: users without an active subscription redirect to
     `/onboarding/subscribe`.
   - API routes: users without an active subscription receive structured
     JSON errors (`402`/`403`) instead of redirects.
   - Allow-list includes `/onboarding/subscribe`, `/api/stripe/*`,
     `/auth/*`, and a small public route set.
4. Checkout completes → webhook fires `checkout.session.completed` →
   `subscriptions` row inserted → next request passes the gate.

### Middleware implementation

- Session/cookie fast path first.
- Cache "has active sub" in a short-lived cookie (60s) to avoid DB
  hammering.
- Runtime constraint: do **not** import `getActivePlan` directly into
  edge middleware (`lib/plan/access.ts` is `server-only` and service-role
  based). Keep middleware focused on auth/session and enforce subscription
  in server route handlers / server actions (or via a signed short-lived
  entitlement cookie minted server-side).
- **Fail-closed** behavior remains the target entitlement policy:
  - Page routes: redirect to onboarding.
  - API routes: return JSON entitlement errors.
- Behind feature flag `NEXT_PUBLIC_REQUIRE_SUBSCRIPTION` (default off).
  Enable in preview first; promote to production after one full week
  without regressions.

### Tests

- Middleware: unauthenticated → login.
- Middleware: authenticated + no sub + flag on → onboarding (page routes).
- Middleware: authenticated + active sub + flag on → through.
- Middleware: authenticated + flag off → through (no behavior change).
- API entitlement guard: authenticated + no sub + flag on →
  JSON `402`/`403` (no redirect/HTML).
- Fail-closed path when entitlement check errors:
  - page route redirects to onboarding
  - API route returns JSON entitlement error

### Acceptance

- With `NEXT_PUBLIC_REQUIRE_SUBSCRIPTION=true`, a new signup cannot
  reach `/contracts` or any gated feature without completing checkout.
- With `NEXT_PUBLIC_REQUIRE_SUBSCRIPTION=true`, core API endpoints
  (at minimum `/api/contracts/upload` and `/api/contracts/chat`) return
  structured JSON entitlement errors for unsubscribed users; they do not
  redirect to HTML onboarding.
- With the flag off, signup flow matches PAY-0a behavior exactly.
- A user whose subscription goes `past_due` keeps grace-period access
  (per `decideActivePlan`); the dunning banner from PAY-5 surfaces it.
- The 60-second cache prevents repeated entitlement lookups on rapid
  navigation (verifiable in logs).

### Rollout

1. Land with flag off. CI green.
2. Enable in preview. Soak for at least 48 hours.
3. Enable in production. Monitor middleware-error logs for one week.
4. After one week of clean operation, the flag can be removed in a
   follow-up PR.

### Out of scope

- Removing the feature flag itself — separate cleanup PR after soak.
- Coupon / trial logic — Solo is $1 charged from day 1.
- Admin UI to manage plans.

### Risk

**High.** The middleware sits in front of every authenticated request.
Feature-flag rollout is mandatory. Fail-closed behavior means a bug in
`getActivePlan` could lock all users out of the app — but the flag flip
restores access in seconds.

---

## PAY-1 — Upgrade-page copy fix

**Goal:** close the FTC-flavored risk at
[app/upgrade/upgrade-client.tsx:70](../../app/upgrade/upgrade-client.tsx#L70)
where copy still says "One-time payment for one month of access" while
checkout is now `mode: 'subscription'`.

**Changes:**

- Replace the line with: `"$29 billed monthly. Cancel any time from settings."` (interpolate the active price).
- Add a `<Link href="/api/stripe/portal">` cue in the "Secured by Stripe" footer for managing subscriptions after purchase.
- Sweep [components/landing/landing-pricing.tsx](../../components/landing/landing-pricing.tsx)
  to confirm `/{plan.period}` resolves correctly for the new Solo tier
  (added in PAY-0) without contradicting "monthly" copy.

**Acceptance:**

- `grep -ri "one-time" app/` returns zero hits.
- Manual: upgrade flow displays "billed monthly" language at every step.

**Out of scope:** Terms of Service rewrite (already matches code per the
review's validation).

---

## PAY-2 — Server-side feature-flag enforcement

**Goal:** close S7 (boolean features only UI-gated) and N3 (`profile.plan`
+ `getActivePlan` dual read in upload route).

### New helper in [lib/plan/access.ts](../../lib/plan/access.ts)

```ts
export type Feature =
  | 'exportPdf' | 'sharedLibrary' | 'sso'
  | 'clauseExtraction' | 'advancedRiskBreakdown'

export class PlanGateError extends Error {
  constructor(public feature: Feature, public tier: PlanType) { super(...) }
}

export async function assertHasFeature(
  userId: string,
  feature: Feature,
): Promise<ActivePlan>
```

- Reads `getActivePlan`, indexes into
  `PLAN_LIMITS[active.tier].features[feature]`.
- Throws `PlanGateError` if false; returns `ActivePlan` if true.
- Route handlers catch `PlanGateError` and respond 403 with a clear
  message including which feature was denied.

### Route audit

Grep every endpoint that renders gated functionality. Each gets an
`assertHasFeature` call at the top:
- PDF export endpoint (search via `grep -rn "exportPdf\|export-pdf"`).
- Shared-library endpoints (likely under `app/api/team/`).
- SSO endpoints (probably none exist yet — add defensive guard).
- Clause-extraction / advanced-risk endpoints if separate from the analyze flow.

If a gated feature has no endpoint (because export is client-side, for
example), document that in the PR and add the helper for when it does.

### N3 cleanup, same PR

- [app/api/contracts/upload/route.ts:36-44](../../app/api/contracts/upload/route.ts#L36-L44) — drop the `profile.plan` read; use `active.tier` exclusively.
- Same pattern in [app/api/contracts/chat/route.ts](../../app/api/contracts/chat/route.ts) if applicable.
- All gating goes through `getActivePlan` exclusively.

### Tests in `lib/plan/__tests__/access.test.ts`

- `assertHasFeature` throws `PlanGateError` when tier lacks the feature.
- `assertHasFeature` returns `ActivePlan` when granted.
- Solo cannot exportPdf; Pro can.
- Solo and Pro cannot sharedLibrary; Team can.
- Route-level: solo-tier user calling each gated endpoint receives 403.

### Acceptance

- Every gated boolean in `PLAN_LIMITS.features` has at least one
  server-side enforcement site OR a documented TODO explaining why no
  endpoint exists yet.
- `grep -rn "profile.plan" app/api` returns no hits.
- Tests added for each feature/tier combination.

### Out of scope

UI changes — UI already gates correctly. This PR is defense-in-depth for
the API surface.

---

## PAY-3 — Structured logger

**Goal:** establish `lib/logger.ts` so PAY-4 and PAY-5 use it from the
start. Pure infra; no behavior change to existing routes in this PR.

### New file: `lib/logger.ts`

```ts
log.info(scope: string, message: string, fields?: Record<string, unknown>)
log.warn(scope: string, message: string, fields?: Record<string, unknown>)
log.error(scope: string, message: string, fields?: Record<string, unknown>)
```

**Behavior:**

- Emits one JSON line per call:
  `{ "ts": "...", "level": "info", "scope": "stripe-webhook", "msg": "...", "fields": {...} }`.
- **Redaction:** walk `fields` before stringify; replace any key matching
  `/email|password|card|cvv|secret|token|raw_body|body/i` with
  `"[REDACTED]"`. Handle nested objects and arrays. Cap depth at 4 to
  prevent runaway recursion / circular refs.
- **Stripe request ID extraction:** if `fields.err` is a
  `Stripe.errors.StripeError`, pull `err.requestId` to a top-level
  `requestId` field for searchability.
- **Dev mode:** when `NODE_ENV !== 'production'`, pretty-print colored
  output instead of JSON.

### Migration in this PR

Zero behavior changes elsewhere. Add **one** call site as proof-of-life
(the webhook entry point); leave every other `console.error` alone.
PAY-4 and PAY-5 convert their surfaces. A follow-up sweep mops up the
rest.

### Tests in `lib/__tests__/logger.test.ts`

- Redacts known sensitive keys.
- Redacts nested sensitive keys.
- Does not recurse past depth 4 (circular ref test).
- Extracts Stripe `requestId` from `StripeError` shape.
- JSON output is parseable.
- Dev mode produces non-JSON output.

### Acceptance

- `lib/logger.ts` exists with the API above.
- Webhook entry point uses `log.error('stripe-webhook', ...)` and
  `log.warn(...)` for signature failure and handler errors.
- Tests pass. A test that logs `{ email: 'a@b.com' }` shows `[REDACTED]`.
- No other route is touched.

### Out of scope

- Sentry / PostHog wiring (separate sprint).
- Backfilling every other `console.error` — incremental in later PRs.

---

## PAY-4 — Webhook hardening (refunds + retry)

### Part 1: `charge.refunded` handler (N1)

Per design decision: log + alert + queue. No automatic plan change.

**Changes:**

- Add `charge.refunded` (and defensively `charge.dispute.created`) to the
  event switch in [app/api/stripe/webhook/route.ts:60-80](../../app/api/stripe/webhook/route.ts#L60-L80).
- New handler `lib/stripe/handlers/charge-refunded.ts`:
  - Resolve user via `stripe_customer_id` lookup against `profiles`.
  - Write a row to a new `refund_reviews` table with fields:
    `id`, `event_id`, `user_id`, `stripe_charge_id`, `amount_refunded`,
    `reason`, `created_at`, `reviewed_at NULL`, `decision NULL`.
  - Call `log.warn('stripe-webhook', 'refund received — manual review required', { eventId, userId, chargeId, amount })`.
  - Return successfully so `billing_events` marks the event processed.
- `charge.dispute.created` handler shares the same shape: log + queue row of type `dispute` instead of `refund`.
- **No DB change** to `subscriptions` or `profiles.plan`. Plan stays
  as-is until a human acts.

**Migration:** new `refund_reviews` table. RLS: service-role only, no
user-facing read.

**Tests:**

- Webhook with mocked `charge.refunded` event writes to `refund_reviews`
  and does not touch `subscriptions`/`profiles`.
- Same for `charge.dispute.created`.
- `billing_events` row reaches `status: 'processed'` after the handler.

### Part 2: Retry/backoff on Stripe API reads (S11)

**New file: `lib/stripe/with-retry.ts`**

```ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseMs?: number },
): Promise<T>
```

- Defaults: 3 attempts, base 250ms, exponential backoff
  (250 / 1000 / 4000ms).
- Retry only on `StripeAPIError`, `StripeConnectionError`, or HTTP 5xx.
  Don't retry 4xx.
- Add jitter (±25%) to spread retries.

**Apply at:**

- [app/api/stripe/verify/route.ts:18](../../app/api/stripe/verify/route.ts#L18) — `stripe.checkout.sessions.retrieve`.
- [lib/stripe/handlers/checkout-session-completed.ts:32](../../lib/stripe/handlers/checkout-session-completed.ts#L32) — `stripe.subscriptions.retrieve`.
- Any other `stripe.*.retrieve` calls found in the handler audit.

**Tests in `lib/stripe/__tests__/with-retry.test.ts`:**

- Returns on first success.
- Retries up to N times on 5xx, then throws.
- Does not retry on 4xx (immediate throw).
- Backoff timing approximately matches expected (mock `setTimeout`).

### Acceptance

- Refund triggered from Stripe Dashboard → row appears in
  `refund_reviews`, no plan change, log line includes `[stripe-webhook]`
  scope and Stripe event ID.
- `stripe trigger charge.refunded` test fixture passes through the new
  handler.
- Simulated 503 on session retrieve → succeeds on retry; persistent 503
  → fails after 3 attempts with `requestId` in the log.

### Out of scope

- Admin UI to review the refund queue (separate dashboard sprint).
- Email-to-ops alert on refund (requires Sentry/PostHog from follow-up).

---

## PAY-5 — Dunning UX

**Goal:** close N2. Server-side state already moves to `past_due` on
`invoice.payment_failed` ([lib/stripe/handlers/invoice-payment-failed.ts](../../lib/stripe/handlers/invoice-payment-failed.ts)),
but the user has no in-app signal.

After PAY-0 lands, dunning is universal UX — every user has a
subscription. Banner copy must not assume "you were a paid customer";
it must work for a Solo user whose $1 charge failed.

### Changes

**1. New API endpoint `app/api/billing/status/route.ts`**

Returns:
```ts
{
  status: 'active' | 'past_due' | 'grace_period' | 'canceled',
  daysRemaining?: number,
  portalUrl?: string,
}
```

Reads from `getActivePlan` and the subscription's `current_period_end`
to compute grace remaining.

**2. New client component `components/billing/dunning-banner.tsx`**

- Renders in the authenticated app shell.
- Fetches `/api/billing/status` on mount; SWR-style 60s cache.
- Renders nothing when `status === 'active'`.
- Yellow warning banner when `past_due` or `grace_period`: "Your payment
  couldn't be processed. Update your card to keep access" with a button
  POSTing to `/api/stripe/portal` and redirecting.
- Red banner when `canceled` with a "Resubscribe" CTA → `/upgrade`.
- Dismissible per-session; reappears on next load.

**3. Confirm `decideActivePlan` grace-period behavior**

Read [lib/plan/access-logic.ts](../../lib/plan/access-logic.ts) and the
test file. If `GRACE_PERIOD_DAYS` exists and is wired correctly, no
change. If not, define it (suggested: 3 days) and add tests.

**4. Integration test**

A user with `subscriptions.status = 'past_due'` and `current_period_end`
within grace window retains full access. Outside grace, loses it.

### Acceptance

- `stripe trigger invoice.payment_failed` → next request to the app
  shows the banner.
- Clicking the banner button opens Stripe Customer Portal.
- After updating the card and `invoice.payment_succeeded` fires, banner
  disappears on next page load.
- Test asserts grace-period boundary behavior at the day-N and day-N+1
  edges.

### Out of scope

- Transactional email reminders — Stripe sends defaults; custom email is
  a separate sprint.
- SMS / push notifications.

---

## PAY-6 — Ops hygiene

Two near-trivial changes bundled because both are Stripe-config hygiene
with no behavior change.

### S4: Confirm API version pin

- Check Stripe release notes for `'2025-02-24.acacia'`. Confirm GA, not beta.
- If newer GA exists: bump in [lib/stripe.ts:21](../../lib/stripe.ts#L21).
  Run full test suite. Read Stripe changelog between versions for breaking
  changes in the subset of APIs we use.
- Add comment above the pin:
  `// Reviewed YYYY-MM-DD. Next review: YYYY-MM-DD (quarterly).`
- Add runbook `docs/runbooks/stripe-api-version-review.md` with quarterly cadence.

### S13: Document USD-only assumption

- Add comment to [lib/products.ts](../../lib/products.ts) above
  `PRODUCTS`: `// All prices are USD. International currency / Stripe Tax are out of scope until we sell outside the US.`
- Add runbook `docs/runbooks/multi-currency-rollout.md` outlining the
  path when international sales materialize: enable Stripe Tax, add
  tax-ID collection, create per-currency Prices, derive currency from
  user locale.
- No code change beyond the comment.

### Acceptance

- API version comment present; runbook exists.
- USD-only comment present; runbook exists.
- No behavior change; CI green.

### Out of scope

- Actually implementing Stripe Tax or multi-currency.

---

## Risk summary

| PR | Risk |
|---|---|
| PAY-0a | Low — mechanical refactor with greppable acceptance. |
| PAY-0b | **High** — load-bearing middleware. Mandatory feature-flag rollout. |
| PAY-1 | None — copy-only. |
| PAY-2 | Medium — touches every gated route. |
| PAY-3 | Low — infra only, no behavior change. |
| PAY-4 | Medium — new table, new event types, new retry helper. |
| PAY-5 | Medium — touches authenticated app shell. |
| PAY-6 | None — comments and runbooks. |

## Design decisions applied

- **Refund policy:** human-review queue, no automatic plan change (N1).
- **Logger:** custom `lib/logger.ts`, no new dependency. Sentry deferred.
- **Feature gate failure mode:** `PlanGateError` thrown; route handlers
  catch and convert to 403.
- **Free → Solo migration:** none required (no users); pure rename.
- **Signup flow after Solo:** mandatory Stripe Checkout immediately after
  email verification; fail-closed middleware behind feature flag. Split
  from the rename (PAY-0a) into its own PR (PAY-0b) so the middleware
  can be reviewed and rolled back independently.
- **Solo limits:** identical to today's Free limits (5 contracts/mo, 20
  msgs/contract, no boolean features).
- **PR slicing:** by code locality, not by risk tier or one-per-finding.
