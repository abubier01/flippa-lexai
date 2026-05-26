// lib/stripe/handlers/__tests__/checkout-session-completed.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { buildCheckoutSessionCompleted } from '@/__tests__/helpers/stripe-fixtures'

// Price IDs resolved via stubbed env — must match vi.stubEnv calls in beforeEach.
const TEST_PRO_PRICE_ID = 'price_test_pro_monthly'

let supabaseMock: ReturnType<typeof createSupabaseMock>
const subscriptionsRetrieve = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    subscriptions: { retrieve: subscriptionsRetrieve },
  }),
}))

import { handleCheckoutSessionCompleted } from '../checkout-session-completed'

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', TEST_PRO_PRICE_ID)
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY', 'price_test_team_monthly')

  subscriptionsRetrieve.mockReset()
  supabaseMock = createSupabaseMock({
    tables: {
      subscriptions: { upsert: { data: null, error: null } },
      profiles: { update: { data: null, error: null } },
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function buildRetrievedSub() {
  return {
    id: 'sub_abc',
    customer: 'cus_abc',
    status: 'active',
    current_period_end: 1_800_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: TEST_PRO_PRICE_ID } }] },
  }
}

describe('handleCheckoutSessionCompleted', () => {
  it('upserts subscription + updates profile.plan with derived plan tier', async () => {
    subscriptionsRetrieve.mockResolvedValue(buildRetrievedSub())
    const evt = buildCheckoutSessionCompleted({
      data: { object: { subscription: 'sub_abc' } },
    })

    const res = await handleCheckoutSessionCompleted(evt)

    expect(res).toEqual({ userId: 'user-1' })

    const upserted = supabaseMock.calls.upserts.subscriptions?.[0] as Record<string, unknown>
    expect(upserted).toMatchObject({
      id: 'sub_abc',
      user_id: 'user-1',
      stripe_customer_id: 'cus_abc',
      status: 'active',
      plan: 'pro',
      price_id: TEST_PRO_PRICE_ID,
      cancel_at_period_end: false,
    })

    const profileUpdate = supabaseMock.calls.updates.profiles?.[0] as Record<string, unknown>
    expect(profileUpdate).toMatchObject({ plan: 'pro', stripe_customer_id: 'cus_abc' })
  })

  it('throws when client_reference_id and metadata.userId are both missing', async () => {
    // Stripe's TS types restrict client_reference_id to string|undefined, but
    // the runtime API delivers null when unset. Cast through unknown to model
    // the real-world payload.
    const evt = buildCheckoutSessionCompleted({
      data: { object: { client_reference_id: null, metadata: { userId: null } } },
    } as unknown as Parameters<typeof buildCheckoutSessionCompleted>[0])
    await expect(handleCheckoutSessionCompleted(evt)).rejects.toThrow(/no userId/i)
  })

  it('returns { userId } and skips Stripe retrieval when mode !== "subscription"', async () => {
    const evt = buildCheckoutSessionCompleted({
      data: { object: { mode: 'payment', subscription: null } },
    })
    const res = await handleCheckoutSessionCompleted(evt)
    expect(res).toEqual({ userId: 'user-1' })
    expect(subscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('throws when retrieved subscription has no items', async () => {
    subscriptionsRetrieve.mockResolvedValue({
      id: 'sub_x',
      customer: 'cus_x',
      status: 'active',
      items: { data: [] },
    })
    const evt = buildCheckoutSessionCompleted()
    await expect(handleCheckoutSessionCompleted(evt)).rejects.toThrow(/no items/i)
  })

  it('throws when price is not recognized by priceIdToPlan', async () => {
    subscriptionsRetrieve.mockResolvedValue({
      id: 'sub_x',
      customer: 'cus_x',
      status: 'active',
      current_period_end: 1_800_000_000,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_unknown_xyz' } }] },
    })
    const evt = buildCheckoutSessionCompleted()
    await expect(handleCheckoutSessionCompleted(evt)).rejects.toThrow(/unrecognized price/i)
  })

  it('propagates subscriptions.upsert error', async () => {
    subscriptionsRetrieve.mockResolvedValue(buildRetrievedSub())
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: { upsert: { data: null, error: { message: 'upsert boom' } } },
        profiles: { update: { data: null, error: null } },
      },
    })
    const evt = buildCheckoutSessionCompleted()
    await expect(handleCheckoutSessionCompleted(evt)).rejects.toThrow(/upsert boom/i)
  })
})
