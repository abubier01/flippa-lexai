import 'server-only'
import type { PlanType } from '@/lib/plan-limits'
import {
  consumeRateLimit,
  peekRateLimit,
  releaseRateLimit,
  type RateLimitResult,
} from './rate-limit'
import type { RateLimitAction } from './rate-limit-policies'

// Multi-scope (per-user / per-tenant / per-tenant-daily) rate limiting.
//
// Atomicity strategy (codex MAJOR fix): peek-then-commit.
//   1. Peek all three scopes in parallel (non-mutating).
//   2. If ANY peek shows not-allowed, return that failure WITHOUT consuming
//      budget on any scope — eliminates wastage where a per-tenant rejection
//      would burn the user's quota.
//   3. If all peeks pass, consume all three sequentially; roll back earlier
//      successful consumes if a later scope rejects.
//
// Previously lived in lib/rate-limits.ts as `checkRateLimit`. Folded into the
// canonical rate-limit surface so every route uses one API.

export type RateLimitScope = 'user' | 'tenant' | 'tenant_daily'

export type MultiScopeRateLimitResult =
  | { allowed: true }
  | { allowed: false; scope: RateLimitScope; retryAfterSeconds: number }

export type MultiScopeActions = {
  user: RateLimitAction
  tenant: RateLimitAction
  tenantDaily: RateLimitAction
}

const DEFAULT_MULTI_SCOPE_ACTIONS: MultiScopeActions = {
  user: 'analyze:perUser',
  tenant: 'analyze:perTenant',
  tenantDaily: 'analyze:perTenantDaily',
}

function multiScopeFailure(
  scope: RateLimitScope,
  r: RateLimitResult,
): MultiScopeRateLimitResult {
  return {
    allowed: false,
    scope,
    retryAfterSeconds: Math.max(1, r.retryAfterSeconds),
  }
}

function commitUncertain(r: RateLimitResult): boolean {
  return r.allowed && r.committed !== true
}

export async function consumeRateLimitMultiScope(input: {
  userId: string
  tenantId: string
  tier: PlanType
  actions?: MultiScopeActions
}): Promise<MultiScopeRateLimitResult> {
  const { userId, tenantId, tier } = input
  if (!userId) throw new Error('consumeRateLimitMultiScope: userId is required')
  if (!tenantId) throw new Error('consumeRateLimitMultiScope: tenantId is required')
  const actions = input.actions ?? DEFAULT_MULTI_SCOPE_ACTIONS

  const ids = {
    user: userId,
    tenant: `tenant:${tenantId}`,
    tenant_daily: `tenant_daily:${tenantId}`,
  }

  const [userPeek, tenantPeek, dailyPeek] = await Promise.all([
    peekRateLimit({ action: actions.user, userId: ids.user, tier }),
    peekRateLimit({ action: actions.tenant, userId: ids.tenant, tier }),
    peekRateLimit({ action: actions.tenantDaily, userId: ids.tenant_daily, tier }),
  ])
  if (!userPeek.allowed) return multiScopeFailure('user', userPeek)
  if (!tenantPeek.allowed) return multiScopeFailure('tenant', tenantPeek)
  if (!dailyPeek.allowed) return multiScopeFailure('tenant_daily', dailyPeek)

  const userInput = { action: actions.user, userId: ids.user, tier }
  const tenantInput = { action: actions.tenant, userId: ids.tenant, tier }
  const dailyInput = { action: actions.tenantDaily, userId: ids.tenant_daily, tier }

  const user = await consumeRateLimit(userInput)
  if (!user.allowed) return multiScopeFailure('user', user)
  if (commitUncertain(user)) return multiScopeFailure('user', user)

  const tenant = await consumeRateLimit(tenantInput)
  if (!tenant.allowed) {
    if (user.committed === true) await releaseRateLimit(userInput)
    return multiScopeFailure('tenant', tenant)
  }
  if (commitUncertain(tenant)) {
    if (user.committed === true) await releaseRateLimit(userInput)
    return multiScopeFailure('tenant', tenant)
  }

  const daily = await consumeRateLimit(dailyInput)
  if (!daily.allowed) {
    if (tenant.committed === true) await releaseRateLimit(tenantInput)
    if (user.committed === true) await releaseRateLimit(userInput)
    return multiScopeFailure('tenant_daily', daily)
  }
  if (commitUncertain(daily)) {
    if (tenant.committed === true) await releaseRateLimit(tenantInput)
    if (user.committed === true) await releaseRateLimit(userInput)
    return multiScopeFailure('tenant_daily', daily)
  }

  return { allowed: true }
}
