// app/api/stripe/__tests__/checkout-to-webhook-e2e.test.ts
//
// E2E test: exercises the full pipeline —
//   startCheckoutSession (server action) → POST /api/stripe/webhook → handlers → DB
//
// All SDK/Supabase boundaries are mocked; real code paths run end-to-end.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import {
  buildCheckoutSessionCompleted,
  buildSubscriptionUpdated,
} from '@/__tests__/helpers/stripe-fixtures'

// ── env-driven price IDs ─────────────────────────────────────────────────────
const TEST_PRO_PRICE_ID = 'price_test_pro_monthly'

// ── server-only shim ─────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}))

// ── Supabase boundaries ──────────────────────────────────────────────────────
// These are declared as `let` so individual scenarios can swap the mock between
// calls (e.g. replay scenario).
let serviceSupabase: ReturnType<typeof createSupabaseMock>
let userSupabase: ReturnType<typeof createSupabaseMock>

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => serviceSupabase.client),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => Promise.resolve(userSupabase.client)),
}))

// ── Stripe SDK boundary ──────────────────────────────────────────────────────
const {
  checkoutSessionsCreate,
  customersCreate,
  subscriptionsRetrieve,
  webhooksConstructEvent,
} = vi.hoisted(() => ({
  checkoutSessionsCreate: vi.fn(),
  customersCreate: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  webhooksConstructEvent: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    checkout: { sessions: { create: checkoutSessionsCreate } },
    customers: { create: customersCreate },
    subscriptions: { retrieve: subscriptionsRetrieve },
    webhooks: { constructEvent: webhooksConstructEvent },
  }),
}))

// ── plan/access mock — prevent server action from blocking ───────────────────
// startCheckoutSession throws if getActivePlan returns active/trialing.
vi.mock('@/lib/plan/access', () => ({
  getActivePlan: vi.fn().mockResolvedValue({ tier: 'free', status: null }),
}))

// ── getOrCreateStripeCustomer — cleaner than wiring the full chain ───────────
vi.mock('@/lib/stripe/customers', () => ({
  getOrCreateStripeCustomer: vi.fn().mockResolvedValue('cus_e2e'),
}))

// ── products mock — server action calls getProductById(productId) ────────────
vi.mock('@/lib/products', () => ({
  getProductById: vi.fn().mockImplementation((id: string) => {
    if (id === 'lexai-pro') return { id: 'lexai-pro', plan: 'pro' }
    return undefined
  }),
}))

// ── Units under test (imported AFTER all vi.mock calls) ──────────────────────
import { startCheckoutSession } from '@/app/actions/stripe'
import { POST as webhookPOST } from '../webhook/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServiceSupabase(opts: {
  billingEventsInsertError?: { code: string; message: string } | null
} = {}) {
  return createSupabaseMock({
    tables: {
      billing_events: {
        insert: {
          data: null,
          error: opts.billingEventsInsertError ?? null,
        },
        update: { data: null, error: null },
        delete: { data: null, error: null },
      },
      profiles: {
        single: { data: { id: 'user-1', stripe_customer_id: null }, error: null },
        update: { data: null, error: null },
      },
      subscriptions: {
        upsert: { data: null, error: null },
      },
    },
  })
}

function makeUserSupabase() {
  return createSupabaseMock({
    auth: { user: { id: 'user-1', email: 'user@example.com' } },
  })
}

function webhookReq() {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 't=1,v1=ok' },
  })
}

