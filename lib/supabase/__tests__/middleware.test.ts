import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from '../middleware'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  from: vi.fn(),
  state: {
    userId: null as string | null,
    subscriptions: [] as Array<{ status: string; plan: 'solo' | 'pro' | 'team'; current_period_end: string }>,
  },
}))

class SubscriptionQuery {
  select() {
    return this
  }

  eq() {
    return this
  }

  order() {
    return this
  }

  async limit() {
    return { data: mocks.state.subscriptions, error: null }
  }
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

describe('updateSession middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'false'
    mocks.state.userId = null
    mocks.state.subscriptions = []

    mocks.from.mockImplementation(() => new SubscriptionQuery())
    mocks.createServerClient.mockImplementation(() => ({
      auth: {
        getUser: async () => ({
          data: {
            user: mocks.state.userId ? { id: mocks.state.userId } : null,
          },
        }),
      },
      from: mocks.from,
    }))
  })

  it('redirects unauthenticated users to login for protected routes', async () => {
    const req = new NextRequest('http://localhost/dashboard')
    const res = await updateSession(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/auth/login')
  })

  it('redirects authenticated users without subscription when flag is on', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'true'
    mocks.state.userId = 'user_1'
    mocks.state.subscriptions = []

    const req = new NextRequest('http://localhost/contracts')
    const res = await updateSession(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/onboarding/subscribe')
  })

  it('allows authenticated users with active subscription when flag is on', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'true'
    mocks.state.userId = 'user_1'
    mocks.state.subscriptions = [
      {
        status: 'active',
        plan: 'solo',
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
      },
    ]

    const req = new NextRequest('http://localhost/contracts')
    const res = await updateSession(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('skips subscription gate when feature flag is off', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'false'
    mocks.state.userId = 'user_1'
    mocks.state.subscriptions = []

    const req = new NextRequest('http://localhost/contracts')
    const res = await updateSession(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('uses cached deny decision for rapid navigation', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'true'
    mocks.state.userId = 'user_1'

    const req = new NextRequest('http://localhost/contracts', {
      headers: {
        cookie: 'lexai_subscription_gate=user_1:0',
      },
    })
    const res = await updateSession(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/onboarding/subscribe')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
