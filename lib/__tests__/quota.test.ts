import { describe, it, expect, vi } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { withQuotaClaim } from '@/lib/quota'

describe('withQuotaClaim', () => {
  it('returns claim_error on claim RPC error and does not release', async () => {
    const supabaseMock = createSupabaseMock({
      rpc: {
        claim_monthly_contract: {
          single: { data: null, error: { message: 'db down' } },
        },
      },
    })

    const out = await withQuotaClaim(supabaseMock.client, 10, async () => ({
      ok: true,
      value: 'ok',
    }))

    expect(out).toEqual({ kind: 'claim_error', error: 'db down' })
    expect(supabaseMock.calls.rpc.map(c => c.name)).toEqual(['claim_monthly_contract'])
  })

  it('returns denied when claim is not allowed and does not release', async () => {
    const supabaseMock = createSupabaseMock({
      rpc: {
        claim_monthly_contract: {
          single: { data: { allowed: false, current_count: 5, period_token: '2026-05-01' }, error: null },
        },
      },
    })

    const out = await withQuotaClaim(supabaseMock.client, 5, async () => ({
      ok: true,
      value: 'ok',
    }))

    expect(out).toEqual({
      kind: 'denied',
      plan_reason: 'limit_reached',
      currentCount: 5,
    })
    expect(supabaseMock.calls.rpc.map(c => c.name)).toEqual(['claim_monthly_contract'])
  })

  it('returns value and does not release when fn returns ok:true', async () => {
    const supabaseMock = createSupabaseMock({
      rpc: {
        claim_monthly_contract: {
          single: { data: { allowed: true, current_count: 1, period_token: '2026-05-01' }, error: null },
        },
      },
    })

    const out = await withQuotaClaim(supabaseMock.client, 10, async () => ({
      ok: true,
      value: { id: 'abc' },
    }))

    expect(out).toEqual({ kind: 'ran', result: { id: 'abc' } })
    expect(supabaseMock.calls.rpc.map(c => c.name)).toEqual(['claim_monthly_contract'])
  })

  it('releases and returns value when fn returns ok:false', async () => {
    const supabaseMock = createSupabaseMock({
      rpc: {
        claim_monthly_contract: {
          single: { data: { allowed: true, current_count: 1, period_token: '2026-05-01' }, error: null },
        },
        release_monthly_contract: {
          single: { data: null, error: null },
        },
      },
    })

    const out = await withQuotaClaim(supabaseMock.client, 10, async () => ({
      ok: false,
      value: { status: 422, error: 'bad file' },
    }))

    expect(out).toEqual({ kind: 'ran', result: { status: 422, error: 'bad file' } })
    expect(supabaseMock.calls.rpc.map(c => c.name)).toEqual([
      'claim_monthly_contract',
      'release_monthly_contract',
    ])
  })

  it('releases and rethrows when fn throws', async () => {
    const supabaseMock = createSupabaseMock({
      rpc: {
        claim_monthly_contract: {
          single: { data: { allowed: true, current_count: 1, period_token: '2026-05-01' }, error: null },
        },
        release_monthly_contract: {
          single: { data: null, error: null },
        },
      },
    })

    await expect(
      withQuotaClaim(supabaseMock.client, 10, async () => {
        throw new Error('explode')
      }),
    ).rejects.toThrow('explode')

    expect(supabaseMock.calls.rpc.map(c => c.name)).toEqual([
      'claim_monthly_contract',
      'release_monthly_contract',
    ])
  })

  it('logs release failures but does not throw them', async () => {
    const supabaseMock = createSupabaseMock({
      rpc: {
        claim_monthly_contract: {
          single: { data: { allowed: true, current_count: 1, period_token: '2026-05-01' }, error: null },
        },
        release_monthly_contract: {
          single: { data: null, error: { message: 'leaked' } },
        },
      },
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const out = await withQuotaClaim(supabaseMock.client, 10, async () => ({
      ok: false,
      value: { status: 422, error: 'bad file' },
    }))

    expect(out).toEqual({ kind: 'ran', result: { status: 422, error: 'bad file' } })
    expect(errSpy).toHaveBeenCalledTimes(1)
    const logged = errSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(logged)
    expect(parsed).toMatchObject({
      level: 'error',
      msg: 'quota release failed',
      subsystem: 'quota',
      op: 'release',
      err: { message: 'leaked' },
    })
    errSpy.mockRestore()
  })
})
