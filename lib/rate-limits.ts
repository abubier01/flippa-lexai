import 'server-only'

// lib/rate-limits.ts
//
// Tier 1 sliding-window wrapper around the existing Upstash-backed
// consumeRateLimit (lib/security/rate-limit.ts). Three scopes checked
// per request, in most-restrictive-first order: per-user, per-tenant,
// per-tenant-daily. Returns the first failure with mapped scope.
//
// Spec § Rate Limiting; spec test surface #19 (per-user window) and
// #20 (atomicity under concurrency).
//
// The underlying consumeRateLimit takes a single `userId` string and
// builds keys as `ai:<action>:<userId>`. We repurpose that namespace
// for the tenant scopes by passing synthetic IDs (`tenant:<tenantId>`,
// `tenant_daily:<tenantId>`). Distinct action prefixes also give
// independent buckets.

import { consumeRateLimit, type RateLimitResult } from './security/rate-limit'
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

export async function checkRateLimit(
  userId: string,
  tenantId: string,
  tier: PlanType,
): Promise<RateLimitCheckResult> {
  // 1. Per-user (most restrictive: 10/min).
  const user = await consumeRateLimit({
    action: 'analyze:perUser',
    userId,
    tier,
  })
  if (!user.allowed) return failure('user', user)

  // 2. Per-tenant (60/min across all users in tenant).
  const tenant = await consumeRateLimit({
    action: 'analyze:perTenant',
    userId: `tenant:${tenantId}`,
    tier,
  })
  if (!tenant.allowed) return failure('tenant', tenant)

  // 3. Per-tenant-daily (2000/day cost ceiling — fail-closed).
  const tenantDaily = await consumeRateLimit({
    action: 'analyze:perTenantDaily',
    userId: `tenant_daily:${tenantId}`,
    tier,
  })
  if (!tenantDaily.allowed) return failure('tenant_daily', tenantDaily)

  return { allowed: true }
}
