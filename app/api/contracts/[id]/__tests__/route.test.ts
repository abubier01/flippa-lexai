/**
 * Unit tests for DELETE /api/contracts/[id]
 *
 * Covers all 7 cases from the spec:
 *   1. 401 — no authenticated user
 *   2. 429 — rate limit exceeded
 *   3. 503 — rate limiter degraded fail-closed path
 *   4. 404 — count === 0 (RLS blocks, no matching row)
 *   5. 404 — count === null (defensive branch, documented supabase-js edge case)
 *   6. 500 — database error
 *   7. 200 — successful delete
 *
 * Audit finding #1 closed: right-to-erasure DELETE endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Infrastructure mocks — vi.mock factories are hoisted; use vi.hoisted() for
// shared mutable mock references.
// ---------------------------------------------------------------------------

const { mockDeleteChain, mockSupabase, resetEqCount } = vi.hoisted(() => {
  const mockDeleteChain = {
    eq: vi.fn().mockReturnThis(),
    // Default: successful delete returning count 1
    _result: { error: null, count: 1 } as { error: { message: string } | null; count: number | null },
  }

  // eq() is called twice (id + user_id); the second call resolves the chain.
  // We track call count to return the chain on the first call and the result
  // on the second.
  let eqCallCount = 0
  mockDeleteChain.eq = vi.fn().mockImplementation(() => {
    eqCallCount += 1
    if (eqCallCount % 2 === 0) {
      // Second call — return the awaitable result
      return Promise.resolve(mockDeleteChain._result)
    }
    return mockDeleteChain
  })

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
      }),
    },
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(mockDeleteChain),
    }),
  }

  // Reset eq call counter before each test by re-assigning mockDeleteChain.eq
  // We expose a reset helper via a closure.
  const resetEqCount = () => { eqCallCount = 0 }

  return { mockDeleteChain, mockSupabase, resetEqCount }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

// Rate-limit mock — default: allowed. Individual tests override with
// mockResolvedValueOnce to simulate the limit being hit.
vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: Date.now() + 60 * 60 * 1000,
    retryAfterSeconds: 0,
  }),
  rateLimitHeaders: vi.fn().mockReturnValue({
    'X-RateLimit-Limit': '60',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.floor((Date.now() + 3600 * 1000) / 1000)),
    'Retry-After': '3600',
  }),
}))

// ---------------------------------------------------------------------------
// Import route and mock references AFTER vi.mock() declarations
// ---------------------------------------------------------------------------
import { DELETE } from '../route'
import * as rateLimitMod from '@/lib/security/rate-limit'
import * as supabaseMod from '@/lib/supabase/server'

const consumeRateLimitMock = rateLimitMod.consumeRateLimit as unknown as ReturnType<typeof vi.fn>
const createClientMock = supabaseMod.createClient as unknown as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

function buildDeleteRequest(id = 'contract-abc'): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost/api/contracts/${id}`, {
    method: 'DELETE',
  })
  const context = { params: Promise.resolve({ id }) }
  return [req, context]
}

// ---------------------------------------------------------------------------
// Helper: configure the supabase mock's delete chain for a specific result
// ---------------------------------------------------------------------------

function setDeleteResult(result: { error: { message: string } | null; count: number | null }) {
  // We need to reset the mock chain completely for each test. The easiest
  // approach: replace createClient to return a fresh supabase mock each time.
  const freshDeleteChain = {
    eq: vi.fn(),
  } as { eq: ReturnType<typeof vi.fn> }

  let eqCallCount = 0
  freshDeleteChain.eq = vi.fn().mockImplementation(() => {
    eqCallCount += 1
    if (eqCallCount % 2 === 0) {
      return Promise.resolve(result)
    }
    return freshDeleteChain
  })

  const freshSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
      }),
    },
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(freshDeleteChain),
    }),
  }

  createClientMock.mockResolvedValueOnce(freshSupabase)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/contracts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetEqCount()
    // Restore default rate limit (allowed) after each test
    consumeRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 60 * 60 * 1000,
      retryAfterSeconds: 0,
    })
  })

  // Case 1: Unauthenticated
  it('returns 401 when no user is authenticated', async () => {
    const unauthSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    }
    createClientMock.mockResolvedValueOnce(unauthSupabase)

    const [req, ctx] = buildDeleteRequest()
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  // Case 2: Rate limit exceeded
  it('returns 429 when rate limit is exceeded', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() + 60 * 60 * 1000,
      retryAfterSeconds: 3600,
    })

    // Restore default supabase (user exists)
    createClientMock.mockResolvedValueOnce(mockSupabase)

    const [req, ctx] = buildDeleteRequest()
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error).toMatch(/too many delete requests/i)
    expect(res.headers.get('Retry-After')).toBe('3600')
  })

  it('returns 503 when rate limit fails closed (degraded=true)', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      degraded: true,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 900,
    })

    createClientMock.mockResolvedValueOnce(mockSupabase)

    const [req, ctx] = buildDeleteRequest()
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toMatch(/temporarily unavailable|try again/i)
    expect(body.limitReached).toBe(false)
  })

  // Case 3: count === 0 (RLS blocked — row not found or not owned by user)
  it('returns 404 when count is 0 (RLS blocks or row does not exist)', async () => {
    setDeleteResult({ error: null, count: 0 })

    const [req, ctx] = buildDeleteRequest('not-my-contract')
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Contract not found')
  })

  // Case 4: count === null (documented supabase-js edge case — defensive branch)
  it('returns 404 when count is null (supabase-js edge case, not silently 200)', async () => {
    setDeleteResult({ error: null, count: null })

    const [req, ctx] = buildDeleteRequest('ambiguous-contract')
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Contract not found')
  })

  // Case 5: Database error
  it('returns 500 when supabase returns an error', async () => {
    setDeleteResult({ error: { message: 'connection timeout' }, count: null })

    const [req, ctx] = buildDeleteRequest()
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Failed to delete contract')
  })

  // Case 6: Successful delete
  it('returns 200 with success: true when contract is deleted', async () => {
    setDeleteResult({ error: null, count: 1 })

    const [req, ctx] = buildDeleteRequest('contract-abc')
    const res = await DELETE(req, ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

})
