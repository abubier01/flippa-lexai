import { describe, it, expect, vi, afterEach } from 'vitest'
import { decideActivePlan, GRACE_PERIOD_DAYS } from '../access-logic'
const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  subscriptionRow: null as null | { status: string; plan: 'solo' | 'pro' | 'team'; current_period_end: string },
}))
vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createServiceClient,
}))
import * as access from '../access'

describe('decideActivePlan', () => {
  const now = new Date('2026-05-19T12:00:00Z')

  it('returns solo when no subscription exists', () => {
    expect(decideActivePlan(null, now)).toEqual({ tier: 'solo', status: 'none' })
  })

  it('returns the plan when subscription is active', () => {
    expect(decideActivePlan({
      status: 'active', plan: 'pro',
      current_period_end: '2026-06-19T00:00:00Z',
    }, now)).toEqual({ tier: 'pro', status: 'active' })
  })

  it('returns solo when an active solo subscription exists', () => {
    expect(decideActivePlan({
      status: 'active', plan: 'solo',
      current_period_end: '2026-06-19T00:00:00Z',
    }, now)).toEqual({ tier: 'solo', status: 'active' })
  })

  it('returns the plan when trialing', () => {
    expect(decideActivePlan({
      status: 'trialing', plan: 'team',
      current_period_end: '2026-06-19T00:00:00Z',
    }, now)).toEqual({ tier: 'team', status: 'trialing' })
  })

  it('keeps the plan during the grace period for past_due', () => {
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: recent,
    }, now)).toEqual({ tier: 'pro', status: 'past_due' })
  })

  it('downgrades to solo when past_due exceeds the grace period', () => {
    const old = new Date(now.getTime() - (GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: old,
    }, now)).toEqual({ tier: 'solo', status: 'past_due_expired' })
  })

  it('keeps the plan exactly on grace-period day N boundary', () => {
    const boundary = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: boundary,
    }, now)).toEqual({ tier: 'pro', status: 'past_due' })
  })

  it('downgrades immediately after grace-period day N boundary', () => {
    const justOutside = new Date(now.getTime() - ((GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) + 1000)).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: justOutside,
    }, now)).toEqual({ tier: 'solo', status: 'past_due_expired' })
  })

  it('returns solo for canceled subscriptions', () => {
    expect(decideActivePlan({
      status: 'canceled', plan: 'pro', current_period_end: '2026-04-01T00:00:00Z',
    }, now)).toEqual({ tier: 'solo', status: 'canceled' })
  })

  it('returns solo for incomplete_expired', () => {
    expect(decideActivePlan({
      status: 'incomplete_expired', plan: 'pro', current_period_end: '2026-04-01T00:00:00Z',
    }, now)).toEqual({ tier: 'solo', status: 'incomplete_expired' })
  })
})

describe('assertHasFeature', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    supabaseMocks.subscriptionRow = null
  })

  function mockSubscriptionQuery() {
    supabaseMocks.createServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: supabaseMocks.subscriptionRow ? [supabaseMocks.subscriptionRow] : [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
  }

  it('throws PlanGateError when feature is denied on solo (exportPdf)', async () => {
    mockSubscriptionQuery()
    supabaseMocks.subscriptionRow = {
      status: 'active',
      plan: 'solo',
      current_period_end: '2026-06-01T00:00:00Z',
    }
    await expect(access.assertHasFeature('user_1', 'exportPdf')).rejects.toBeInstanceOf(access.PlanGateError)
  })

  it('returns active plan when feature is granted on pro (exportPdf)', async () => {
    mockSubscriptionQuery()
    supabaseMocks.subscriptionRow = {
      status: 'active',
      plan: 'pro',
      current_period_end: '2026-06-01T00:00:00Z',
    }
    await expect(access.assertHasFeature('user_1', 'exportPdf')).resolves.toEqual({ tier: 'pro', status: 'active' })
  })

  it('denies sharedLibrary on solo and pro', async () => {
    mockSubscriptionQuery()
    supabaseMocks.subscriptionRow = {
      status: 'active',
      plan: 'solo',
      current_period_end: '2026-06-01T00:00:00Z',
    }
    await expect(access.assertHasFeature('user_1', 'sharedLibrary')).rejects.toBeInstanceOf(access.PlanGateError)

    supabaseMocks.subscriptionRow = {
      status: 'active',
      plan: 'pro',
      current_period_end: '2026-06-01T00:00:00Z',
    }
    await expect(access.assertHasFeature('user_1', 'sharedLibrary')).rejects.toBeInstanceOf(access.PlanGateError)
  })

  it('allows sharedLibrary on team', async () => {
    mockSubscriptionQuery()
    supabaseMocks.subscriptionRow = {
      status: 'active',
      plan: 'team',
      current_period_end: '2026-06-01T00:00:00Z',
    }
    await expect(access.assertHasFeature('user_1', 'sharedLibrary')).resolves.toEqual({ tier: 'team', status: 'active' })
  })

  it('retains paid feature access while past_due is still inside grace window', async () => {
    mockSubscriptionQuery()
    supabaseMocks.subscriptionRow = {
      status: 'past_due',
      plan: 'pro',
      current_period_end: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString(),
    }
    await expect(access.assertHasFeature('user_1', 'exportPdf')).resolves.toEqual({ tier: 'pro', status: 'past_due' })
  })

  it('removes paid feature access after past_due grace window expires', async () => {
    mockSubscriptionQuery()
    supabaseMocks.subscriptionRow = {
      status: 'past_due',
      plan: 'pro',
      current_period_end: new Date(Date.now() - ((GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000)).toISOString(),
    }
    await expect(access.assertHasFeature('user_1', 'exportPdf')).rejects.toBeInstanceOf(access.PlanGateError)
  })
})
