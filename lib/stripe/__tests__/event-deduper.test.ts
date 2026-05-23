// lib/stripe/__tests__/event-deduper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

let supabaseMock: ReturnType<typeof createSupabaseMock>

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

import { tryClaimEvent, markEventProcessed, releaseClaim } from '../event-deduper'

beforeEach(() => {
  supabaseMock = createSupabaseMock({})
})

describe('event-deduper', () => {
  describe('tryClaimEvent', () => {
    it('returns fresh on insert success', async () => {
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { insert: { data: null, error: null } } },
      })
      const outcome = await tryClaimEvent('evt_1', 'checkout.session.completed', 'user-1', { foo: 'bar' })
      expect(outcome).toEqual({ kind: 'fresh' })
    })

    it('returns already-processed when PK conflict row has processed_at', async () => {
      supabaseMock = createSupabaseMock({
        tables: {
          billing_events: {
            insert: { data: null, error: { code: '23505', message: 'unique_violation' } },
            maybeSingle: { data: { processed_at: '2026-05-23T12:00:00.000Z' }, error: null },
          },
        },
      })
      const outcome = await tryClaimEvent('evt_1', 'checkout.session.completed', null, {})
      expect(outcome).toEqual({
        kind: 'already-processed',
        processedAt: '2026-05-23T12:00:00.000Z',
      })
    })

    it('returns in-flight when PK conflict row has null processed_at', async () => {
      supabaseMock = createSupabaseMock({
        tables: {
          billing_events: {
            insert: { data: null, error: { code: '23505', message: 'unique_violation' } },
            maybeSingle: { data: { processed_at: null }, error: null },
          },
        },
      })
      const outcome = await tryClaimEvent('evt_1', 'checkout.session.completed', null, {})
      expect(outcome).toEqual({ kind: 'in-flight' })
    })

    it('throws on non-unique-violation DB error', async () => {
      supabaseMock = createSupabaseMock({
        tables: {
          billing_events: { insert: { data: null, error: { code: '40001', message: 'serialization failure' } } },
        },
      })
      await expect(tryClaimEvent('evt_1', 'x', null, {})).rejects.toThrow(/serialization failure/)
    })

    it('passes event_id, type, user_id, and payload to the insert', async () => {
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { insert: { data: null, error: null } } },
      })
      const payload = { foo: 'bar' }
      await tryClaimEvent('evt_42', 'invoice.payment_failed', 'user-9', payload)
      expect(supabaseMock.calls.inserts.billing_events).toEqual([
        { event_id: 'evt_42', type: 'invoice.payment_failed', user_id: 'user-9', payload },
      ])
    })

    it('reads processed_at on 23505 to disambiguate outcome', async () => {
      supabaseMock = createSupabaseMock({
        tables: {
          billing_events: {
            insert: { data: null, error: { code: '23505', message: 'unique_violation' } },
            maybeSingle: { data: { processed_at: null }, error: null },
          },
        },
      })
      await tryClaimEvent('evt_1', 'checkout.session.completed', null, {})
      expect(supabaseMock.calls.fromByTable.billing_events).toBe(2)
    })

    it('accepts null user_id', async () => {
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { insert: { data: null, error: null } } },
      })
      await tryClaimEvent('evt_anon', 'customer.subscription.deleted', null, {})
      expect(supabaseMock.calls.inserts.billing_events?.[0]).toMatchObject({ user_id: null })
    })
  })

  describe('markEventProcessed', () => {
    it('writes processed_at timestamp on the matching event_id row', async () => {
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { update: { data: null, error: null } } },
      })
      await markEventProcessed('evt_1')
      const upd = supabaseMock.calls.updates.billing_events?.[0] as { processed_at?: string }
      expect(upd.processed_at).toBeTypeOf('string')
      expect(Number.isNaN(Date.parse(upd.processed_at!))).toBe(false)
    })

    it('throws on update error', async () => {
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { update: { data: null, error: { message: 'boom' } } } },
      })
      await expect(markEventProcessed('evt_1')).rejects.toThrow(/boom/)
    })
  })

  describe('releaseClaim', () => {
    it('deletes the row by event_id', async () => {
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { delete: { data: null, error: null } } },
      })
      await releaseClaim('evt_1')
      const calls = supabaseMock.calls.deletes.billing_events ?? []
      expect(calls).toHaveLength(1)
      expect(calls[0].filters).toContainEqual(['event_id', 'evt_1'])
    })

    it('does not throw when delete errors (only logs)', async () => {
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
      supabaseMock = createSupabaseMock({
        tables: { billing_events: { delete: { data: null, error: { message: 'gone' } } } },
      })
      await expect(releaseClaim('evt_1')).resolves.toBeUndefined()
      const payload = JSON.parse(consoleErr.mock.calls[0][0] as string)
      expect(payload.msg).toBe('event-deduper.release-claim.failed')
      expect(payload.eventId).toBe('evt_1')
      expect(payload.route).toBe('stripe.webhook')
      expect(payload.err.message).toBe('gone')
      consoleErr.mockRestore()
    })
  })
})
