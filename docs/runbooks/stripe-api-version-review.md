# Stripe API Version Review

## Purpose

Define a quarterly process to review and update the Stripe API version pin in `lib/stripe.ts`.

## Cadence

- Review every quarter (every 3 months).
- Record `Reviewed YYYY-MM-DD` and `Next review: YYYY-MM-DD` in `lib/stripe.ts`.

## Current baseline (as of 2026-05-23)

- Code pin: `2025-02-24.acacia`.
- Installed SDK: `stripe@17.7.0`.
- SDK type pin (`LatestApiVersion` in `node_modules/stripe/types/lib.d.ts`) is `2025-02-24.acacia`.
- Stripe changelog shows newer GA releases in Clover (`2025-09-30.clover`, `2026-01-28.clover`, `2026-02-25.clover`).

## Decision rule

1. Check Stripe changelog for newer GA versions.
2. Check installed `stripe` SDK major and its supported `LatestApiVersion`.
3. If newer API versions require a newer SDK major, do not force-cast `apiVersion` in code.
4. Plan a dedicated SDK-upgrade PR, then update `apiVersion` pin in the same PR.

## Upgrade checklist

1. Read Stripe changelog entries between current pin and target version.
2. Read stripe-node migration/changelog for each required SDK major jump.
3. Update `stripe` dependency.
4. Update `apiVersion` in `lib/stripe.ts`.
5. Run:
   - `npm run typecheck`
   - `npm run test -- app/api/stripe/webhook/__tests__/route.test.ts lib/stripe/__tests__/with-retry.test.ts lib/stripe/handlers/__tests__/charge-refunded.test.ts`
6. Validate webhook event handling in Stripe test mode.

## Why this is separate

Cross-major Stripe API upgrades can include breaking changes. Keep this work out of hygiene-only PRs.
