// lib/plan/__tests__/access-queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

vi.mock('server-only', () => ({}))

let supabaseMock: ReturnType<typeof createSupabaseMock>

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => supabaseMock.client),
}))

import { getActivePlan, hasTeamAccess } from '../access'

function activeSubRow(plan: string, status = 'active') {
  return { status, plan, current_period_end: new Date(Date.now() + 86_400_000).toISOString() }
}

describe('getActivePlan', () => {
  it('no subscription row → tier "free"', async () => {
    supabaseMock = createSupabaseMock({
      tables: { subscriptions: { select: { data: [], error: null } } },
    })
    const r = await getActivePlan('user-1')
    expect(r.tier).toBe('free')
  })

  it('active "pro" subscription → tier "pro"', async () => {
    supabaseMock = createSupabaseMock({
      tables: { subscriptions: { select: { data: [activeSubRow('pro')], error: null } } },
    })
    const r = await getActivePlan('user-1')
    expect(r.tier).toBe('pro')
    expect(r.status).toBe('active')
  })

  it('active "team" subscription → tier "team"', async () => {
    supabaseMock = createSupabaseMock({
      tables: { subscriptions: { select: { data: [activeSubRow('team')], error: null } } },
    })
    expect((await getActivePlan('user-1')).tier).toBe('team')
  })

  it('Supabase error → throws (does NOT silently return "free")', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabaseMock = createSupabaseMock({
      tables: { subscriptions: { select: { data: null, error: { message: 'db down' } } } },
    })
    await expect(getActivePlan('user-1')).rejects.toThrow(/db down/i)
    err.mockRestore()
  })
})

describe('hasTeamAccess', () => {
  it('user own plan is team → { ok: true, via: "own", teamId }', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: { select: { data: [activeSubRow('team')], error: null } },
        profiles: { single: { data: { team_id: 'team-99' }, error: null } },
      },
    })
    expect(await hasTeamAccess('user-1')).toEqual({ ok: true, via: 'own', teamId: 'team-99' })
  })

  it('user is member of team whose owner has team plan → { ok: true, via: "membership", teamId }', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: { select: { data: [], error: null } }, // user-1: free
        team_members: {
          single: {
            data: { team_id: 'team-99', teams: { owner_id: 'owner-1' } },
            error: null,
          },
        },
      },
    })
    // The second call to subscriptions (for owner) should return team.
    // Re-wire after first call using a call counter.
    const realFrom = supabaseMock.client.from
    let subQueryCount = 0
    supabaseMock.client.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        subQueryCount++
        if (subQueryCount === 2) {
          // owner's lookup — return team plan
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn(),
          }
          const ownerResult = { data: [activeSubRow('team')], error: null }
          chain.limit.mockReturnValue(Promise.resolve(ownerResult))
          chain.then = (resolve: (v: unknown) => void) => Promise.resolve(ownerResult).then(resolve)
          return chain
        }
      }
      return realFrom(table)
    })

    const r = await hasTeamAccess('user-1')
    expect(r).toEqual({ ok: true, via: 'membership', teamId: 'team-99' })
  })

  it('user in team whose owner downgraded → { ok: false, via: null, teamId }', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: { select: { data: [], error: null } }, // free for both
        team_members: {
          single: {
            data: { team_id: 'team-99', teams: { owner_id: 'owner-1' } },
            error: null,
          },
        },
      },
    })
    const r = await hasTeamAccess('user-1')
    expect(r.ok).toBe(false)
    expect(r.teamId).toBe('team-99')
  })

  it('no team membership → { ok: false, via: null, teamId: null }', async () => {
    supabaseMock = createSupabaseMock({
      tables: {
        subscriptions: { select: { data: [], error: null } },
        team_members: { single: { data: null, error: null } },
      },
    })
    const r = await hasTeamAccess('user-1')
    expect(r).toEqual({ ok: false, via: null, teamId: null })
  })
})
