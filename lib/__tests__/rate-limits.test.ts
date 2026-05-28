import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { checkRateLimit } from '../rate-limits'

const HAS_UPSTASH =
  typeof process.env.KV_REST_API_URL === 'string' &&
  process.env.KV_REST_API_URL.length > 0 &&
  typeof process.env.KV_REST_API_TOKEN === 'string' &&
  process.env.KV_REST_API_TOKEN.length > 0

describe('checkRateLimit — per-user window (spec test #19)', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    if (!HAS_UPSTASH) {
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN
    }
  })

  it('11th request as same user → allowed:false, scope: user', async () => {
    const userId = 'u_perUser_test'
    const tenantId = 't_perUser_test'
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit(userId, tenantId, 'solo')
      expect(r.allowed).toBe(true)
    }
    const blocked = await checkRateLimit(userId, tenantId, 'solo')
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.scope).toBe('user')
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('checkRateLimit — per-tenant window', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    if (!HAS_UPSTASH) {
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN
    }
  })

  it('60 unique users in same tenant within 60s → 61st returns scope:tenant', async () => {
    const tenantId = 't_perTenant_test'
    // First 60 succeed (one each, well under perUser 10 limit).
    for (let i = 0; i < 60; i++) {
      const r = await checkRateLimit(`u_pt_${i}`, tenantId, 'solo')
      expect(r.allowed).toBe(true)
    }
    const blocked = await checkRateLimit('u_pt_61', tenantId, 'solo')
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.scope).toBe('tenant')
    }
  })
})

describe('checkRateLimit — per-tenant-daily key isolation', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    if (!HAS_UPSTASH) {
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN
    }
  })

  it('makes a third consumeRateLimit call with analyze:perTenantDaily action + tenant_daily: prefix', async () => {
    // Smoke-test the third tier is wired without running 2000 calls.
    // Mock the in-memory store: after a fresh single call, three buckets exist
    // with the expected key prefixes.
    await checkRateLimit('u_td', 't_td', 'solo')
    const store = (globalThis as Record<string, unknown>).__lexaiRateLimitStore as Map<string, unknown>
    expect(store).toBeDefined()
    const keys = Array.from(store.keys())
    expect(keys.some(k => k === 'ai:analyze:perUser:u_td')).toBe(true)
    expect(keys.some(k => k === 'ai:analyze:perTenant:tenant:t_td')).toBe(true)
    expect(keys.some(k => k === 'ai:analyze:perTenantDaily:tenant_daily:t_td')).toBe(true)
  })
})

describe('checkRateLimit — atomicity under concurrency (spec test #20)', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
  })

  // Atomicity requires Upstash (Redis ZADD/EXPIRE is atomic). The in-memory
  // fallback uses JS-side check-then-incr which is single-threaded under
  // Node's event loop but ALSO sequences requests, so it does happen to give
  // the right answer here. Either way, the spec invariant is: exactly 10
  // succeed and 10 fail when 20 concurrent calls hit a 10/min limit.
  const maybeRun = HAS_UPSTASH ? it : it.skip
  maybeRun(
    '20 concurrent requests for one user → exactly 10 succeed and 10 fail (requires KV_REST_API_URL)',
    async () => {
      const userId = `u_concurrent_${Date.now()}`
      const tenantId = `t_concurrent_${Date.now()}`
      const results = await Promise.all(
        Array.from({ length: 20 }, () => checkRateLimit(userId, tenantId, 'solo')),
      )
      const allowed = results.filter(r => r.allowed).length
      const blocked = results.filter(r => !r.allowed).length
      expect(allowed).toBe(10)
      expect(blocked).toBe(10)
    },
  )

  // In-memory smoke test (deterministic under single-threaded JS): we still
  // assert the same shape so a regression in the wrapper logic surfaces.
  it('20 sequential requests for one user → exactly 10 succeed and 10 fail (in-memory)', async () => {
    if (!HAS_UPSTASH) {
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN
    }
    const userId = 'u_seq_atom'
    const tenantId = 't_seq_atom'
    let allowed = 0
    let blocked = 0
    for (let i = 0; i < 20; i++) {
      const r = await checkRateLimit(userId, tenantId, 'solo')
      if (r.allowed) allowed++
      else blocked++
    }
    expect(allowed).toBe(10)
    expect(blocked).toBe(10)
  })
})
