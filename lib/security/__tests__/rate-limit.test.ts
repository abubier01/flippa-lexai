import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { consumeRateLimit, rateLimitHeaders } from '../rate-limit'

describe('consumeRateLimit (in-memory path)', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests under the limit', async () => {
    const result = await consumeRateLimit({
      action: 'chat',
      userId: 'user_test_1',
      tier: 'free',
    })
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(60)
    expect(result.remaining).toBe(59)
    expect(result.retryAfterSeconds).toBe(0)
  })

  it('rejects requests over the limit', async () => {
    const input = { action: 'chat' as const, userId: 'user_test_2', tier: 'free' as const }
    for (let i = 0; i < 60; i++) {
      await consumeRateLimit(input)
    }
    const blocked = await consumeRateLimit(input)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keys are isolated per user', async () => {
    const a = await consumeRateLimit({ action: 'chat', userId: 'user_a', tier: 'free' })
    const b = await consumeRateLimit({ action: 'chat', userId: 'user_b', tier: 'free' })
    expect(a.remaining).toBe(59)
    expect(b.remaining).toBe(59)
  })

  it('keys are isolated per action', async () => {
    const chat = await consumeRateLimit({ action: 'chat', userId: 'user_c', tier: 'free' })
    const upload = await consumeRateLimit({ action: 'upload', userId: 'user_c', tier: 'free' })
    expect(chat.remaining).toBe(59)
    expect(upload.remaining).toBe(9)
  })

  it('selects the tier-sized policy', async () => {
    const free = await consumeRateLimit({ action: 'chat', userId: 'u_free', tier: 'free' })
    const pro = await consumeRateLimit({ action: 'chat', userId: 'u_pro', tier: 'pro' })
    const team = await consumeRateLimit({ action: 'chat', userId: 'u_team', tier: 'team' })
    expect(free.limit).toBe(60)
    expect(pro.limit).toBe(120)
    expect(team.limit).toBe(240)
  })

  it('falls back to free policy on unknown tier (with warning)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // @ts-expect-error — intentionally passing an unknown tier
    const result = await consumeRateLimit({ action: 'chat', userId: 'u_x', tier: 'enterprise' })
    expect(result.limit).toBe(60) // free policy limit
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('uses flat limit for anti-abuse actions regardless of tier', async () => {
    const free = await consumeRateLimit({ action: 'account-delete', userId: 'u_acc_free', tier: 'free' })
    const team = await consumeRateLimit({ action: 'account-delete', userId: 'u_acc_team', tier: 'team' })
    expect(free.limit).toBe(5)
    expect(team.limit).toBe(5)
  })

  it('throws if userId is missing', async () => {
    await expect(
      // @ts-expect-error — userId intentionally absent
      consumeRateLimit({ action: 'chat', tier: 'free' })
    ).rejects.toThrow('userId is required')
  })

  it('resets the bucket after the window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))

    const input = { action: 'chat' as const, userId: 'u_reset', tier: 'free' as const }

    // Burn through the limit
    for (let i = 0; i < 60; i++) {
      await consumeRateLimit(input)
    }
    const blocked = await consumeRateLimit(input)
    expect(blocked.allowed).toBe(false)

    // Advance past the 15-minute window
    vi.advanceTimersByTime(15 * 60 * 1000 + 1000)

    const reset = await consumeRateLimit(input)
    expect(reset.allowed).toBe(true)
    expect(reset.remaining).toBe(59)

    vi.useRealTimers()
  })
})

describe('consumeRateLimit (Upstash path)', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = 'https://stub.upstash.io'
    process.env.KV_REST_API_TOKEN = 'stub_token'
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    vi.restoreAllMocks()
  })

  it('routes through @upstash/ratelimit when env vars are present', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 15 * 60 * 1000,
    })

    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: Object.assign(
        vi.fn().mockImplementation(function () { return { limit: limitMock } }),
        { slidingWindow: vi.fn().mockReturnValue({}) },
      ),
    }))
    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(function () { return {} }),
    }))

    const { consumeRateLimit } = await import('../rate-limit')
    const result = await consumeRateLimit({
      action: 'chat',
      userId: 'u_upstash',
      tier: 'free',
    })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(59)
    expect(limitMock).toHaveBeenCalledWith('ai:chat:u_upstash')
  })

  it('returns 429-equivalent result when Upstash reports limit exceeded', async () => {
    const reset = Date.now() + 60_000
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: Object.assign(
        vi.fn().mockImplementation(function () {
          return {
            limit: vi.fn().mockResolvedValue({
              success: false,
              limit: 60,
              remaining: 0,
              reset,
            }),
          }
        }),
        { slidingWindow: vi.fn().mockReturnValue({}) },
      ),
    }))
    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(function () { return {} }),
    }))

    const { consumeRateLimit } = await import('../rate-limit')
    const result = await consumeRateLimit({
      action: 'chat',
      userId: 'u_blocked',
      tier: 'free',
    })

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('fails open with degraded=true when Upstash throws', async () => {
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: Object.assign(
        vi.fn().mockImplementation(function () {
          return { limit: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
        }),
        { slidingWindow: vi.fn().mockReturnValue({}) },
      ),
    }))
    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(function () { return {} }),
    }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { consumeRateLimit } = await import('../rate-limit')

    const result = await consumeRateLimit({
      action: 'chat',
      userId: 'u_failopen',
      tier: 'pro',
    })

    expect(result.allowed).toBe(true)
    expect(result.degraded).toBe(true)
    expect(result.limit).toBe(120)        // pro tier
    expect(result.remaining).toBe(120)    // synthetic fresh budget
    expect(errorSpy).toHaveBeenCalled()
    const call = errorSpy.mock.calls[0]
    expect(call[0]).toBe('rate_limit_backend_failure')
    const payload = call[1] as Record<string, unknown>
    expect(payload).toMatchObject({
      event: 'rate_limit_backend_failure',
      severity: 'warning',
      category: 'rate_limiter',
      action: 'chat',
      tier: 'pro',
    })
    expect(payload.user_id_hash).toBeDefined()
    expect(payload.user_id_hash).not.toBe('u_failopen')
    expect(payload.err_stack).toBeDefined()    // NEW
    expect(typeof payload.err_stack).toBe('string')  // NEW
    errorSpy.mockRestore()
  })
})

describe('rateLimitHeaders', () => {
  it('produces the documented HTTP header set', () => {
    const headers = rateLimitHeaders({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: 1_700_000_000_000,
      retryAfterSeconds: 42,
    })
    const obj = Object.fromEntries(new Headers(headers))
    expect(obj['x-ratelimit-limit']).toBe('60')
    expect(obj['x-ratelimit-remaining']).toBe('0')
    expect(obj['x-ratelimit-reset']).toBe(String(Math.floor(1_700_000_000_000 / 1000)))
    expect(obj['retry-after']).toBe('42')
  })

  it('omits retry-after when allowed (retryAfterSeconds=0)', () => {
    const headers = rateLimitHeaders({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: 1_700_000_000_000,
      retryAfterSeconds: 0,
    })
    const obj = Object.fromEntries(new Headers(headers))
    expect(obj['x-ratelimit-limit']).toBe('60')
    expect(obj['retry-after']).toBeUndefined()
  })
})