function buildRetrievedSub(subId = 'sub_e2e') {
  return {
    id: subId,
    customer: 'cus_e2e',
    status: 'active',
    current_period_end: 1_800_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: TEST_PRO_PRICE_ID } }] },
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', TEST_PRO_PRICE_ID)
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY', 'price_test_team_monthly')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_e2e')

  checkoutSessionsCreate.mockReset()
  customersCreate.mockReset()
  subscriptionsRetrieve.mockReset()
  webhooksConstructEvent.mockReset()

  // Default mock setups
  serviceSupabase = makeServiceSupabase()
  userSupabase = makeUserSupabase()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('E2E: checkout → webhook → plan update', () => {
  it('in-order: server action creates session, webhook upserts subscription + profile', async () => {
    // ── Step a: server action calls stripe.checkout.sessions.create ──────────
    checkoutSessionsCreate.mockResolvedValue({
      id: 'cs_e2e',
      client_secret: 'cs_secret_e2e',
    })

    const created = await startCheckoutSession('lexai-pro')
    expect(created.sessionId).toBe('cs_e2e')
    expect(created.clientSecret).toBe('cs_secret_e2e')

    // ── Step b: build the webhook event referencing that session ─────────────
    const evt = buildCheckoutSessionCompleted({
      id: 'evt_e2e_inorder',
      data: {
        object: {
          id: 'cs_e2e',
          client_reference_id: 'user-1',
          subscription: 'sub_e2e',
        },
      },
    })

    // Handler will call stripe.subscriptions.retrieve(subId)
    subscriptionsRetrieve.mockResolvedValue(buildRetrievedSub())
    webhooksConstructEvent.mockReturnValue(evt)

    // ── Step c: deliver to webhook route ────────────────────────────────────
    const res = await webhookPOST(webhookReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    // ── Step d: assert subscriptions row upserted with correct shape ─────────
    const subUpsert = serviceSupabase.calls.upserts.subscriptions?.[0] as Record<string, unknown>
    expect(subUpsert).toMatchObject({
      id: 'sub_e2e',
      user_id: 'user-1',
      stripe_customer_id: 'cus_e2e',
      status: 'active',
      plan: 'pro',
      price_id: TEST_PRO_PRICE_ID,
    })

    // ── Step d: assert profiles.plan was updated to 'pro' ────────────────────
    const profileUpdate = serviceSupabase.calls.updates.profiles?.[0] as Record<string, unknown>
    expect(profileUpdate).toMatchObject({ plan: 'pro', stripe_customer_id: 'cus_e2e' })
  })

  it('replay: same event delivered twice → second is deduped, no second upsert', async () => {
    const evt = buildCheckoutSessionCompleted({
      id: 'evt_replay',
      data: {
        object: {
          client_reference_id: 'user-1',
          subscription: 'sub_replay',
        },
      },
    })

    subscriptionsRetrieve.mockResolvedValue(buildRetrievedSub('sub_replay'))
    webhooksConstructEvent.mockReturnValue(evt)

    // ── First delivery: billing_events insert succeeds → claim wins ──────────
    serviceSupabase = makeServiceSupabase() // clean mock, no insert error
    const first = await webhookPOST(webhookReq())
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ received: true })

    // First delivery must have produced a subscriptions upsert
    expect(serviceSupabase.calls.upserts.subscriptions?.length).toBe(1)

    // ── Second delivery: swap supabase so billing_events.insert returns 23505 ─
    serviceSupabase = createSupabaseMock({
      tables: {
        billing_events: {
          insert: {
            data: null,
            error: { code: '23505', message: 'unique_violation' },
          },
          maybeSingle: {
            data: { processed_at: '2026-05-23T12:00:00.000Z' },
            error: null,
          },
        },
        profiles: {
          single: { data: { id: 'user-1', stripe_customer_id: null }, error: null },
          update: { data: null, error: null },
        },
        subscriptions: {
          upsert: { data: null, error: null },
        },
      },
    })

    const second = await webhookPOST(webhookReq())
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({
      received: true,
      deduped: true,
      reason: 'already-processed',
    })

    // No upsert on the freshly-swapped mock
    expect(serviceSupabase.calls.upserts.subscriptions ?? []).toEqual([])
  })

  it('out-of-order: subscription.updated arrives BEFORE checkout.session.completed, both converge to correct state', async () => {
    // ── First event: customer.subscription.updated (out-of-order) ───────────
    // The handler looks up the user via profiles.stripe_customer_id, then upserts
    serviceSupabase = createSupabaseMock({
      tables: {
        billing_events: { insert: { data: null, error: null }, update: { data: null, error: null } },
        profiles: {
          single: { data: { id: 'user-1' }, error: null },
          update: { data: null, error: null },
        },
        subscriptions: { upsert: { data: null, error: null } },
      },
    })

    const updEvt = buildSubscriptionUpdated({
      id: 'evt_upd_first',
      data: {
        object: {
          id: 'sub_e2e',
          customer: 'cus_e2e',
          status: 'active',
          current_period_end: 1_800_000_000,
          cancel_at_period_end: false,
          items: {
            data: [
              {
                id: 'si_default',
                object: 'subscription_item',
                price: { id: TEST_PRO_PRICE_ID },
                quantity: 1,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
      },
    })

    webhooksConstructEvent.mockReturnValueOnce(updEvt)
    const res1 = await webhookPOST(webhookReq())
    expect(res1.status).toBe(200)

    // First upsert must reflect the pro plan
    const firstUpsert = serviceSupabase.calls.upserts.subscriptions?.[0] as Record<string, unknown>
    expect(firstUpsert).toMatchObject({
      id: 'sub_e2e',
      plan: 'pro',
      status: 'active',
    })

    // ── Second event: checkout.session.completed (delayed, but arrives now) ──
    serviceSupabase = createSupabaseMock({
      tables: {
        billing_events: { insert: { data: null, error: null }, update: { data: null, error: null } },
        profiles: {
          single: { data: { id: 'user-1', stripe_customer_id: null }, error: null },
          update: { data: null, error: null },
        },
        subscriptions: { upsert: { data: null, error: null } },
      },
    })

    subscriptionsRetrieve.mockResolvedValueOnce(buildRetrievedSub())

    const checkoutEvt = buildCheckoutSessionCompleted({
      id: 'evt_checkout_second',
      data: {
        object: {
          client_reference_id: 'user-1',
          subscription: 'sub_e2e',
        },
      },
    })
    webhooksConstructEvent.mockReturnValueOnce(checkoutEvt)

    const res2 = await webhookPOST(webhookReq())
    expect(res2.status).toBe(200)

    // Second upsert should also reflect the same pro plan → consistent state
    const secondUpsert = serviceSupabase.calls.upserts.subscriptions?.[0] as Record<string, unknown>
    expect(secondUpsert).toMatchObject({
      id: 'sub_e2e',
      plan: 'pro',
      status: 'active',
    })
  })
})
