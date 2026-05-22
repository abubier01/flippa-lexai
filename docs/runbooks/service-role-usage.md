# Service-Role Usage Inventory

Last audited: 2026-05-22  
Scope: `rg -n "createServiceClient\\(" app lib`

This runbook tracks all runtime `createServiceClient(...)` usage. Each listed
call site has an inline one-line justification comment in code.

## Current call sites

| Call site | Why service-role is required |
|---|---|
| `lib/stripe/event-deduper.ts:23` | Stripe webhook idempotency lease/claim updates shared `billing_events` rows without user session context. |
| `lib/stripe/handlers/invoice-payment-succeeded.ts:7` | Renewal webhooks update subscription state from Stripe system events. |
| `lib/stripe/customers.ts:7` | Stripe customer ID linkage writes to `profiles` server-side independent of browser auth. |
| `lib/stripe/handlers/subscription-updated.ts:8` | Subscription webhook sync performs cross-user entitlement writes from Stripe events. |
| `lib/stripe/handlers/invoice-payment-failed.ts:7` | Payment-failure webhooks mark backend subscription status without end-user session credentials. |
| `app/team/page.tsx:16` | Team dashboard aggregates cross-user team/member/profile rows beyond caller-bound RLS visibility. |
| `lib/stripe/handlers/subscription-deleted.ts:7` | Cancellation webhooks downgrade entitlements in backend-only context. |
| `lib/stripe/handlers/checkout-session-completed.ts:9` | Checkout completion webhook upserts subscriptions/profiles as trusted backend flow. |
| `app/team/join/page.tsx:19` | Invite preview must work before membership exists; invite rows are not user-owned. |
| `lib/plan/access.ts:11` | Entitlement checks resolve owner/member subscription state across arbitrary users. |
| `app/contracts/[id]/page.tsx:15` | Team-shared contract view loads records that can span rows not directly readable with caller-bound RLS. |
| `app/api/team/share-contract/route.ts:9` | Team-sharing toggle updates visibility fields currently guarded by restrictive RLS update paths. |
| `app/api/team/join/route.ts:15` | Invite acceptance mutates invite/member/profile rows that are not all writable under invitee RLS. |
| `app/api/team/route.ts:10` | Team API performs owner-scoped writes plus cross-member/profile reads outside simple caller scope. |
| `app/api/team/invite/route.ts:9` | Invite creation and roster-limit checks query/write rows not all owned by the inviter. |
| `app/api/tickets/route.ts:73` | Public anonymous support ticket intake must bypass RLS for insert operations. |
| `app/api/team/members/[memberId]/route.ts:8` | Owner member-removal flow updates another user’s membership/profile rows. |

## Audit procedure

1. Run `rg -n "createServiceClient\\(" app lib`.
2. Ensure each match appears in the table above.
3. Ensure each match has a one-line nearby code comment explaining why service-role is required.
4. For any new match, either:
   - replace with caller-bound `createClient()` if safe under current RLS, or
   - document and annotate with justification before merge.
