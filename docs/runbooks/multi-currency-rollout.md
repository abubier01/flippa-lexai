# Multi-Currency Rollout Runbook

## Purpose

Define the implementation path for moving from USD-only pricing to international billing.

## Current state

- Product pricing in `lib/products.ts` is USD-only.
- Stripe Checkout and billing flows assume one currency.

## Rollout stages

1. Currency strategy
   - Select initial supported currencies.
   - Define display/rounding rules per currency.
   - Decide fallback currency for unsupported locales.

2. Stripe catalog changes
   - Create Stripe Prices per plan per currency.
   - Store and map currency-aware price IDs in environment/config.
   - Keep plan semantics (`solo`, `pro`, `team`) independent from currency.

3. Tax and compliance
   - Enable Stripe Tax for relevant regions.
   - Add tax ID collection where required.
   - Review invoice and receipt requirements by jurisdiction.

4. Currency selection logic
   - Derive preferred currency from locale, billing country, or explicit user choice.
   - Persist selected currency on profile/account where needed.
   - Ensure subscription updates and portal flows preserve currency correctly.

5. UX updates
   - Render formatted prices per currency in marketing and upgrade flows.
   - Clarify tax inclusions/exclusions in checkout copy.

6. Observability and rollback
   - Add dashboard metrics segmented by currency.
   - Add alerts for checkout failures by currency.
   - Keep USD fallback path available during rollout.

## Testing checklist

- Unit tests for plan-to-price resolution by currency.
- End-to-end checkout tests for each supported currency.
- Webhook tests for subscription lifecycle events across currencies.
- Invoice/receipt verification in Stripe test mode for tax behavior.
