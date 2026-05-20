import 'server-only'
import type { NextRequest } from 'next/server'

type Bucket = {
  count: number
  resetAt: number
}

type RateLimitInput = {
  key: string
  limit: number
  windowMs: number
  now?: number
}

type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

const MAX_BUCKETS = 10_000

declare global {
  var __lexaiRateLimitStore: Map<string, Bucket> | undefined
}

function getStore(): Map<string, Bucket> {
  if (!globalThis.__lexaiRateLimitStore) {
    globalThis.__lexaiRateLimitStore = new Map<string, Bucket>()
  }
  return globalThis.__lexaiRateLimitStore
}

function pruneStore(store: Map<string, Bucket>, now: number) {
  if (store.size <= MAX_BUCKETS) return
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key)
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  const now = input.now ?? Date.now()
  const store = getStore()
  pruneStore(store, now)

  const existing = store.get(input.key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs
    store.set(input.key, { count: 1, resetAt })
    return {
      allowed: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - 1),
      resetAt,
      retryAfterSeconds: 0,
    }
  }

  if (existing.count >= input.limit) {
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  store.set(input.key, existing)
  return {
    allowed: true,
    limit: input.limit,
    remaining: Math.max(0, input.limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
  }
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfterSeconds) }),
  }
}
