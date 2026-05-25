import { describe, it, expect } from 'vitest'
import { POLICIES, type RateLimitAction } from '../rate-limit-policies'

describe('POLICIES', () => {
  it('defines limit and windowMs for every (action, tier) combination', () => {
    const actions: RateLimitAction[] = ['chat', 'analyze', 'upload', 'contract-delete', 'account-delete']
    const tiers = ['free', 'pro', 'team'] as const

    for (const action of actions) {
      for (const tier of tiers) {
        const policy = POLICIES[action][tier]
        expect(policy.limit).toBeGreaterThan(0)
        expect(policy.windowMs).toBeGreaterThan(0)
      }
    }
  })

  it('orders limits free < pro < team for cost-control actions', () => {
    for (const action of ['chat', 'analyze', 'upload'] as const) {
      expect(POLICIES[action].free.limit).toBeLessThan(POLICIES[action].pro.limit)
      expect(POLICIES[action].pro.limit).toBeLessThan(POLICIES[action].team.limit)
    }
  })

  it('uses flat limits across tiers for anti-abuse actions', () => {
    for (const action of ['contract-delete', 'account-delete'] as const) {
      const { free, pro, team } = POLICIES[action]
      expect(pro.limit).toBe(free.limit)
      expect(team.limit).toBe(free.limit)
    }
  })

  it('uses the same window across tiers for a given action', () => {
    for (const action of ['chat', 'analyze', 'upload', 'contract-delete', 'account-delete'] as const) {
      const { free, pro, team } = POLICIES[action]
      expect(pro.windowMs).toBe(free.windowMs)
      expect(team.windowMs).toBe(free.windowMs)
    }
  })

  it('matches the documented starter values', () => {
    expect(POLICIES).toMatchSnapshot()
  })
})
