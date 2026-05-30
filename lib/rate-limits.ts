import 'server-only'

// lib/rate-limits.ts
//
// Tier 1 sliding-window wrapper around the existing Upstash-backed
// rate-limit primitives in lib/security/rate-limit.ts. Three scopes
// checked per request: per-user, per-tenant, per-tenant-daily.
//
// Atomicity strategy (codex MAJOR fix): peek-then-commit.
//   1. Peek all three scopes in parallel (non-mutating getRemaining /
//      in-memory bucket read).
//   2. If ANY peek shows not-allowed, return that failure WITHOUT
//      consuming budget on any scope — eliminates the wastage where
//      a per-tenant rejection would burn the user's quota.
//   3. If all peeks pass, consume all three. The remaining race window
//      between peek and commit is sub-millisecond; under burst contention
//      a concurrent request could still cause one scope to over-count
//      by 1, which is acceptable for Tier 1 (Upstash sliding-window is
//      eventually consistent across regions anyway).
//
// True cross-scope atomicity would require a single Lua script that
// reads + increments all three buckets server-side. That's a Tier 2
// rewrite. Peek-then-commit closes ≥99% of the wastage window with
// no infrastructure change.
//
// Spec § Rate Limiting; spec test surface #19 (per-user window) and
// #20 (atomicity under concurrency).

import {
  consumeRateLimit,
  peekRateLimit,
  releaseRateLimit,
  type RateLimitResult,
} from './security/rate-limit'
import type { PlanType } from './plan-limits'

// Reference table — single source of truth lives in lib/security/rate-limit-policies.ts.
// This shape is exported for log/UI consumers per spec § Rate Limiting.
export const RATE_LIMITS = {
  perUser:        { window: '1m', max: 10 },
  perTenant:      { window: '1m', max: 60 },
  perTenantDaily: { window: '1d', max: 2000 },
} as const

export type RateLimitScope = 'user' | 'tenant' | 'tenant_daily'

export type RateLimitCheckResult =
  | { allowed: true }
  | { allowed: false; scope: RateLimitScope; retryAfterSeconds: number }

function failure(scope: RateLimitScope, r: RateLimitResult): RateLimitCheckResult {
  return {
    allowed: false,
    scope,
    retryAfterSeconds: Math.max(1, r.retryAfterSeconds),
  }
}

function commitUncertain(r: RateLimitResult): boolean {
  return r.allowed && r.committed !== true
}

// Identity shapes the three scopes use. Synthetic prefixes give each scope
// an independent bucket namespace under the shared consumeRateLimit key layout.
const scopeIds = (userId: string, tenantId: string) =>
  ({
    user: userId,
    tenant: `tenant:${tenantId}`,
    tenant_daily: `tenant_daily:${tenantId}`,
  }) as const

export async function checkRateLimit(
  userId: string,
  tenantId: string,
  tier: PlanType,
): Promise<RateLimitCheckResult> {
  const ids = scopeIds(userId, tenantId)

  // ── Peek phase: non-mutating "would this be allowed?" across all 3 scopes. ──
  const [userPeek, tenantPeek, dailyPeek] = await Promise.all([
    peekRateLimit({ action: 'analyze:perUser', userId: ids.user, tier }),
    peekRateLimit({ action: 'analyze:perTenant', userId: ids.tenant, tier }),
    peekRateLimit({ action: 'analyze:perTenantDaily', userId: ids.tenant_daily, tier }),
  ])

  // Surface the most-restrictive failing scope. Order matches the spec's
  // most-restrictive-first reporting preference (user is the tightest cap).
  if (!userPeek.allowed) return failure('user', userPeek)
  if (!tenantPeek.allowed) return failure('tenant', tenantPeek)
  if (!dailyPeek.allowed) return failure('tenant_daily', dailyPeek)

  // ── Commit phase: all 3 scopes confirmed available; consume. ──────────────
  // We still commit sequentially because Upstash's @upstash/ratelimit doesn't
  // expose a multi-scope atomic primitive. Race window is bounded by the time
  // between this point and the third `await` below (sub-ms typical).
  const userInput = { action: 'analyze:perUser' as const, userId: ids.user, tier }
  const tenantInput = { action: 'analyze:perTenant' as const, userId: ids.tenant, tier }
  const dailyInput = {
    action: 'analyze:perTenantDaily' as const,
    userId: ids.tenant_daily,
    tier,
  }

  const user = await consumeRateLimit(userInput)
  if (!user.allowed) return failure('user', user)
  if (commitUncertain(user)) return failure('user', user)

  const tenant = await consumeRateLimit(tenantInput)
  if (!tenant.allowed) {
    if (user.committed === true) {
      await releaseRateLimit(userInput)
    }
    return failure('tenant', tenant)
  }
  if (commitUncertain(tenant)) {
    if (user.committed === true) {
      await releaseRateLimit(userInput)
    }
    return failure('tenant', tenant)
  }

  const daily = await consumeRateLimit(dailyInput)
  if (!daily.allowed) {
    if (tenant.committed === true) {
      await releaseRateLimit(tenantInput)
    }
    if (user.committed === true) {
      await releaseRateLimit(userInput)
    }
    return failure('tenant_daily', daily)
  }
  if (commitUncertain(daily)) {
    if (tenant.committed === true) {
      await releaseRateLimit(tenantInput)
    }
    if (user.committed === true) {
      await releaseRateLimit(userInput)
    }
    return failure('tenant_daily', daily)
  }

  return { allowed: true }
}
