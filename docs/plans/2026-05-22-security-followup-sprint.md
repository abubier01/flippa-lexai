# Security Hardening Follow-up Sprint

**Date:** 2026-05-22
**Branch baseline:** `chore/post-pr1-cleanup` at `HEAD`
**Status:** Draft — pending Codex review

## Context

An audit of `SECURITY_HARDENING_SPRINT.md` flagged eight findings against this
workspace. Verification against `HEAD` showed most of the "Critical" items are
already resolved — the audit was generated against an earlier snapshot and its
line numbers point at comments or imports rather than the cited code.

This plan addresses the five gaps that are **actually open** plus refreshes the
sprint doc so future audits start from an accurate baseline.

### Verified-resolved (no work needed)

- **Admin hardening** — [lib/security/admin-guard.ts:36-71](../../lib/security/admin-guard.ts#L36-L71) implements `requireAdminAccess` with prod gate + timing-safe key compare + email allowlist; called by all three admin routes ([setup-teams-v2:7-8](../../app/api/admin/setup-teams-v2/route.ts#L7-L8), [migrate-teams:143-144](../../app/api/admin/migrate-teams/route.ts#L143-L144), [migrate-tickets:60-61](../../app/api/admin/migrate-tickets/route.ts#L60-L61)).
- **Entitlement hardening (PR-6)** — [app/actions/stripe.ts:36](../../app/actions/stripe.ts#L36) uses `mode: 'subscription'`; [sync-plan/route.ts](../../app/api/stripe/sync-plan/route.ts) returns 410; [verify/route.ts](../../app/api/stripe/verify/route.ts) no longer mutates `profiles.plan`; [team/join/route.ts:63-65](../../app/api/team/join/route.ts#L63-L65) only updates `team_id`. Webhook, portal, migration, and `lib/plan/access.ts` all exist.
- **Ticket privacy** — [tickets/lookup/route.ts:6-19](../../app/api/tickets/lookup/route.ts#L6-L19) requires auth and rejects email mismatch; [tickets/[id]/route.ts:9](../../app/api/tickets/%5Bid%5D/route.ts#L9) requires auth. No `x-lookup-email` header fallback remains.

### Partially resolved (work below)

- **Rate limiting** — limiter exists ([lib/security/rate-limit.ts](../../lib/security/rate-limit.ts)) and is wired into the AI endpoints, but it's in-process (`globalThis` `Map`) so it does not survive Vercel's multi-instance runtime. PR-D below.
- **PR-8 deliverables** — [vitest.config.ts](../../vitest.config.ts) and [docs/runbooks/](../runbooks/) both exist. Security-specific tests do not. PR-E below.

### Open

- `/api/tickets` POST is public, uses service-role, and is unthrottled. PR-C.
- No CI workflow gates `lint`/`typecheck`/`test`. PR-B.
- Broad service-role usage across page components is undocumented. PR-F.

---

## Sequence

| # | PR | Depends on |
|---|---|---|
| **PR-A** | Audit refresh — rewrite `SECURITY_HARDENING_SPRINT.md` against HEAD | — |
| **PR-B** | CI workflow (`lint` + `typecheck` + `test`) | A |
| **PR-C** | `/api/tickets` POST hardening | B |
| **PR-D** | Shared rate limiter (Upstash) | B |
| **PR-E** | Security test suite under `lib/security/__tests__/` | B, C, D |
| **PR-F** | Service-role containment audit | E |

PR-A goes first so every downstream PR references a corrected baseline. PR-B
goes next so C…F land on a branch with gating. PR-F goes last because it has
the largest blast radius and benefits from PR-E catching regressions.

---

## PR-A — Audit refresh

**Goal:** `SECURITY_HARDENING_SPRINT.md` reflects HEAD.

**Changes:**

- Rewrite into three sections: **Resolved**, **Partially resolved**, **Open**.
- Each Resolved item cites the file:line that proves it.
- Each Open item links to the PR that will address it.
- Add a "How to re-audit" section: tell future reviewers to grep for the cited
  symbols (`requireAdminAccess`, `mode: 'subscription'`, `consumeRateLimit`)
  against HEAD before opening findings.

**Out of scope:** code or test changes.

**Acceptance:** doc renders cleanly; every Resolved claim has a file:line
citation; every Open item has an owner PR number.

---

## PR-B — CI workflow

**Goal:** every PR runs `lint`, `typecheck`, `test` before merge.

**Changes:**

- Add to `package.json`: `"typecheck": "tsc --noEmit"`.
- Create `.github/workflows/ci.yml`:
  - Trigger: `pull_request` to `main`, `push` to `main`.
  - Node 20 (matches Vercel runtime).
  - Steps: checkout → setup-node with npm cache → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test`.
  - Concurrency group keyed on `${{ github.ref }}` with `cancel-in-progress: true`.
- Do not configure required-status-checks in this PR (repo-settings change, not
  a file change). Note as follow-up in the PR description.

**Out of scope:** secrets scanning, dependency review, Vercel preview gating.

**Acceptance:** opening a PR shows three green checks; deliberately breaking
each (lint error, type error, failing test) turns the right check red.

---

## PR-C — `/api/tickets` POST hardening

**Goal:** close the abuse vector at [app/api/tickets/route.ts:6-58](../../app/api/tickets/route.ts#L6-L58).
Currently public, uses service-role for insert + auto-reply, no throttling.

**Threat model:** anonymous attacker POSTs in a loop, fills `support_tickets`
and `ticket_replies` (two writes per call), exhausts DB quota, pollutes the
support inbox.

**Changes:**

- Add IP-based rate limit at the top of the handler using existing
  `consumeRateLimit`. Key: `tickets:create:ip:${ip}`. 5 tickets / 15 min / IP.
  Return 429 with `Retry-After` on breach.
- Add per-email limit as a second key: `tickets:create:email:${normalizedEmail}`,
  3 tickets / hour. Catches an actor rotating IPs.
- Tighten input caps: `subject` ≤ 200 chars, `message` ≤ 5000, `name` ≤ 100.
- Skip the auto-reply insert when the request is unauthenticated — unauth flood
  costs one row, not two.
- Add a honeypot field (`hp_company` hidden input). If present, return 200
  silently without inserting.

**Out of scope:** captcha integration, email verification before insert.

**Acceptance:**

- `for i in {1..10}; do curl -X POST /api/tickets ...; done` — first 5 succeed,
  rest return 429.
- Repeater with same email across IPs hits the email limit after 3.

---

## PR-D — Shared rate limiter (Upstash)

**Goal:** make `consumeRateLimit` survive Vercel's multi-instance runtime.
Currently [lib/security/rate-limit.ts:26-35](../../lib/security/rate-limit.ts#L26-L35) uses a
`globalThis` `Map` — each lambda instance has its own counter, so the effective
limit is `configured_limit × instance_count`.

**Approach:** keep the public API (`consumeRateLimit`, `rateLimitHeaders`,
`getClientIp`) unchanged. Swap the backend.

**Changes:**

- Add `@upstash/redis`.
- New env vars in `.env.example`: `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`. Optional — when absent, fall back to the
  in-process `Map` (local dev and CI keep working).
- Rewrite `consumeRateLimit` as async: Redis `INCR` + `EXPIRE` fixed-window,
  atomic via pipeline or Lua. Return the same `RateLimitResult` shape.
- Update call sites to `await`: [contracts/analyze/route.ts](../../app/api/contracts/analyze/route.ts),
  [contracts/chat/route.ts](../../app/api/contracts/chat/route.ts), and the PR-C site.
- Keep `pruneStore` only on the in-process fallback path.

**Migration risk:** the call becomes async. TypeScript catches missed `await`s,
gated by PR-B.

**Out of scope:** sliding-window or token-bucket algorithms; key-strategy
changes (per-user vs per-IP stays as-is).

**Acceptance:** with Upstash env vars set, two simultaneous deployments share
the counter — verifiable by hitting the same endpoint from two regions and
seeing the limit enforced globally. Without env vars, behavior matches the
current in-process limiter.

---

## PR-E — Security test suite

**Goal:** establish `lib/security/__tests__/` and lock in hardened behavior so
regressions fail CI.

**Files:**

### `admin-guard.test.ts` — `requireAdminAccess`

- Production + `ENABLE_ADMIN_ROUTES` unset → 404.
- Valid `x-admin-key` → null (allow).
- Invalid `x-admin-key` → 403, timing-safe (compare two equal-length-but-
  different keys).
- No key + email in allowlist → null.
- No key + email not in allowlist → 403.
- No key + no allowlist + `ADMIN_API_KEY` set → 403 (not 500).
- No key + no allowlist + no `ADMIN_API_KEY` → 500.

### `rate-limit.test.ts` — `consumeRateLimit`

- First call within window → `allowed: true`, `remaining: limit-1`.
- Nth call at limit → `allowed: false`, `Retry-After ≥ 1`.
- Call after `resetAt` → bucket resets, `allowed: true`.
- Distinct keys don't share counters.
- `pruneStore` evicts expired buckets when store exceeds `MAX_BUCKETS`.
- (After PR-D) Upstash backend honors the same contract — mock the Redis client.

### `tickets-auth.test.ts` — route-level

- `POST /api/tickets/lookup` unauthenticated → 401.
- `POST /api/tickets/lookup` with mismatched email → 403.
- `GET /api/tickets/[id]` unauthenticated → 401.
- `POST /api/tickets` (after PR-C) → rate-limit triggers on 6th call from same
  IP.

**Mocking:** stub `@/lib/supabase/server`'s `createClient` to return a
controllable `auth.getUser()` and chainable `from().select()...`. Factory in
`lib/security/__tests__/helpers.ts`.

**Acceptance:** `npm run test` passes locally and in CI from PR-B; deliberately
breaking `admin-guard.ts` (e.g. removing the timing-safe compare) turns at
least one test red.

**Out of scope:** browser e2e, load tests, fuzzing.

---

## PR-F — Service-role containment audit

**Goal:** every `createServiceClient(...)` in the codebase is either (a)
deleted in favor of the RLS-bound client, or (b) annotated with a one-line
comment justifying why service-role is necessary.

**Process:**

1. **Inventory.** Grep `createServiceClient` across `app/` and `lib/`. Expected
   hits include [app/team/page.tsx:15](../../app/team/page.tsx#L15),
   [app/contracts/[id]/page.tsx:13](../../app/contracts/%5Bid%5D/page.tsx#L13),
   [app/my-tickets/page.tsx:14](../../app/my-tickets/page.tsx#L14),
   [app/api/team/join/route.ts:14](../../app/api/team/join/route.ts#L14),
   [app/api/tickets/route.ts:25](../../app/api/tickets/route.ts#L25), Stripe
   webhook handlers.
2. **Classify.** Three buckets:
   - **Necessary** (anonymous ticket insert, Stripe webhook writes, admin
     migrations) → leave, add justification comment.
   - **Replaceable with RLS-bound client** → switch to `createClient()`. Auth
     check is already there; service-role was just bypassing RLS that would
     have worked.
   - **Needs new RLS policy** → defer to a follow-up PR; call out in this PR's
     description.
3. **Edit.** Touch only the "replaceable" cases in this PR.
4. **Document.** Add `docs/runbooks/service-role-usage.md` listing every
   remaining `createServiceClient` call site with its justification. Future
   audits grep for new ones not in the list.

**Acceptance:** `grep -rn "createServiceClient" app/ lib/` matches the runbook
exactly; each match has a justification comment within 2 lines; tests from
PR-E still pass.

**Out of scope:** schema redesign, broad RLS rewrites.

---

## Open questions for Codex review

- Is fixed-window rate limiting acceptable, or should PR-D move to sliding
  window for the AI endpoints (where 12/hour is sensitive to clock alignment)?
- Should PR-C reject unauthenticated POSTs outright instead of rate-limiting
  them? Trade-off: blocks legit users without an account from filing tickets.
- For PR-F, is there an appetite to add new RLS policies in this sprint, or
  strictly conservative (annotate + defer)?
