import { describe, it, expect } from 'vitest'
import { POLICIES, type RateLimitAction } from '../rate-limit-policies'

describe('POLICIES', () => {
  it('defines limit and windowMs for every (action, tier) combination', () => {
    const actions: RateLimitAction[] = ['chat', 'analyze', 'upload']
    const tiers = ['free', 'pro', 'team'] as const

    for (const action of actions) {
      for (const tier of tiers) {
        const policy = POLICIES[action][tier]
        expect(policy.limit).toBeGreaterThan(0)
        expect(policy.windowMs).toBeGreaterThan(0)
      }
    }
  })

  it('orders limits free < pro < team within each action', () => {
    for (const action of ['chat', 'analyze', 'upload'] as const) {
      expect(POLICIES[action].free.limit).toBeLessThan(POLICIES[action].pro.limit)
      expect(POLICIES[action].pro.limit).toBeLessThan(POLICIES[action].team.limit)
    }
  })

  it('uses the same window across tiers for a given action', () => {
    for (const action of ['chat', 'analyze', 'upload'] as const) {
      const { free, pro, team } = POLICIES[action]
      expect(pro.windowMs).toBe(free.windowMs)
      expect(team.windowMs).toBe(free.windowMs)
    }
  })

  it('matches the documented starter values', () => {
    expect(POLICIES).toMatchSnapshot()
  })
})
