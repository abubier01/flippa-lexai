// lib/stripe/handlers/__tests__/invoice-payment-succeeded.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { buildInvoicePaymentSucceeded } from '@/__tests__/helpers/stripe-fixtures'

let supabaseMock: ReturnType<typeof createSupabaseMock>

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

import { handleInvoicePaymentSucceeded } from '../invoice-payment-succeeded'

describe('handleInvoicePaymentSucceeded', () => {
  it('renewal happy path: status active + period_end updated', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: {
          single: { data: { user_id: 'user-4' }, error: null },
          update: { data: null, error: null },
        },
      },
    })
    const periodEndSec = 1_900_000_000
    const evt = buildInvoicePaymentSucceeded({ data: { object: { period_end: periodEndSec } } })

    const res = await handleInvoicePaymentSucceeded(evt)

    expect(res).toEqual({ userId: 'user-4' })
    const upd = supabaseMock.calls.updates.subscriptions?.[0] as any
    expect(upd).toMatchObject({ status: 'active' })
    expect(new Date(upd.current_period_end).getTime()).toBe(periodEndSec * 1000)
  })

  it('no subscription on invoice → { userId: null }, no writes', async () => {
    supabaseMock = createSupabaseMock({})
    const evt = buildInvoicePaymentSucceeded({ data: { object: { subscription: null as any } } })
    const res = await handleInvoicePaymentSucceeded(evt)

    expect(res).toEqual({ userId: null })
    expect(supabaseMock.calls.updates.subscriptions ?? []).toEqual([])
  })

  it('missing period_end → { userId: null }, no writes', async () => {
    supabaseMock = createSupabaseMock({})
    const evt = buildInvoicePaymentSucceeded({ data: { object: { period_end: null as any } } })
    const res = await handleInvoicePaymentSucceeded(evt)

    expect(res).toEqual({ userId: null })
    expect(supabaseMock.calls.updates.subscriptions ?? []).toEqual([])
  })

  it('throws on subscriptions update error', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: {
          single: { data: { user_id: 'user-4' }, error: null },
          update: { data: null, error: { message: 'renewal boom' } },
        },
      },
    })
    const evt = buildInvoicePaymentSucceeded()
    await expect(handleInvoicePaymentSucceeded(evt)).rejects.toThrow(/renewal boom/i)
  })
})
