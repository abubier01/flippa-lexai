import 'server-only'
import type { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'

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
const REDIS_PREFIX = 'rate_limit:'

declare global {
  var __lexaiRateLimitStore: Map<string, Bucket> | undefined
}

let cachedRedis: Redis | null | undefined

function getStore(): Map<string, Bucket> {
  if (!globalThis.__lexaiRateLimitStore) {
    globalThis.__lexaiRateLimitStore = new Map<string, Bucket>()
  }
  return globalThis.__lexaiRateLimitStore
}

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) {
    return cachedRedis
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) {
    cachedRedis = null
    return cachedRedis
  }

  cachedRedis = new Redis({ url, token })
  return cachedRedis
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

function consumeRateLimitInMemory(input: RateLimitInput): RateLimitResult {
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

async function consumeRateLimitWithRedis(input: RateLimitInput): Promise<RateLimitResult> {
  const now = input.now ?? Date.now()
  const redis = getRedis()
  if (!redis) {
    return consumeRateLimitInMemory(input)
  }

  const redisKey = `${REDIS_PREFIX}${input.key}`
  const count = await redis.incr(redisKey)
  let ttlMs = await redis.pttl(redisKey)
  if (count === 1 || ttlMs < 0) {
    await redis.pexpire(redisKey, input.windowMs)
    ttlMs = input.windowMs
  }

  const positiveTtlMs = Math.max(0, ttlMs)
  const resetAt = now + positiveTtlMs

  if (count > input.limit) {
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(positiveTtlMs / 1000)),
    }
  }

  return {
    allowed: true,
    limit: input.limit,
    remaining: Math.max(0, input.limit - count),
    resetAt,
    retryAfterSeconds: 0,
  }
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  try {
    return await consumeRateLimitWithRedis(input)
  } catch (error) {
    console.error('[rate-limit] redis backend failed, falling back to in-memory store:', error)
    return consumeRateLimitInMemory(input)
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
