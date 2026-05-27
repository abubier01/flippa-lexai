import { describe, it, expect } from 'vitest'
import { POLICIES, type RateLimitAction } from '../rate-limit-policies'

describe('POLICIES', () => {
  it('defines limit and windowMs for every (action, tier) combination', () => {
    const actions: RateLimitAction[] = ['chat', 'analyze', 'upload', 'contract-delete', 'account-delete']
    const tiers = ['solo', 'pro', 'team'] as const

    for (const action of actions) {
      for (const tier of tiers) {
        const policy = POLICIES[action][tier]
        expect(policy.limit).toBeGreaterThan(0)
        expect(policy.windowMs).toBeGreaterThan(0)
      }
    }
  })

  it('orders limits solo < pro < team for cost-control actions', () => {
    for (const action of ['chat', 'analyze', 'upload'] as const) {
      expect(POLICIES[action].solo.limit).toBeLessThan(POLICIES[action].pro.limit)
      expect(POLICIES[action].pro.limit).toBeLessThan(POLICIES[action].team.limit)
    }
  })

  it('uses flat limits across tiers for anti-abuse actions', () => {
    for (const action of ['contract-delete', 'account-delete'] as const) {
      const { solo, pro, team } = POLICIES[action]
      expect(pro.limit).toBe(solo.limit)
      expect(team.limit).toBe(solo.limit)
    }
  })

  it('uses the same window across tiers for a given action', () => {
    for (const action of ['chat', 'analyze', 'upload', 'contract-delete', 'account-delete'] as const) {
      const { solo, pro, team } = POLICIES[action]
      expect(pro.windowMs).toBe(solo.windowMs)
      expect(team.windowMs).toBe(solo.windowMs)
    }
  })

  it('matches the documented starter values', () => {
    expect(POLICIES).toMatchSnapshot()
  })
})
