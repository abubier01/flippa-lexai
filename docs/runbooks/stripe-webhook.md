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

## Webhook events handled
| Event | Action |
|---|---|
| `checkout.session.completed` | Resolve user via `client_reference_id`, upsert `subscriptions`, mirror plan to `profiles`. |
| `customer.subscription.created` | Same as above (backstop). |
| `customer.subscription.updated` | Upsert `subscriptions`, sync `profiles.plan` based on status. |
| `customer.subscription.deleted` | Mark `subscriptions.status = 'canceled'`, downgrade `profiles.plan = 'free'`. |
| `invoice.payment_failed` | Mark `subscriptions.status = 'past_due'`. |
| `invoice.payment_succeeded` | Set `subscriptions.status = 'active'`, extend `current_period_end`. |

## Operator pre-flight
Before deploying this PR to production:
- [ ] Stripe Dashboard has `LexAI Pro` and `LexAI Team` Products with recurring monthly Prices.
- [ ] Customer Portal is configured (allow cancel, switch plan, update card, view invoices).
- [ ] Webhook endpoint registered: `${APP_URL}/api/stripe/webhook` with events listed above.
- [ ] Smart Retries enabled.
- [ ] Env vars set in Vercel (production) and `.env.local` (dev): `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PORTAL_RETURN_URL`.
- [ ] Migration `scripts/005_subscriptions_and_billing_events.sql` applied via Supabase SQL Editor.
- [ ] Existing paid users backfilled via `tsx scripts/backfill_legacy_paid_users.ts --apply` (after dry-run inspection).
