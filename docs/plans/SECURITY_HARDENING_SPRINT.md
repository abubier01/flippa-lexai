# Security Hardening Sprint (HEAD Audit Baseline)

**Date:** 2026-05-22  
**Audited branch state:** `HEAD`  
**Canonical status source:** [2026-05-22-security-followup-sprint.md](./2026-05-22-security-followup-sprint.md)

This document is the canonical security audit baseline for this repo as of
2026-05-22. It reflects verified code state at `HEAD` and maps open work to
owner PRs in the follow-up sprint plan.

## Resolved

- **Admin route hardening is implemented.**  
  `requireAdminAccess` enforces production route disablement, API key
  validation (timing-safe compare), and allowlist fallback:
  [lib/security/admin-guard.ts:36](../../lib/security/admin-guard.ts#L36),
  [lib/security/admin-guard.ts:37](../../lib/security/admin-guard.ts#L37),
  [lib/security/admin-guard.ts:45](../../lib/security/admin-guard.ts#L45),
  [lib/security/admin-guard.ts:67](../../lib/security/admin-guard.ts#L67).  
  Guard is called by admin mutation routes:
  [app/api/admin/setup-teams-v2/route.ts:7](../../app/api/admin/setup-teams-v2/route.ts#L7),
  [app/api/admin/migrate-teams/route.ts:143](../../app/api/admin/migrate-teams/route.ts#L143),
  [app/api/admin/migrate-tickets/route.ts:60](../../app/api/admin/migrate-tickets/route.ts#L60).

- **Entitlement hardening changes are in place.**  
  Checkout is subscription mode:
  [app/actions/stripe.ts:36](../../app/actions/stripe.ts#L36).  
  Legacy sync endpoint is deprecated (410):
  [app/api/stripe/sync-plan/route.ts:8](../../app/api/stripe/sync-plan/route.ts#L8).  
  Verify endpoint performs validation and does not write plan fields:
  [app/api/stripe/verify/route.ts:31](../../app/api/stripe/verify/route.ts#L31),
  [app/api/stripe/verify/route.ts:47](../../app/api/stripe/verify/route.ts#L47).  
  Team join path updates `profiles.team_id` only (not `profiles.plan`):
  [app/api/team/join/route.ts:63](../../app/api/team/join/route.ts#L63),
  [app/api/team/join/route.ts:65](../../app/api/team/join/route.ts#L65).

- **Ticket privacy protections are active for lookup/read APIs.**  
  Lookup requires auth and blocks mismatched emails:
  [app/api/tickets/lookup/route.ts:8](../../app/api/tickets/lookup/route.ts#L8),
  [app/api/tickets/lookup/route.ts:17](../../app/api/tickets/lookup/route.ts#L17).  
  Ticket detail route requires auth:
  [app/api/tickets/[id]/route.ts:9](../../app/api/tickets/%5Bid%5D/route.ts#L9).

## Partially Resolved

- **Rate limiting exists but is process-local.**  
  The limiter uses an in-memory `globalThis` `Map`, so counters are not shared
  across serverless instances:
  [lib/security/rate-limit.ts:27](../../lib/security/rate-limit.ts#L27),
  [lib/security/rate-limit.ts:31](../../lib/security/rate-limit.ts#L31).  
  It is already wired into AI routes:
  [app/api/contracts/analyze/route.ts:21](../../app/api/contracts/analyze/route.ts#L21),
  [app/api/contracts/chat/route.ts:22](../../app/api/contracts/chat/route.ts#L22).  
  **Owner:** PR-D in
  [2026-05-22-security-followup-sprint.md](./2026-05-22-security-followup-sprint.md).

- **PR-8 scaffolding exists, security-specific tests still need to be added.**  
  Vitest is configured and includes `__tests__` patterns:
  [vitest.config.ts:6](../../vitest.config.ts#L6).  
  Runbooks directory exists (example):
  [docs/runbooks/stripe-webhook.md](../runbooks/stripe-webhook.md).  
  **Owner:** PR-E in
  [2026-05-22-security-followup-sprint.md](./2026-05-22-security-followup-sprint.md).

## Open

- **`POST /api/tickets` remains a public, unthrottled service-role write path.**  
  Public route and optional auth:
  [app/api/tickets/route.ts:5](../../app/api/tickets/route.ts#L5),
  [app/api/tickets/route.ts:20](../../app/api/tickets/route.ts#L20).  
  Service-role insert + auto-reply writes:
  [app/api/tickets/route.ts:25](../../app/api/tickets/route.ts#L25),
  [app/api/tickets/route.ts:51](../../app/api/tickets/route.ts#L51).  
  **Owner:** PR-C in
  [2026-05-22-security-followup-sprint.md](./2026-05-22-security-followup-sprint.md).

- **No CI workflow currently gates `lint` / `typecheck` / `test`.**  
  Scripts include `lint` and `test`, but no `typecheck` yet:
  [package.json:9](../../package.json#L9),
  [package.json:10](../../package.json#L10).  
  (Verified 2026-05-22: `.github/workflows/` is absent.)  
  **Owner:** PR-B in
  [2026-05-22-security-followup-sprint.md](./2026-05-22-security-followup-sprint.md).

- **Service-role usage remains broad and needs containment documentation.**  
  Examples:
  [app/team/page.tsx:15](../../app/team/page.tsx#L15),
  [app/contracts/[id]/page.tsx:14](../../app/contracts/%5Bid%5D/page.tsx#L14),
  [app/api/team/join/route.ts:14](../../app/api/team/join/route.ts#L14),
  [lib/stripe/event-deduper.ts:22](../../lib/stripe/event-deduper.ts#L22).  
  **Owner:** PR-F in
  [2026-05-22-security-followup-sprint.md](./2026-05-22-security-followup-sprint.md).

## How To Re-audit

Run these commands from repo root before creating new findings:

```bash
rg -n "requireAdminAccess" app/api/admin lib/security/admin-guard.ts
rg -n "mode: 'subscription'" app/actions/stripe.ts
rg -n "consumeRateLimit|getClientIp|rateLimitHeaders" app/api/contracts app/api/tickets lib/security/rate-limit.ts
rg -n "x-lookup-email" app lib
rg -n "createServiceClient\\(" app lib
ls -la .github/workflows
```

Expected signals:

- `requireAdminAccess` appears in admin mutation routes and guard implementation.
- `mode: 'subscription'` appears in checkout session creation.
- `consumeRateLimit` appears in AI endpoints; storage backend in
  `lib/security/rate-limit.ts`.
- `x-lookup-email` should have no active usage in ticket lookup flow.
- `createServiceClient(...)` results should match the maintained containment
  runbook once PR-F lands.
- CI workflow directory should exist once PR-B lands.
