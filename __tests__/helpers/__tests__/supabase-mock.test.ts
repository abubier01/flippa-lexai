import { describe, it, expect, vi } from 'vitest'
import { createSupabaseMock } from '../supabase-mock'

describe('createSupabaseMock', () => {
  it('returns a chainable builder for from().select().eq().single()', async () => {
    const { client } = createSupabaseMock({
      tables: {
        profiles: { single: { data: { id: 'u1', plan: 'pro' }, error: null } },
      },
    })

    const res = await client.from('profiles').select('*').eq('id', 'u1').single()
    expect(res).toEqual({ data: { id: 'u1', plan: 'pro' }, error: null })
  })

  it('records insert payloads for assertion', async () => {
    const { client, calls } = createSupabaseMock({
      tables: { billing_events: { insert: { data: null, error: null } } },
    })

    await client.from('billing_events').insert({ event_id: 'evt_1', type: 'x' })

    expect(calls.inserts.billing_events).toEqual([{ event_id: 'evt_1', type: 'x' }])
  })

  it('supports rpc() with per-call queued responses', async () => {
    const { client } = createSupabaseMock({
      rpc: {
        claim_monthly_contract: [
          { single: { data: { allowed: true }, error: null } },
          { single: { data: { allowed: false }, error: null } },
        ],
      },
    })

    const a = await client.rpc('claim_monthly_contract').single()
    const b = await client.rpc('claim_monthly_contract').single()

    expect(a.data).toEqual({ allowed: true })
    expect(b.data).toEqual({ allowed: false })
  })

  it('returns a queryable error from .single() when configured', async () => {
    const { client } = createSupabaseMock({
      tables: { profiles: { single: { data: null, error: { code: 'PGRST116', message: 'not found' } } } },
    })

    const res = await client.from('profiles').select('id').eq('id', 'x').single()
    expect(res.error?.code).toBe('PGRST116')
  })

  it('exposes from-call count per table', async () => {
    const { client, calls } = createSupabaseMock({})
    await client.from('a').select()
    await client.from('a').select()
    await client.from('b').select()
    expect(calls.fromByTable.a).toBe(2)
    expect(calls.fromByTable.b).toBe(1)
  })
})
