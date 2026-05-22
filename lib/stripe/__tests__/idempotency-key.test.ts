import { describe, it, expect } from 'vitest'
import { buildSessionIdempotencyKey } from '../idempotency-key'

describe('buildSessionIdempotencyKey', () => {
  it('is deterministic for the same (userId, priceId, day)', () => {
    const day = new Date('2026-05-19T12:00:00Z')
    const a = buildSessionIdempotencyKey('user_1', 'price_pro', day)
    const b = buildSessionIdempotencyKey('user_1', 'price_pro', day)
    expect(a).toBe(b)
  })

  it('differs across users', () => {
    const day = new Date('2026-05-19T12:00:00Z')
    expect(buildSessionIdempotencyKey('user_1', 'price_pro', day))
      .not.toBe(buildSessionIdempotencyKey('user_2', 'price_pro', day))
  })

  it('differs across days (UTC)', () => {
    const day1 = new Date('2026-05-19T23:59:59Z')
    const day2 = new Date('2026-05-20T00:00:01Z')
    expect(buildSessionIdempotencyKey('user_1', 'price_pro', day1))
      .not.toBe(buildSessionIdempotencyKey('user_1', 'price_pro', day2))
  })

  it('is shorter than 255 chars (Stripe limit)', () => {
    const day = new Date('2026-05-19T12:00:00Z')
    expect(buildSessionIdempotencyKey('user_1', 'price_pro', day).length).toBeLessThan(255)
  })
})
