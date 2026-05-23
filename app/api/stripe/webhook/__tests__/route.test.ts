import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  tryClaimEvent: vi.fn(),
  markEventProcessed: vi.fn(),
  markEventFailed: vi.fn(),
  handleCheckoutSessionCompleted: vi.fn(),
  handleSubscriptionUpserted: vi.fn(),
  handleSubscriptionDeleted: vi.fn(),
  handleInvoicePaymentFailed: vi.fn(),
  handleInvoicePaymentSucceeded: vi.fn(),
  handleChargeRefunded: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mocks.constructEvent,
    },
  }),
}))

vi.mock('@/lib/stripe/event-deduper', () => ({
  tryClaimEvent: mocks.tryClaimEvent,
  markEventProcessed: mocks.markEventProcessed,
  markEventFailed: mocks.markEventFailed,
}))

vi.mock('@/lib/stripe/handlers/checkout-session-completed', () => ({
  handleCheckoutSessionCompleted: mocks.handleCheckoutSessionCompleted,
}))

vi.mock('@/lib/stripe/handlers/subscription-updated', () => ({
  handleSubscriptionUpserted: mocks.handleSubscriptionUpserted,
}))

vi.mock('@/lib/stripe/handlers/subscription-deleted', () => ({
  handleSubscriptionDeleted: mocks.handleSubscriptionDeleted,
}))

vi.mock('@/lib/stripe/handlers/invoice-payment-failed', () => ({
  handleInvoicePaymentFailed: mocks.handleInvoicePaymentFailed,
}))

vi.mock('@/lib/stripe/handlers/invoice-payment-succeeded', () => ({
  handleInvoicePaymentSucceeded: mocks.handleInvoicePaymentSucceeded,
}))

vi.mock('@/lib/stripe/handlers/charge-refunded', () => ({
  handleChargeRefunded: mocks.handleChargeRefunded,
}))

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    vi.clearAllMocks()
    mocks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'invoice.payment_succeeded',
      data: { object: {} },
    })
    mocks.tryClaimEvent.mockResolvedValue({ state: 'claimed' })
  })

  function buildRequest(signature = 'sig_test') {
    return new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: signature ? { 'stripe-signature': signature } : {},
      body: '{"id":"evt_1"}',
    })
  }

  it('returns 400 when stripe signature is missing', async () => {
    const res = await POST(buildRequest('') as never)
    expect(res.status).toBe(400)
  })

  it('returns dedup success only for already_processed claims', async () => {
    mocks.tryClaimEvent.mockResolvedValue({ state: 'already_processed' })
    const res = await POST(buildRequest() as never)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ received: true, deduped: true })
    expect(mocks.markEventProcessed).not.toHaveBeenCalled()
  })

  it('returns retryable error while another worker owns an active lease', async () => {
    mocks.tryClaimEvent.mockResolvedValue({ state: 'in_flight' })
    const res = await POST(buildRequest() as never)
    expect(res.status).toBe(500)
    expect(mocks.markEventProcessed).not.toHaveBeenCalled()
  })

  it('processes and marks reclaimed events', async () => {
    mocks.tryClaimEvent.mockResolvedValue({ state: 'reclaimed' })
    const res = await POST(buildRequest() as never)
    expect(res.status).toBe(200)
    expect(mocks.handleInvoicePaymentSucceeded).toHaveBeenCalledTimes(1)
    expect(mocks.markEventProcessed).toHaveBeenCalledWith('evt_1')
  })

  it('marks failed events and returns 500 when handler throws', async () => {
    mocks.handleInvoicePaymentSucceeded.mockRejectedValue(new Error('boom'))
    const res = await POST(buildRequest() as never)
    expect(res.status).toBe(500)
    expect(mocks.markEventFailed).toHaveBeenCalledWith('evt_1', 'boom')
    expect(mocks.markEventProcessed).not.toHaveBeenCalled()
  })

  it('routes charge.refunded through the refund review handler', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_ref_1',
      type: 'charge.refunded',
      data: { object: { id: 'ch_123', amount_refunded: 500 } },
    })
    const res = await POST(buildRequest() as never)
    expect(res.status).toBe(200)
    expect(mocks.handleChargeRefunded).toHaveBeenCalledTimes(1)
    expect(mocks.markEventProcessed).toHaveBeenCalledWith('evt_ref_1')
  })

  it('routes charge.dispute.created through the refund review handler', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_dispute_1',
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_123', charge: 'ch_123', amount: 500 } },
    })
    const res = await POST(buildRequest() as never)
    expect(res.status).toBe(200)
    expect(mocks.handleChargeRefunded).toHaveBeenCalledTimes(1)
    expect(mocks.markEventProcessed).toHaveBeenCalledWith('evt_dispute_1')
  })
})
