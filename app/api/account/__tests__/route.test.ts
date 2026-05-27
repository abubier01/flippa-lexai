/**
 * Unit tests for DELETE /api/account
 *
 * Covers all paths from the spec:
 *   1. 401 — no authenticated user (or no email)
 *   2. 429 — rate limit exceeded
 *   3. 409 — active paid subscription (requiresPortal: true)
 *   4. 400 — confirmation phrase missing or wrong
 *   5. 400 — OAuth / non-email provider (OTP deferred)
 *   6. 400 — password missing
 *   7. 401 — /token re-auth call returns non-ok
 *   8. 500 — admin.deleteUser fails
 *   9. 200 — happy path (success: true)
 *
 * Audit finding #2 closed: GDPR Article 17 right-to-erasure self-service endpoint.
 * OAuth OTP re-auth is deferred to a follow-up PR.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Hoisted mutable mock references
// ---------------------------------------------------------------------------

const { mockSupabase, mockAdminDeleteUser, mockStripeCustomersDel } = vi.hoisted(() => {
  const mockAdminDeleteUser = vi.fn().mockResolvedValue({ error: null })
  const mockStripeCustomersDel = vi.fn().mockResolvedValue({ id: 'cus_abc', deleted: true })

  const mockServiceClient = {
    auth: {
      admin: {
        deleteUser: mockAdminDeleteUser,
      },
    },
  }

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            app_metadata: { provider: 'email' },
          },
        },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { plan: 'solo', stripe_customer_id: 'cus_abc' },
        error: null,
      }),
    }),
    _serviceClient: mockServiceClient,
  }

  return { mockSupabase, mockAdminDeleteUser, mockStripeCustomersDel }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockReturnValue({
    auth: {
      admin: {
        deleteUser: mockAdminDeleteUser,
      },
    },
  }),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: { del: mockStripeCustomersDel },
  }),
}))

// Rate-limit mock — default: allowed
vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: Date.now() + 60 * 60 * 1000,
    retryAfterSeconds: 0,
  }),
  rateLimitHeaders: vi.fn().mockReturnValue({
    'X-RateLimit-Limit': '5',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.floor((Date.now() + 3600 * 1000) / 1000)),
    'Retry-After': '3600',
  }),
}))

// Global fetch mock — default: re-auth succeeds
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ access_token: 'tok', refresh_token: 'ref' }),
})
vi.stubGlobal('fetch', mockFetch)

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

function buildDeleteRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'correct-password', confirmation: 'DELETE', ...body }),
  })
}

// ---------------------------------------------------------------------------
// Helper: build a fresh supabase mock with custom overrides
// ---------------------------------------------------------------------------

function makeSupabase(overrides: {
  user?: null | { id: string; email?: string; app_metadata?: Record<string, string> }
  plan?: string
  stripeCustomerId?: string | null
  profileError?: { code?: string; message?: string } | null
}) {
  const user =
    overrides.user === null
      ? null
      : overrides.user ?? {
          id: 'user-1',
          email: 'test@example.com',
          app_metadata: { provider: 'email' },
        }

  const plan = overrides.plan ?? 'solo'
  const stripeCustomerId = overrides.stripeCustomerId === undefined ? 'cus_abc' : overrides.stripeCustomerId
  const profileError = overrides.profileError ?? null
  const singleResult = profileError
    ? { data: null, error: profileError }
    : { data: { plan, stripe_customer_id: stripeCustomerId }, error: null }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(singleResult),
    }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/account', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch to default success
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok' }),
    })
    // Reset rate limit to allowed
    consumeRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 60 * 60 * 1000,
      retryAfterSeconds: 0,
    })
    // Reset admin delete to success
    mockAdminDeleteUser.mockResolvedValue({ error: null })
    // Reset Stripe customer delete to success
    mockStripeCustomersDel.mockResolvedValue({ id: 'cus_abc', deleted: true })
    // Reset supabase createClient to default (solo plan, email provider, stripe_customer_id set)
    createClientMock.mockResolvedValue(makeSupabase({}))
  })

  // Case 1: Unauthenticated
  it('returns 401 when no user is authenticated', async () => {
    createClientMock.mockResolvedValueOnce(makeSupabase({ user: null }))

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when user has no email', async () => {
    createClientMock.mockResolvedValueOnce(
      makeSupabase({ user: { id: 'user-1', email: undefined, app_metadata: { provider: 'email' } } }),
    )

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  // Case 2: Rate limit exceeded
  it('returns 429 when rate limit is exceeded', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 60 * 60 * 1000,
      retryAfterSeconds: 3600,
    })

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error).toMatch(/too many delete requests/i)
  })

  // Case 3: Active paid subscription
  it('returns 409 with requiresPortal: true when plan is not solo', async () => {
    createClientMock.mockResolvedValueOnce(makeSupabase({ plan: 'pro' }))

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.requiresPortal).toBe(true)
    expect(body.plan).toBe('pro')
    expect(body.error).toMatch(/cancel your subscription/i)
  })

  it('also blocks team plan users with 409', async () => {
    createClientMock.mockResolvedValueOnce(makeSupabase({ plan: 'team' }))

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.requiresPortal).toBe(true)
  })

  // Case 4: Bad confirmation phrase
  it('returns 400 when confirmation is not "DELETE"', async () => {
    const res = await DELETE(buildDeleteRequest({ confirmation: 'delete' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/confirmation phrase/i)
  })

  it('returns 400 when confirmation is missing', async () => {
    const res = await DELETE(buildDeleteRequest({ confirmation: undefined }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/confirmation phrase/i)
  })

  // Case 5: OAuth provider (OTP deferred)
  it('returns 400 with oauthDeferred flag when provider is not "email"', async () => {
    createClientMock.mockResolvedValueOnce(
      makeSupabase({
        user: {
          id: 'user-1',
          email: 'google@example.com',
          app_metadata: { provider: 'google' },
        },
      }),
    )

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.oauthDeferred).toBe(true)
    expect(body.error).toMatch(/oauth/i)
  })

  // Case 6: Password missing
  it('returns 400 when password is missing', async () => {
    const res = await DELETE(buildDeleteRequest({ password: undefined }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/password required/i)
  })

  it('returns 400 when password is empty string', async () => {
    const res = await DELETE(buildDeleteRequest({ password: '' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/password required/i)
  })

  // Case 7: /token re-auth fails
  it('returns 401 when the password re-auth call fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    })

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toMatch(/incorrect password/i)
  })

  // Case 7b: MFA-200 bypass — Supabase returns 200 with error/null access_token
  it('returns 401 when Supabase returns 200 with mfa_required error (MFA bypass prevention)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'mfa_required', access_token: null }),
    })

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Incorrect password.')
  })

  // Case 8: admin.deleteUser fails
  it('returns 500 when admin.deleteUser returns an error', async () => {
    mockAdminDeleteUser.mockResolvedValueOnce({ error: { message: 'db error' } })

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/failed to delete account/i)
  })

  // Case 9: Happy path
  it('returns 200 with success: true on the happy path', async () => {
    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('calls admin.deleteUser with the authenticated user id', async () => {
    await DELETE(buildDeleteRequest())
    expect(mockAdminDeleteUser).toHaveBeenCalledWith('user-1')
  })

  it('calls fetch with the /token re-auth URL (not signInWithPassword)', async () => {
    await DELETE(buildDeleteRequest())
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/token?grant_type=password'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: expect.any(String) }),
        body: expect.stringContaining('"email"'),
      }),
    )
  })

  // P1-1: profile-read race — if PostgREST returns an error (other than PGRST116
  // "no row"), the paid-account guard must fail closed, not silently bypass.
  it('returns 503 when profile read fails with a non-PGRST116 error', async () => {
    createClientMock.mockResolvedValueOnce(
      makeSupabase({ profileError: { code: 'PGRST301', message: 'connection refused' } }),
    )

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toMatch(/temporarily unavailable|try again/i)
    expect(mockAdminDeleteUser).not.toHaveBeenCalled()
    expect(mockStripeCustomersDel).not.toHaveBeenCalled()
  })

  it('still proceeds when profile read returns PGRST116 (no row — treated as no paid plan)', async () => {
    createClientMock.mockResolvedValueOnce(
      makeSupabase({ profileError: { code: 'PGRST116', message: 'no rows' } }),
    )

    const res = await DELETE(buildDeleteRequest())
    expect(res.status).toBe(200)
  })

  // P1-3: when rate-limit is degraded + fail-closed, the route must return 503,
  // not 429, so the client knows it's a backend availability problem (transient)
  // rather than a real quota hit (steady-state).
  it('returns 503 when rate-limit fails closed (degraded:true)', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      degraded: true,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 900,
    })

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toMatch(/temporarily unavailable|try again/i)
  })

  // P1-2: account deletion must also delete the Stripe customer object so the
  // billing record (email + PII) doesn't persist forever. GDPR right-to-erasure.
  it('calls stripe.customers.del with profile.stripe_customer_id before admin.deleteUser', async () => {
    await DELETE(buildDeleteRequest())

    expect(mockStripeCustomersDel).toHaveBeenCalledWith('cus_abc')
    // Ordering: Stripe del should run before admin.deleteUser so a failure
    // doesn't leave a deleted auth user with an orphaned Stripe customer.
    expect(mockStripeCustomersDel.mock.invocationCallOrder[0]).toBeLessThan(
      mockAdminDeleteUser.mock.invocationCallOrder[0],
    )
  })

  it('skips stripe.customers.del when profile has no stripe_customer_id', async () => {
    createClientMock.mockResolvedValueOnce(makeSupabase({ stripeCustomerId: null }))

    const res = await DELETE(buildDeleteRequest())

    expect(res.status).toBe(200)
    expect(mockStripeCustomersDel).not.toHaveBeenCalled()
    expect(mockAdminDeleteUser).toHaveBeenCalled()
  })

  it('swallows Stripe resource_missing and proceeds with auth deletion', async () => {
    const resourceMissing = Object.assign(new Error('No such customer: cus_abc'), {
      code: 'resource_missing',
      type: 'StripeInvalidRequestError',
    })
    mockStripeCustomersDel.mockRejectedValueOnce(resourceMissing)

    const res = await DELETE(buildDeleteRequest())

    expect(res.status).toBe(200)
    expect(mockAdminDeleteUser).toHaveBeenCalledWith('user-1')
  })

  it('returns 500 if Stripe del fails with a non-recoverable error', async () => {
    mockStripeCustomersDel.mockRejectedValueOnce(new Error('Stripe API unavailable'))

    const res = await DELETE(buildDeleteRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/billing|stripe|account/i)
    // Auth user must NOT be deleted if Stripe del fails — would orphan billing.
    expect(mockAdminDeleteUser).not.toHaveBeenCalled()
  })
})
