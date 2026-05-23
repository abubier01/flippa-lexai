import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  subscriptionsResult: {
    data: [] as Array<{ status: string; plan: 'solo' | 'pro' | 'team'; current_period_end: string }>,
    error: null as null | { message: string },
  },
  user: { id: 'user_1' } as null | { id: string },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

function mockSupabaseClient() {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: mocks.user } }),
    },
    from: (table: string) => {
      if (table !== 'subscriptions') throw new Error(`Unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: mocks.subscriptionsResult.data,
                error: mocks.subscriptionsResult.error,
              }),
            }),
          }),
        }),
      }
    },
  })
}

describe('GET /api/billing/status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-23T12:00:00Z'))
    vi.clearAllMocks()
    mocks.user = { id: 'user_1' }
    mocks.subscriptionsResult = { data: [], error: null }
    mockSupabaseClient()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 401 for unauthenticated users', async () => {
    mocks.user = null
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns active when no subscription row exists', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'active' })
  })

  it('returns past_due when period end has not passed yet', async () => {
    mocks.subscriptionsResult.data = [{
      status: 'past_due',
      plan: 'pro',
      current_period_end: '2026-05-24T00:00:00Z',
    }]
    const res = await GET()
    await expect(res.json()).resolves.toEqual({ status: 'past_due' })
  })

  it('returns grace_period with daysRemaining when in grace window', async () => {
    mocks.subscriptionsResult.data = [{
      status: 'past_due',
      plan: 'pro',
      current_period_end: '2026-05-22T12:00:00Z',
    }]
    const res = await GET()
    await expect(res.json()).resolves.toEqual({ status: 'grace_period', daysRemaining: 2 })
  })

  it('returns canceled when past_due grace has expired', async () => {
    mocks.subscriptionsResult.data = [{
      status: 'past_due',
      plan: 'pro',
      current_period_end: '2026-05-19T11:59:59Z',
    }]
    const res = await GET()
    await expect(res.json()).resolves.toEqual({ status: 'canceled' })
  })

  it('returns canceled for canceled subscriptions', async () => {
    mocks.subscriptionsResult.data = [{
      status: 'canceled',
      plan: 'pro',
      current_period_end: '2026-05-19T00:00:00Z',
    }]
    const res = await GET()
    await expect(res.json()).resolves.toEqual({ status: 'canceled' })
  })

  it('returns 500 when subscriptions query fails', async () => {
    mocks.subscriptionsResult.error = { message: 'boom' }
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
