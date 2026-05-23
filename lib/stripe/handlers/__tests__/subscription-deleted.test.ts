// lib/stripe/handlers/__tests__/subscription-deleted.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { buildSubscriptionDeleted } from '@/__tests__/helpers/stripe-fixtures'

let supabaseMock: ReturnType<typeof createSupabaseMock>

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

import { handleSubscriptionDeleted } from '../subscription-deleted'

describe('handleSubscriptionDeleted', () => {
  it('cancels subscription and downgrades profile to free', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: { single: { data: { id: 'user-1' }, error: null }, update: { data: null, error: null } },
        subscriptions: { update: { data: null, error: null } },
      },
    })
    const evt = buildSubscriptionDeleted()
    const res = await handleSubscriptionDeleted(evt)

    expect(res.userId).toBe('user-1')
    expect(supabaseMock.calls.updates.subscriptions?.[0]).toMatchObject({ status: 'canceled' })
    expect(supabaseMock.calls.updates.profiles?.[0]).toEqual({ plan: 'free' })
  })

  it('returns { userId: null } when profile is gone (PGRST116) — graceful', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabaseMock = createSupabaseMock({
      tables: { profiles: { single: { data: null, error: { code: 'PGRST116', message: 'not found' } } } },
    })
    const evt = buildSubscriptionDeleted()
    const res = await handleSubscriptionDeleted(evt)

    expect(res).toEqual({ userId: null })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no profile for customer'))
    warn.mockRestore()
  })

  it('throws on non-PGRST116 profile lookup error', async () => {
    supabaseMock = createSupabaseMock({
      tables: { profiles: { single: { data: null, error: { code: '500', message: 'db down' } } } },
    })
    const evt = buildSubscriptionDeleted()
    await expect(handleSubscriptionDeleted(evt)).rejects.toThrow(/db down/i)
  })

  it('throws when subscriptions update errors', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        profiles: { single: { data: { id: 'user-1' }, error: null }, update: { data: null, error: null } },
        subscriptions: { update: { data: null, error: { message: 'sub update boom' } } },
      },
    })
    const evt = buildSubscriptionDeleted()
    await expect(handleSubscriptionDeleted(evt)).rejects.toThrow(/sub update boom/i)
  })
})
