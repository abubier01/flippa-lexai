import 'server-only'
import { createHash } from 'crypto'
import type { PlanType } from '@/lib/plan-limits'
import { log } from '@/lib/log'
import { getPolicy, POLICIES, type RateLimitAction, type Policy } from './rate-limit-policies'

type Bucket = { count: number; resetAt: number }
type Store = Map<string, Bucket>

const STORE_KEY = '__lexaiRateLimitStore'
const PROD_NO_UPSTASH_WARNED_KEY = '__lexaiRateLimitProdNoUpstashWarned'
const MAX_BUCKETS = 10_000

function getStore(): Store {
  const g = globalThis as Record<string, unknown>
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = new Map<string, Bucket>()
  }
  return g[STORE_KEY] as Store
}

function pruneIfNeeded(store: Store, now: number) {
  if (store.size <= MAX_BUCKETS) return
  for (const [k, b] of store.entries()) {
    if (b.resetAt <= now) store.delete(k)
  }
}

export type RateLimitInput = {
  action: RateLimitAction
  userId: string
  tier: PlanType
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  degraded?: boolean // set to true on Upstash fail-open path
}

function resolvePolicy(action: RateLimitAction, tier: PlanType): Policy {
  const candidate = POLICIES[action]?.[tier]
  if (candidate) return candidate
  log.warn('rate_limit_unknown_tier', {
    subsystem: 'rate-limit',
    event: 'rate_limit_unknown_tier',
    action,
    tier,
  })
  return getPolicy(action, 'solo')
}

function buildKey(action: RateLimitAction, userId: string): string {
  return `ai:${action}:${userId}`
}

// 32-bit prefix (8 hex chars) of sha256(userId). Collision acceptable
// for fail-open diagnostics; this is not a security boundary.
function shortUserHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 8)
}

// ─── In-memory path ──────────────────────────────────────────────────────────

function consumeInMemory(
  action: RateLimitAction,
  userId: string,
  policy: Policy,
  now: number,
): RateLimitResult {
  const store = getStore()
  pruneIfNeeded(store, now)
  const key = buildKey(action, userId)
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + policy.windowMs
    store.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit - 1,
      resetAt,
      retryAfterSeconds: 0,
    }
  }

  if (bucket.count >= policy.limit) {
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return {
    allowed: true,
    limit: policy.limit,
    remaining: policy.limit - bucket.count,
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  }
}

// ─── Upstash path ────────────────────────────────────────────────────────────

type LimiterCacheKey = `${RateLimitAction}:${PlanType}`

