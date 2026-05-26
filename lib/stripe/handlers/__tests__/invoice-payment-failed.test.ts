// lib/stripe/handlers/__tests__/invoice-payment-failed.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { buildInvoicePaymentFailed } from '@/__tests__/helpers/stripe-fixtures'

let supabaseMock: ReturnType<typeof createSupabaseMock>

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

import { handleInvoicePaymentFailed } from '../invoice-payment-failed'

describe('handleInvoicePaymentFailed', () => {
  it('marks subscription past_due and returns userId', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: { single: { data: { user_id: 'user-7' }, error: null }, update: { data: null, error: null } },
      },
    })
    const evt = buildInvoicePaymentFailed()
    const res = await handleInvoicePaymentFailed(evt)

    expect(res).toEqual({ userId: 'user-7' })
    expect(supabaseMock.calls.updates.subscriptions?.[0]).toMatchObject({ status: 'past_due' })
  })

  it('returns { userId: null } when invoice has no subscription, no DB writes', async () => {
    supabaseMock = createSupabaseMock({})
    const evt = buildInvoicePaymentFailed({ data: { object: { subscription: null as any } } })
    const res = await handleInvoicePaymentFailed(evt)

    expect(res).toEqual({ userId: null })
    expect(supabaseMock.calls.updates.subscriptions ?? []).toEqual([])
  })

  it('throws on subscription lookup error', async () => {
    supabaseMock = createSupabaseMock({
      tables: { subscriptions: { single: { data: null, error: { message: 'lookup boom' } } } },
    })
    const evt = buildInvoicePaymentFailed()
    await expect(handleInvoicePaymentFailed(evt)).rejects.toThrow(/lookup boom/i)
  })

  it('throws on subscriptions update error', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: {
          single: { data: { user_id: 'user-7' }, error: null },
          update: { data: null, error: { message: 'update boom' } },
        },
      },
    })
    const evt = buildInvoicePaymentFailed()
    await expect(handleInvoicePaymentFailed(evt)).rejects.toThrow(/update boom/i)
  })
})
