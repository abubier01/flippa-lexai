import { describe, it, expect } from 'vitest'
import { decideActivePlan, GRACE_PERIOD_DAYS } from '../access-logic'

describe('decideActivePlan', () => {
  const now = new Date('2026-05-19T12:00:00Z')

  it('returns free when no subscription exists', () => {
    expect(decideActivePlan(null, now)).toEqual({ tier: 'free', status: 'none' })
  })

  it('returns the plan when subscription is active', () => {
    expect(decideActivePlan({
      status: 'active', plan: 'pro',
      current_period_end: '2026-06-19T00:00:00Z',
    }, now)).toEqual({ tier: 'pro', status: 'active' })
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

  it('downgrades to free when past_due exceeds the grace period', () => {
    const old = new Date(now.getTime() - (GRACE_PERIOD_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()
    expect(decideActivePlan({
      status: 'past_due', plan: 'pro', current_period_end: old,
    }, now)).toEqual({ tier: 'free', status: 'past_due_expired' })
  })

  it('returns free for canceled subscriptions', () => {
    expect(decideActivePlan({
      status: 'canceled', plan: 'pro', current_period_end: '2026-04-01T00:00:00Z',
    }, now)).toEqual({ tier: 'free', status: 'canceled' })
  })

  it('returns free for incomplete_expired', () => {
    expect(decideActivePlan({
      status: 'incomplete_expired', plan: 'pro', current_period_end: '2026-04-01T00:00:00Z',
    }, now)).toEqual({ tier: 'free', status: 'incomplete_expired' })
  })
})
