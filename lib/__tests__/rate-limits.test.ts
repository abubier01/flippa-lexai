import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { consumeRateLimitMultiScope } from '../security/rate-limit-multi'
import { peekRateLimit, consumeRateLimit } from '../security/rate-limit'

const checkRateLimit = (userId: string, tenantId: string, tier: 'solo' | 'pro' | 'team') =>
  consumeRateLimitMultiScope({ userId, tenantId, tier })

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

// ---------------------------------------------------------------------------
// codex MAJOR — peek-then-commit prevents cross-scope budget wastage
// ---------------------------------------------------------------------------
describe('checkRateLimit — peek-then-commit (codex MAJOR fix)', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__lexaiRateLimitStore
    if (!HAS_UPSTASH) {
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN
    }
  })

  it('peekRateLimit does not decrement the bucket', async () => {
    const action = 'analyze:perUser' as const
    await consumeRateLimit({ action, userId: 'u_peek', tier: 'solo' })
    const before = await peekRateLimit({ action, userId: 'u_peek', tier: 'solo' })
    // Two peeks back-to-back must report identical remaining (peek is non-mutating).
    const after = await peekRateLimit({ action, userId: 'u_peek', tier: 'solo' })
    expect(after.remaining).toBe(before.remaining)
    expect(after.allowed).toBe(true)
  })

  it('per-tenant rejection does NOT consume per-user budget', async () => {
    const tenantId = 't_no_waste'
    // Saturate per-tenant by spending all 60 across 60 unique users (one each;
    // none of them hits the per-user cap).
    for (let i = 0; i < 60; i++) {
      const r = await checkRateLimit(`u_filler_${i}`, tenantId, 'solo')
      expect(r.allowed).toBe(true)
    }
    // Brand-new user enters the same tenant — must be rejected at the tenant
    // scope WITHOUT debiting their personal 10/min budget.
    const victim = 'u_victim_no_waste'
    const rejected = await checkRateLimit(victim, tenantId, 'solo')
    expect(rejected.allowed).toBe(false)
    if (!rejected.allowed) expect(rejected.scope).toBe('tenant')

    // Peek the victim's per-user bucket directly — must show full budget
    // (10 remaining); the rejected checkRateLimit must not have decremented.
    const victimPeek = await peekRateLimit({
      action: 'analyze:perUser',
      userId: victim,
      tier: 'solo',
    })
    expect(victimPeek.remaining).toBe(10)
  })

  it('per-tenant-daily rejection does NOT consume per-user or per-tenant budget', async () => {
    // Pre-seed the per-tenant-daily bucket to 2000 via direct consumes; then
    // a checkRateLimit call must reject at tenant_daily without touching the
    // other two scopes.
    const tenantId = 't_daily_no_waste'
    // Saturate the daily bucket through the synthetic id the wrapper uses.
    for (let i = 0; i < 2000; i++) {
      const r = await consumeRateLimit({
        action: 'analyze:perTenantDaily',
        userId: `tenant_daily:${tenantId}`,
        tier: 'solo',
      })
      if (!r.allowed) break
    }
    const dailyPeek = await peekRateLimit({
      action: 'analyze:perTenantDaily',
      userId: `tenant_daily:${tenantId}`,
      tier: 'solo',
    })
    expect(dailyPeek.allowed).toBe(false)

    const victim = 'u_daily_victim'
    const rejected = await checkRateLimit(victim, tenantId, 'solo')
    expect(rejected.allowed).toBe(false)
    if (!rejected.allowed) expect(rejected.scope).toBe('tenant_daily')

    // Per-user budget intact.
    const userPeek = await peekRateLimit({
      action: 'analyze:perUser',
      userId: victim,
      tier: 'solo',
    })
    expect(userPeek.remaining).toBe(10)
    // Per-tenant budget intact.
    const tenantPeek = await peekRateLimit({
      action: 'analyze:perTenant',
      userId: `tenant:${tenantId}`,
      tier: 'solo',
    })
    expect(tenantPeek.remaining).toBe(60)
  })

  it('all-allowed happy path still consumes all three scopes', async () => {
    const userId = 'u_happy'
    const tenantId = 't_happy'
    const r = await checkRateLimit(userId, tenantId, 'solo')
    expect(r.allowed).toBe(true)

    // After one allowed request, each scope must be down by exactly 1.
    const userPeek = await peekRateLimit({
      action: 'analyze:perUser',
      userId,
      tier: 'solo',
    })
    expect(userPeek.remaining).toBe(9)
    const tenantPeek = await peekRateLimit({
      action: 'analyze:perTenant',
      userId: `tenant:${tenantId}`,
      tier: 'solo',
    })
    expect(tenantPeek.remaining).toBe(59)
    const dailyPeek = await peekRateLimit({
      action: 'analyze:perTenantDaily',
      userId: `tenant_daily:${tenantId}`,
      tier: 'solo',
    })
    expect(dailyPeek.remaining).toBe(1999)
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
