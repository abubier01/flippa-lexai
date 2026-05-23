// lib/__tests__/plan-limits.test.ts
import { describe, it, expect } from 'vitest'
import { getPlanLimits, isUnlimited, formatLimit, PLAN_LIMITS } from '@/lib/plan-limits'

describe('getPlanLimits', () => {
  it.each([
    ['free', 'Free'],
    ['pro', 'Pro'],
    ['team', 'Team'],
  ])('returns the right limits for "%s"', (plan, expectedName) => {
    expect(getPlanLimits(plan).name).toBe(expectedName)
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['unknown'],
    ['PRO'],  // uppercase — current code lowercases input
  ])('falls back / normalizes for input %p', (input) => {
    const got = getPlanLimits(input)
    if (input === 'PRO') {
      expect(got.name).toBe('Pro')
    } else {
      expect(got.name).toBe('Free')
    }
  })
})

describe('isUnlimited', () => {
  it.each([
    [-1, true],
    [0, false],
    [1, false],
    [5, false],
    [-2, false],
  ])('isUnlimited(%d) → %s', (input, expected) => {
    expect(isUnlimited(input)).toBe(expected)
  })
})

describe('formatLimit', () => {
  it('formats unlimited (-1) as "Unlimited"', () => {
    expect(formatLimit(-1)).toBe('Unlimited')
  })

  it.each([
    [0, '0'],
    [1, '1'],
    [5, '5'],
    [10, '10'],
    [999, '999'],
  ])('formats %d as "%s"', (n, expected) => {
    expect(formatLimit(n)).toBe(expected)
  })
})

describe('PLAN_LIMITS', () => {
  it('free has contractsPerMonth=5, messagesPerContract=20', () => {
    expect(PLAN_LIMITS.free.contractsPerMonth).toBe(5)
    expect(PLAN_LIMITS.free.messagesPerContract).toBe(20)
  })

  it('pro has all features true except sharedLibrary and sso', () => {
    expect(PLAN_LIMITS.pro.features.advancedRiskBreakdown).toBe(true)
    expect(PLAN_LIMITS.pro.features.clauseExtraction).toBe(true)
    expect(PLAN_LIMITS.pro.features.exportPdf).toBe(true)
    expect(PLAN_LIMITS.pro.features.sharedLibrary).toBe(false)
    expect(PLAN_LIMITS.pro.features.sso).toBe(false)
  })

  it('team has sharedLibrary + sso true and 10 teamMembers', () => {
    expect(PLAN_LIMITS.team.features.sharedLibrary).toBe(true)
    expect(PLAN_LIMITS.team.features.sso).toBe(true)
    expect(PLAN_LIMITS.team.features.teamMembers).toBe(10)
  })
})
