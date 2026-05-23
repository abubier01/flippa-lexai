import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleChargeRefunded } from '../charge-refunded'

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  profileSingle: vi.fn(),
  refundInsert: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createServiceClient,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  log: {
    warn: mocks.logWarn,
  },
}))

describe('handleChargeRefunded', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.profileSingle.mockResolvedValue({ data: { id: 'user_123' }, error: null })
    mocks.refundInsert.mockResolvedValue({ error: null })

    mocks.createServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: mocks.profileSingle,
              }),
            }),
          }
        }
        if (table === 'refund_reviews') {
          return {
            insert: mocks.refundInsert,
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    })
  })

  it('queues charge.refunded for manual review without mutating plan/subscription tables', async () => {
    const event = {
      id: 'evt_ref_123',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_123',
          customer: 'cus_123',
          amount_refunded: 500,
        },
      },
    }

    const result = await handleChargeRefunded(event as never)

    expect(result).toEqual({ userId: 'user_123' })
    expect(mocks.refundInsert).toHaveBeenCalledWith({
      event_id: 'evt_ref_123',
      user_id: 'user_123',
      stripe_charge_id: 'ch_123',
      amount_refunded: 500,
      reason: 'refund',
      review_type: 'refund',
    })
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'stripe-webhook',
      'refund received - manual review required',
      expect.objectContaining({
        eventId: 'evt_ref_123',
        userId: 'user_123',
        chargeId: 'ch_123',
        amount: 500,
      }),
    )
  })

  it('queues charge.dispute.created with null user when no profile is found', async () => {
    mocks.profileSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })

    const event = {
      id: 'evt_dispute_123',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_123',
          charge: 'ch_999',
          customer: 'cus_missing',
          amount: 1900,
          reason: 'fraudulent',
        },
      },
    }

    const result = await handleChargeRefunded(event as never)

    expect(result).toEqual({ userId: null })
    expect(mocks.refundInsert).toHaveBeenCalledWith({
      event_id: 'evt_dispute_123',
      user_id: null,
      stripe_charge_id: 'ch_999',
      amount_refunded: 1900,
      reason: 'fraudulent',
      review_type: 'dispute',
    })
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'stripe-webhook',
      'dispute received - manual review required',
      expect.objectContaining({
        eventId: 'evt_dispute_123',
        userId: null,
        chargeId: 'ch_999',
        amount: 1900,
      }),
    )
  })
})
