// app/api/stripe/webhook/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  buildCheckoutSessionCompleted,
  buildSubscriptionUpdated,
  buildSubscriptionDeleted,
  buildInvoicePaymentFailed,
  buildInvoicePaymentSucceeded,
} from '@/__tests__/helpers/stripe-fixtures'

// ---- module mocks ----
const {
  constructEvent,
  tryClaimEvent,
  markEventProcessed,
  releaseClaim,
  handleCheckoutSessionCompleted,
  handleSubscriptionUpserted,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
} = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  tryClaimEvent: vi.fn(),
  markEventProcessed: vi.fn().mockResolvedValue(undefined),
  releaseClaim: vi.fn().mockResolvedValue(undefined),
  handleCheckoutSessionCompleted: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  handleSubscriptionUpserted: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  handleSubscriptionDeleted: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  handleInvoicePaymentFailed: vi.fn().mockResolvedValue({ userId: 'user-1' }),
  handleInvoicePaymentSucceeded: vi.fn().mockResolvedValue({ userId: 'user-1' }),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({ webhooks: { constructEvent } }),
}))

vi.mock('@/lib/stripe/event-deduper', () => ({ tryClaimEvent, markEventProcessed, releaseClaim }))

vi.mock('@/lib/stripe/handlers/checkout-session-completed', () => ({ handleCheckoutSessionCompleted }))
vi.mock('@/lib/stripe/handlers/subscription-updated', () => ({ handleSubscriptionUpserted }))
vi.mock('@/lib/stripe/handlers/subscription-deleted', () => ({ handleSubscriptionDeleted }))
vi.mock('@/lib/stripe/handlers/invoice-payment-failed', () => ({ handleInvoicePaymentFailed }))
vi.mock('@/lib/stripe/handlers/invoice-payment-succeeded', () => ({ handleInvoicePaymentSucceeded }))

vi.mock('server-only', () => ({}))

import { POST } from '../route'

beforeEach(() => {
  constructEvent.mockReset()
  tryClaimEvent.mockReset()
  markEventProcessed.mockClear()
  releaseClaim.mockClear()
  handleCheckoutSessionCompleted.mockClear()
  handleSubscriptionUpserted.mockClear()
  handleSubscriptionDeleted.mockClear()
  handleInvoicePaymentFailed.mockClear()
  handleInvoicePaymentSucceeded.mockClear()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function buildRequest(body: string, sig: string | null) {
  const headers: Record<string, string> = {}
  if (sig !== null) headers['stripe-signature'] = sig
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body,
    headers,
  })
}