type UpstashLimitResult = {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

type LimiterInstance = {
  limit: (key: string) => Promise<UpstashLimitResult>
  // Non-mutating "would this be allowed?" check used by peekRateLimit. Returns
  // the same shape minus `success` since peek doesn't change bucket state.
  getRemaining: (key: string) => Promise<{ remaining: number; reset: number }>
}

const limiterCache = new Map<LimiterCacheKey, LimiterInstance>()

let cachedRedis: unknown = null

async function getLimiter(action: RateLimitAction, tier: PlanType, policy: Policy): Promise<LimiterInstance> {
  const cacheKey: LimiterCacheKey = `${action}:${tier}`
  const cached = limiterCache.get(cacheKey)
  if (cached) return cached

  const { Redis } = await import('@upstash/redis')
  const { Ratelimit } = await import('@upstash/ratelimit')

  if (!cachedRedis) {
    cachedRedis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }

  // @upstash/ratelimit's slidingWindow accepts a Duration string. Convert from
  // our numeric windowMs to the SDK's `${ms} ms` literal at this boundary so
  // callers don't have to know the SDK's format.
  const limiter = new Ratelimit({
    redis: cachedRedis as ConstructorParameters<typeof Ratelimit>[0]['redis'],
    limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowMs} ms` as `${number} ms`),
    prefix: `ratelimit:${action}:${tier}`,
    analytics: false,
    timeout: 2000, // fail-open after 2s; catch() handles the synthetic-allow path
  }) as LimiterInstance

  limiterCache.set(cacheKey, limiter)
  return limiter
}

async function consumeUpstash(
  action: RateLimitAction,
  userId: string,
  tier: PlanType,
  policy: Policy,
  now: number,
): Promise<RateLimitResult> {
  try {
    const limiter = await getLimiter(action, tier, policy)
    const result = await limiter.limit(buildKey(action, userId))
    return {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.reset,
      retryAfterSeconds: result.success
        ? 0
        : Math.max(1, Math.ceil((result.reset - now) / 1000)),
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    log.error('rate_limit_backend_failure', {
      err: e,
      subsystem: 'rate-limit',
      backend: 'upstash',
      event: 'rate_limit_backend_failure',
      category: 'rate_limiter',
      severity: 'warning',
      action,
      tier,
      user_id_hash: shortUserHash(userId),
    })
    if (policy.failMode === 'closed') {
      const resetAt = now + policy.windowMs
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil(policy.windowMs / 1000)),
        degraded: true,
      }
    }
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now + policy.windowMs,
      retryAfterSeconds: 0,
      degraded: true,
    }
  }
}

// ─── Peek (non-consumptive) ──────────────────────────────────────────────────

function peekInMemory(
  action: RateLimitAction,
  userId: string,
  policy: Policy,
  now: number,
): RateLimitResult {
  const store = getStore()
  const key = buildKey(action, userId)
  const bucket = store.get(key)

  // No bucket yet, or expired → full budget would be available.
  if (!bucket || bucket.resetAt <= now) {
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now + policy.windowMs,
      retryAfterSeconds: 0,
    }
  }
  const remaining = Math.max(0, policy.limit - bucket.count)
  return {
    allowed: remaining > 0,
    limit: policy.limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds:
      remaining > 0 ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

async function peekUpstash(
  action: RateLimitAction,
  userId: string,
  tier: PlanType,
  policy: Policy,
  now: number,
): Promise<RateLimitResult> {
  try {
    const limiter = await getLimiter(action, tier, policy)
    const { remaining, reset } = await limiter.getRemaining(buildKey(action, userId))
    return {
      allowed: remaining > 0,
      limit: policy.limit,
      remaining,
      resetAt: reset,
      retryAfterSeconds:
        remaining > 0 ? 0 : Math.max(1, Math.ceil((reset - now) / 1000)),
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    log.error('rate_limit_backend_failure', {
      err: e,
      subsystem: 'rate-limit',
      backend: 'upstash',
      event: 'rate_limit_backend_failure',
      category: 'rate_limiter',
      severity: 'warning',
      action,
      tier,
      op: 'peek',
      user_id_hash: shortUserHash(userId),
    })
    // Match consumeUpstash error semantics: fail-closed budgets stay closed,
    // fail-open budgets remain open. A degraded peek that says allowed:true
    // still gates the eventual consume — degradation is consistent.
    if (policy.failMode === 'closed') {
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetAt: now + policy.windowMs,
        retryAfterSeconds: Math.max(1, Math.ceil(policy.windowMs / 1000)),
        degraded: true,
      }
    }
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now + policy.windowMs,
      retryAfterSeconds: 0,
      degraded: true,
    }
  }
}

export async function peekRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { action, userId, tier } = input
  if (!userId) {
    throw new Error('peekRateLimit: userId is required')
  }
  const policy = resolvePolicy(action, tier)
  const now = Date.now()

  const useUpstash =
    typeof process.env.KV_REST_API_URL === 'string' &&
    process.env.KV_REST_API_URL.length > 0 &&
    typeof process.env.KV_REST_API_TOKEN === 'string' &&
    process.env.KV_REST_API_TOKEN.length > 0

  if (useUpstash) {
    return peekUpstash(action, userId, tier, policy, now)
  }
  return peekInMemory(action, userId, policy, now)
}

// ─── Public entry point ──────────────────────────────────────────────────────

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { action, userId, tier } = input
  if (!userId) {
    throw new Error('consumeRateLimit: userId is required')
  }
  const policy = resolvePolicy(action, tier)
  const now = Date.now()

  const useUpstash =
    typeof process.env.KV_REST_API_URL === 'string' &&
    process.env.KV_REST_API_URL.length > 0 &&
    typeof process.env.KV_REST_API_TOKEN === 'string' &&
    process.env.KV_REST_API_TOKEN.length > 0

  if (useUpstash) {
    return consumeUpstash(action, userId, tier, policy, now)
  }

  // In production, in-memory fallback under-enforces limits across instances.
  // Emit one loud process-level warning for operator visibility.
  if (process.env.NODE_ENV === 'production') {
    const g = globalThis as Record<string, unknown>
    if (!g[PROD_NO_UPSTASH_WARNED_KEY]) {
      g[PROD_NO_UPSTASH_WARNED_KEY] = true
      log.error('rate_limit_backend_missing', {
        subsystem: 'rate-limit',
        event: 'rate_limit_backend_missing',
        category: 'rate_limiter',
        severity: 'error',
        mode: 'in_memory_fallback',
        has_kv_rest_api_url: Boolean(process.env.KV_REST_API_URL),
        has_kv_rest_api_token: Boolean(process.env.KV_REST_API_TOKEN),
      })
    }
  }
  return consumeInMemory(action, userId, policy, now)
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  const base: Record<string, string> = {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.floor(result.resetAt / 1000)),
  }
  if (result.retryAfterSeconds > 0) {
    base['retry-after'] = String(result.retryAfterSeconds)
  }
  return base
}
