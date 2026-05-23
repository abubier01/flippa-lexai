import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  hasTeamAccess: vi.fn(),
  assertHasFeature: vi.fn(),
  PlanGateError: class PlanGateError extends Error {
    feature: string
    tier: string
    constructor(feature: string, tier: string) {
      super(`${feature} denied on ${tier}`)
      this.feature = feature
      this.tier = tier
    }
  },
  serviceFrom: vi.fn(),
  state: {
    userId: 'user_1',
    team: { id: 'team_1', name: 'Acme Team', owner_id: 'user_1' },
    members: [
      { team_id: 'team_1', user_id: 'user_1', role: 'owner' },
      { team_id: 'team_1', user_id: 'user_2', role: 'member' },
    ],
    invites: [{ id: 'invite_1', team_id: 'team_1', status: 'pending', email: 'new@acme.test' }],
    profiles: [
      { id: 'user_1', full_name: 'Owner', plan: 'team' },
      { id: 'user_2', full_name: 'Member', plan: 'free' },
    ],
  },
}))

class TeamQuery {
  private filters: Record<string, unknown> = {}
  constructor(private table: string) {}

  select() {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value
    return this
  }

  in(column: string, values: string[]) {
    this.filters[column] = values
    return this
  }

  async single() {
    if (this.table === 'teams') {
      if (this.filters.id === mocks.state.team.id) return { data: mocks.state.team }
      return { data: null }
    }
    return { data: null }
  }

  private execute() {
    if (this.table === 'team_members') {
      return {
        data: mocks.state.members.filter((m) => m.team_id === this.filters.team_id),
      }
    }
    if (this.table === 'team_invites') {
      return {
        data: mocks.state.invites.filter(
          (i) => i.team_id === this.filters.team_id && i.status === this.filters.status,
        ),
      }
    }
    if (this.table === 'profiles') {
      const ids = (this.filters.id as string[]) ?? []
      return { data: mocks.state.profiles.filter((p) => ids.includes(p.id)) }
    }
    return { data: [] }
  }

  then(resolve: (value: { data: unknown[] }) => unknown) {
    return Promise.resolve(resolve(this.execute()))
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createServiceClient,
}))

vi.mock('@/lib/plan/access', () => ({
  hasTeamAccess: mocks.hasTeamAccess,
  assertHasFeature: mocks.assertHasFeature,
  PlanGateError: mocks.PlanGateError,
}))

describe('GET /api/team entitlement enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.userId = 'user_1'
    mocks.assertHasFeature.mockResolvedValue({ tier: 'team', status: 'active' })
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: mocks.state.userId } },
        }),
      },
    })
    mocks.serviceFrom.mockImplementation((table: string) => new TeamQuery(table))
    mocks.createServiceClient.mockReturnValue({
      from: mocks.serviceFrom,
    })
  })

  it('returns team payload for active owner entitlement', async () => {
    mocks.hasTeamAccess.mockResolvedValue({ ok: true, via: 'own', teamId: 'team_1' })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.team?.id).toBe('team_1')
    expect(body.members).toHaveLength(2)
    expect(body.invites).toHaveLength(1)
  })

  it('returns team payload for active member via owner team plan', async () => {
    mocks.state.userId = 'user_2'
    mocks.hasTeamAccess.mockResolvedValue({ ok: true, via: 'membership', teamId: 'team_1' })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.team?.id).toBe('team_1')
    expect(body.members).toHaveLength(2)
  })

  it('returns empty payload for stale membership after owner downgrade', async () => {
    mocks.state.userId = 'user_2'
    mocks.hasTeamAccess.mockResolvedValue({ ok: false, via: null, teamId: 'team_1' })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ team: null, members: [], invites: [] })
    expect(mocks.serviceFrom).not.toHaveBeenCalled()
  })
})