describe('POST /api/stripe/webhook', () => {
  it('400 when stripe-signature header is missing', async () => {
    const res = await POST(buildRequest('{}', null))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Missing signature' })
    expect(constructEvent).not.toHaveBeenCalled()
  })

  it('500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(buildRequest('{}', 't=1,v1=abc'))
    expect(res.status).toBe(500)
    errSpy.mockRestore()
  })

  it('400 when signature verification throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    constructEvent.mockImplementation(() => { throw new Error('bad signature') })
    const res = await POST(buildRequest('{}', 't=1,v1=bad'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid signature' })
    warn.mockRestore()
  })

  it('200 deduped (and skips handler) when tryClaimEvent returns false', async () => {
    constructEvent.mockReturnValue(buildCheckoutSessionCompleted())
    tryClaimEvent.mockResolvedValue(false)

    const res = await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, deduped: true })
    expect(handleCheckoutSessionCompleted).not.toHaveBeenCalled()
    expect(markEventProcessed).not.toHaveBeenCalled()
  })

  it('200 + handler invoked + markEventProcessed called on fresh checkout.session.completed', async () => {
    const evt = buildCheckoutSessionCompleted()
    constructEvent.mockReturnValue(evt)
    tryClaimEvent.mockResolvedValue(true)

    const res = await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(handleCheckoutSessionCompleted).toHaveBeenCalledWith(evt)
    expect(markEventProcessed).toHaveBeenCalledWith(evt.id)
    expect(releaseClaim).not.toHaveBeenCalled()
  })

  it('routes subscription.updated, subscription.deleted, invoice.payment_failed, invoice.payment_succeeded to their handlers', async () => {
    tryClaimEvent.mockResolvedValue(true)

    constructEvent.mockReturnValueOnce(buildSubscriptionUpdated())
    await POST(buildRequest('{}', 't=1,v1=ok'))
    expect(handleSubscriptionUpserted).toHaveBeenCalledTimes(1)

    constructEvent.mockReturnValueOnce(buildSubscriptionDeleted())
    await POST(buildRequest('{}', 't=1,v1=ok'))
    expect(handleSubscriptionDeleted).toHaveBeenCalledTimes(1)

    constructEvent.mockReturnValueOnce(buildInvoicePaymentFailed())
    await POST(buildRequest('{}', 't=1,v1=ok'))
    expect(handleInvoicePaymentFailed).toHaveBeenCalledTimes(1)

    constructEvent.mockReturnValueOnce(buildInvoicePaymentSucceeded())
    await POST(buildRequest('{}', 't=1,v1=ok'))
    expect(handleInvoicePaymentSucceeded).toHaveBeenCalledTimes(1)
  })

  it('500 + releaseClaim invoked when handler throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const evt = buildCheckoutSessionCompleted()
    constructEvent.mockReturnValue(evt)
    tryClaimEvent.mockResolvedValue(true)
    handleCheckoutSessionCompleted.mockRejectedValueOnce(new Error('handler boom'))

    const res = await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(res.status).toBe(500)
    expect(releaseClaim).toHaveBeenCalledWith(evt.id)
    expect(markEventProcessed).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('unknown event type is acknowledged with 200 (no handler invoked)', async () => {
    const evt = { ...buildCheckoutSessionCompleted(), type: 'customer.discount.created', data: { object: {} } } as any
    constructEvent.mockReturnValue(evt)
    tryClaimEvent.mockResolvedValue(true)

    const res = await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(res.status).toBe(200)
    expect(handleCheckoutSessionCompleted).not.toHaveBeenCalled()
    expect(markEventProcessed).toHaveBeenCalledWith(evt.id)
  })

  it('500 when tryClaimEvent itself throws (DB down)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    constructEvent.mockReturnValue(buildCheckoutSessionCompleted())
    tryClaimEvent.mockRejectedValueOnce(new Error('db down'))

    const res = await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(res.status).toBe(500)
    expect(handleCheckoutSessionCompleted).not.toHaveBeenCalled()
    expect(releaseClaim).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('extractUserId returns null for non-checkout events; user_id passed to claim is null', async () => {
    const evt = buildSubscriptionUpdated()
    constructEvent.mockReturnValue(evt)
    tryClaimEvent.mockResolvedValue(true)

    await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(tryClaimEvent).toHaveBeenCalledWith(evt.id, evt.type, null, expect.any(Object))
  })

  it('extractUserId reads client_reference_id from checkout.session.completed events', async () => {
    const evt = buildCheckoutSessionCompleted({ data: { object: { client_reference_id: 'user-42' } } })
    constructEvent.mockReturnValue(evt)
    tryClaimEvent.mockResolvedValue(true)

    await POST(buildRequest('{}', 't=1,v1=ok'))

    expect(tryClaimEvent).toHaveBeenCalledWith(evt.id, evt.type, 'user-42', expect.any(Object))
  })

  it('passes raw request body (text) to constructEvent — not parsed JSON', async () => {
    const raw = '{"id":"evt_raw","type":"checkout.session.completed"}'
    constructEvent.mockReturnValue(buildCheckoutSessionCompleted())
    tryClaimEvent.mockResolvedValue(true)

    await POST(buildRequest(raw, 't=1,v1=ok'))

    expect(constructEvent).toHaveBeenCalledWith(raw, 't=1,v1=ok', 'whsec_test')
  })
})
