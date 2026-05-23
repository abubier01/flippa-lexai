import { describe, it, expect } from 'vitest'
import {
  buildCheckoutSessionCompleted,
  buildSubscriptionUpdated,
  buildSubscriptionDeleted,
  buildInvoicePaymentFailed,
  buildInvoicePaymentSucceeded,
} from '../stripe-fixtures'

describe('stripe-fixtures', () => {
  it('buildCheckoutSessionCompleted defaults are deterministic and typed', () => {
    const evt = buildCheckoutSessionCompleted()
    expect(evt.id).toBe('evt_checkout_default')
    expect(evt.type).toBe('checkout.session.completed')
    expect(evt.data.object.mode).toBe('subscription')
    expect(evt.data.object.client_reference_id).toBe('user-1')
    expect(evt.data.object.subscription).toBe('sub_default')
  })

  it('buildCheckoutSessionCompleted merges overrides', () => {
    const evt = buildCheckoutSessionCompleted({
      id: 'evt_override',
      data: { object: { client_reference_id: 'user-9' } },
    })
    expect(evt.id).toBe('evt_override')
    expect(evt.data.object.client_reference_id).toBe('user-9')
    expect(evt.data.object.mode).toBe('subscription')
  })

  it('buildSubscriptionUpdated default has one item and active status', () => {
    const evt = buildSubscriptionUpdated()
    expect(evt.type).toBe('customer.subscription.updated')
    expect(evt.data.object.status).toBe('active')
    expect(evt.data.object.items.data).toHaveLength(1)
  })

  it('buildSubscriptionDeleted has type subscription.deleted', () => {
    expect(buildSubscriptionDeleted().type).toBe('customer.subscription.deleted')
  })

  it('buildInvoicePaymentFailed carries a subscription id', () => {
    const evt = buildInvoicePaymentFailed()
    expect(evt.data.object.subscription).toBe('sub_default')
  })

  it('buildInvoicePaymentSucceeded has period_end set', () => {
    expect(typeof buildInvoicePaymentSucceeded().data.object.period_end).toBe('number')
  })
})
