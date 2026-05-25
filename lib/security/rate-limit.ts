import 'server-only'
import type { PlanType } from '@/lib/plan-limits'
import { getPolicy, POLICIES, type RateLimitAction, type Policy } from './rate-limit-policies'

type Bucket = { count: number; resetAt: number }
type Store = Map<string, Bucket>

const STORE_KEY = '__lexaiRateLimitStore'
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
  degraded?: boolean
}

function resolvePolicy(action: RateLimitAction, tier: PlanType): Policy {
  const candidate = POLICIES[action]?.[tier]
  if (candidate) return candidate
  console.warn('rate_limit_unknown_tier', { action, tier })
  return getPolicy(action, 'free')
}

function buildKey(action: RateLimitAction, userId: string): string {
  return `ai:${action}:${userId}`
}

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
      retryAfterSeconds: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)),
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

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { action, userId, tier } = input
  if (!userId) {
    throw new Error('consumeRateLimit: userId is required')
  }
  const policy = resolvePolicy(action, tier)
  const now = Date.now()

  // Upstash branch will be added in Task 4. In-memory only for now.
  return consumeInMemory(action, userId, policy, now)
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.floor(result.resetAt / 1000)),
    'retry-after': String(result.retryAfterSeconds),
  }
}
