import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { priceIdToPlan } from '../price-to-plan'

describe('priceIdToPlan', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_test'
    process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_team_test'
  })
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns "pro" for the configured pro price id', () => {
    expect(priceIdToPlan('price_pro_test')).toBe('pro')
  })

  it('returns "team" for the configured team price id', () => {
    expect(priceIdToPlan('price_team_test')).toBe('team')
  })

  it('returns null for an unknown price id', () => {
    expect(priceIdToPlan('price_unknown')).toBeNull()
  })

  it('throws when env vars are missing', () => {
    delete process.env.STRIPE_PRICE_PRO_MONTHLY
    expect(() => priceIdToPlan('price_pro_test')).toThrow(/STRIPE_PRICE_PRO_MONTHLY/)
  })
})
