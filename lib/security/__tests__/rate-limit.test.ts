import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  incr: vi.fn(),
  pttl: vi.fn(),
  pexpire: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@upstash/redis', () => ({
  Redis: redisMocks.constructor,
}))

type RateLimitModule = typeof import('../rate-limit')

async function loadModule(): Promise<RateLimitModule> {
  vi.resetModules()
  return import('../rate-limit')
}

describe('consumeRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    ;(globalThis as { __lexaiRateLimitStore?: unknown }).__lexaiRateLimitStore = undefined

    redisMocks.constructor.mockImplementation(function MockRedis() {
      return {
        incr: redisMocks.incr,
        pttl: redisMocks.pttl,
        pexpire: redisMocks.pexpire,
      }
    })
  })

  it('allows the first call and decrements remaining count', async () => {
    const { consumeRateLimit } = await loadModule()
    const result = await consumeRateLimit({ key: 'first', limit: 3, windowMs: 1_000, now: 1_000 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks calls after the configured limit is exceeded', async () => {
    const { consumeRateLimit } = await loadModule()
    await consumeRateLimit({ key: 'burst', limit: 2, windowMs: 1_000, now: 1_000 })
    await consumeRateLimit({ key: 'burst', limit: 2, windowMs: 1_000, now: 1_100 })
    const blocked = await consumeRateLimit({ key: 'burst', limit: 2, windowMs: 1_000, now: 1_200 })

    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('resets the bucket after window expiration', async () => {
    const { consumeRateLimit } = await loadModule()
    await consumeRateLimit({ key: 'reset', limit: 1, windowMs: 1_000, now: 1_000 })
    const reset = await consumeRateLimit({ key: 'reset', limit: 1, windowMs: 1_000, now: 2_001 })

    expect(reset.allowed).toBe(true)
    expect(reset.remaining).toBe(0)
  })

  it("doesn't share counters across different keys", async () => {
    const { consumeRateLimit } = await loadModule()
    const a1 = await consumeRateLimit({ key: 'k:a', limit: 1, windowMs: 1_000, now: 1_000 })
    const b1 = await consumeRateLimit({ key: 'k:b', limit: 1, windowMs: 1_000, now: 1_000 })
    const a2 = await consumeRateLimit({ key: 'k:a', limit: 1, windowMs: 1_000, now: 1_100 })

    expect(a1.allowed).toBe(true)
    expect(b1.allowed).toBe(true)
    expect(a2.allowed).toBe(false)
  })

  it('prunes expired buckets when store exceeds max size', async () => {
    const store = new Map<string, { count: number; resetAt: number }>()
    for (let i = 0; i < 10_001; i += 1) {
      store.set(`expired:${i}`, { count: 1, resetAt: 100 })
    }
    store.set('active', { count: 1, resetAt: 100_000 })
    ;(globalThis as { __lexaiRateLimitStore?: Map<string, { count: number; resetAt: number }> }).__lexaiRateLimitStore = store

    const { consumeRateLimit } = await loadModule()
    await consumeRateLimit({ key: 'new', limit: 3, windowMs: 1_000, now: 5_000 })

    expect(store.has('active')).toBe(true)
    expect(store.size).toBeLessThanOrEqual(3)
  })

  it('uses Upstash backend when env vars are present and preserves response contract', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    redisMocks.incr.mockResolvedValue(1)
    redisMocks.pttl.mockResolvedValue(-1)
    redisMocks.pexpire.mockResolvedValue(1)

    const { consumeRateLimit } = await loadModule()
    const result = await consumeRateLimit({ key: 'redis-key', limit: 3, windowMs: 60_000, now: 10_000 })

    expect(redisMocks.constructor).toHaveBeenCalledTimes(1)
    expect(redisMocks.incr).toHaveBeenCalledWith('rate_limit:redis-key')
    expect(redisMocks.pexpire).toHaveBeenCalledWith('rate_limit:redis-key', 60_000)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(3)
    expect(result.remaining).toBe(2)
  })
})
