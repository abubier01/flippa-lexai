import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { consumeRateLimit, rateLimitHeaders } from '../rate-limit'

describe('consumeRateLimit (in-memory path)', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
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
    const team = await consumeRateLimit({ action: 'chat', userId: 'u_team', tier: 'team' })
    expect(free.limit).toBe(60)
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
})
