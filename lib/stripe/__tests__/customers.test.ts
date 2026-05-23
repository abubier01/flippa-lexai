// lib/stripe/__tests__/customers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

let supabaseMock: ReturnType<typeof createSupabaseMock>
const stripeCustomersCreate = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: { create: stripeCustomersCreate },
  }),
}))

import { getOrCreateStripeCustomer } from '../customers'

beforeEach(() => {
  stripeCustomersCreate.mockReset()
})

describe('getOrCreateStripeCustomer', () => {
  it('returns existing customer id without calling Stripe', async () => {
    supabaseMock = createSupabaseMock({
      tables: { profiles: { single: { data: { stripe_customer_id: 'cus_existing' }, error: null } } },
    })
    const id = await getOrCreateStripeCustomer('user-1', 'a@b.com')
    expect(id).toBe('cus_existing')
    expect(stripeCustomersCreate).not.toHaveBeenCalled()
  })

  it('creates new customer and writes id back to profiles when missing', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: {
          single: { data: { stripe_customer_id: null }, error: null },
          update: { data: null, error: null },
        },
      },
    })
    stripeCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' })

    const id = await getOrCreateStripeCustomer('user-1', 'a@b.com')

    expect(id).toBe('cus_new')
    expect(supabaseMock.calls.updates.profiles).toEqual([{ stripe_customer_id: 'cus_new' }])
  })

  it('passes { metadata: { userId } } and email to Stripe', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: {
          single: { data: { stripe_customer_id: null }, error: null },
          update: { data: null, error: null },
        },
      },
    })
    stripeCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' })

    await getOrCreateStripeCustomer('user-9', 'x@y.com')

    expect(stripeCustomersCreate).toHaveBeenCalledWith({
      email: 'x@y.com',
      metadata: { userId: 'user-9' },
    })
  })

  it('omits email when null/undefined', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: {
          single: { data: { stripe_customer_id: null }, error: null },
          update: { data: null, error: null },
        },
      },
    })
    stripeCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' })

    await getOrCreateStripeCustomer('user-9', null)

    expect(stripeCustomersCreate).toHaveBeenCalledWith({
      email: undefined,
      metadata: { userId: 'user-9' },
    })
  })

  it('throws when profile fetch errors', async () => {
    supabaseMock = createSupabaseMock({
      tables: { profiles: { single: { data: null, error: { message: 'profile fetch boom' } } } },
    })
    await expect(getOrCreateStripeCustomer('user-1', 'a@b.com')).rejects.toThrow(/profile fetch boom/i)
    expect(stripeCustomersCreate).not.toHaveBeenCalled()
  })

  it('throws (with orphan-customer hint) when DB update fails after Stripe create succeeds', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: {
          single: { data: { stripe_customer_id: null }, error: null },
          update: { data: null, error: { message: 'update failed' } },
        },
      },
    })
    stripeCustomersCreate.mockResolvedValueOnce({ id: 'cus_orphan' })

    await expect(getOrCreateStripeCustomer('user-1', 'a@b.com')).rejects.toThrow(
      /cus_orphan created but profile update failed/i,
    )
  })
})
