// lib/stripe/handlers/__tests__/subscription-updated.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { buildSubscriptionUpdated } from '@/__tests__/helpers/stripe-fixtures'

// Price IDs resolved via stubbed env — must match vi.stubEnv calls in beforeEach.
const TEST_PRO_PRICE_ID = 'price_test_pro_monthly'

let supabaseMock: ReturnType<typeof createSupabaseMock>

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

import { handleSubscriptionUpserted } from '../subscription-updated'

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', TEST_PRO_PRICE_ID)
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY', 'price_test_team_monthly')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function setMocks(status: string) {
  supabaseMock = createSupabaseMock({
    tables: {
      profiles: {
        single: { data: { id: 'user-1' }, error: null },
        update: { data: null, error: null },
      },
      subscriptions: { upsert: { data: null, error: null } },
    },
  })
  return buildSubscriptionUpdated({
    data: {
      object: {
        status: status as 'active',
        items: {
          data: [
            { id: 'si_1', object: 'subscription_item', price: { id: TEST_PRO_PRICE_ID }, quantity: 1 } as never,
          ],
        },
      },
    },
  })
}

describe('handleSubscriptionUpserted', () => {
  it('active sub: upserts and sets profiles.plan to derived tier', async () => {
    const evt = setMocks('active')
    const res = await handleSubscriptionUpserted(evt)

    expect(res.userId).toBe('user-1')
    expect(supabaseMock.calls.upserts.subscriptions?.[0]).toMatchObject({
      id: 'sub_default',
      user_id: 'user-1',
      status: 'active',
      plan: 'pro',
    })
    expect(supabaseMock.calls.updates.profiles?.[0]).toMatchObject({ plan: 'pro' })
  })

  it('past_due sub: profiles.plan stays at paid tier (preserves access)', async () => {
    const evt = setMocks('past_due')
    await handleSubscriptionUpserted(evt)
    expect(supabaseMock.calls.updates.profiles?.[0]).toMatchObject({ plan: 'pro' })
  })

  it('canceled sub: profiles.plan downgrades to "free"', async () => {
    const evt = setMocks('canceled')
    await handleSubscriptionUpserted(evt)
    expect(supabaseMock.calls.updates.profiles?.[0]).toMatchObject({ plan: 'free' })
  })

  it('throws when profile lookup by stripe_customer_id fails', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: { single: { data: null, error: { message: 'profile lookup boom' } } },
        subscriptions: { upsert: { data: null, error: null } },
      },
    })
    const evt = buildSubscriptionUpdated({
      data: {
        object: {
          items: {
            data: [
              { id: 'si_1', object: 'subscription_item', price: { id: TEST_PRO_PRICE_ID }, quantity: 1 } as never,
            ],
          },
        },
      },
    })
    await expect(handleSubscriptionUpserted(evt)).rejects.toThrow(/profile lookup boom/i)
  })

  it('throws when price is unknown', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: {
          single: { data: { id: 'user-1' }, error: null },
          update: { data: null, error: null },
        },
        subscriptions: { upsert: { data: null, error: null } },
      },
    })
    const evt = buildSubscriptionUpdated({
      data: {
        object: {
          items: {
            data: [
              { id: 's', object: 'subscription_item', price: { id: 'price_unknown' }, quantity: 1 } as never,
            ],
          },
        },
      },
    })
    await expect(handleSubscriptionUpserted(evt)).rejects.toThrow(/unrecognized price/i)
  })
})
