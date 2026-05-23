import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as postTeam } from '../route'
import { POST as postInvite } from '../invite/route'
import { POST as postShareContract } from '../share-contract/route'
import { POST as postJoin } from '../join/route'
import { DELETE as deleteTeamMember } from '../members/[memberId]/route'

const mocks = vi.hoisted(() => {
  class MockPlanGateError extends Error {
    feature: string
    tier: string
    constructor(feature: string, tier: string) {
      super(`${feature} denied on ${tier}`)
      this.name = 'PlanGateError'
      this.feature = feature
      this.tier = tier
    }
  }

  return {
    createClient: vi.fn(),
    createServiceClient: vi.fn(),
    assertHasFeature: vi.fn(),
    hasTeamAccess: vi.fn(),
    PlanGateError: MockPlanGateError,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createServiceClient,
}))

vi.mock('@/lib/plan/access', () => ({
  assertHasFeature: mocks.assertHasFeature,
  hasTeamAccess: mocks.hasTeamAccess,
  PlanGateError: mocks.PlanGateError,
}))

function mockAuthedClient(teamId: string | null = null, email: string = 'owner@acme.test') {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user_1', email } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { team_id: teamId } }),
        }),
      }),
    }),
  })
}

describe('team API feature gates (sharedLibrary)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertHasFeature.mockRejectedValue(new mocks.PlanGateError('sharedLibrary', 'solo'))
    mocks.hasTeamAccess.mockResolvedValue({ ok: true, via: 'own', teamId: 'team_1' })
  })

  it('POST /api/team returns 403 for solo-tier users', async () => {
    mockAuthedClient(null)
    const req = new NextRequest('http://localhost/api/team', {
      method: 'POST',
      body: JSON.stringify({ name: 'Acme' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await postTeam(req)
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.feature).toBe('sharedLibrary')
  })

  it('POST /api/team/invite returns 403 for solo-tier users', async () => {
    mockAuthedClient('team_1')
    const req = new NextRequest('http://localhost/api/team/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@acme.test' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await postInvite(req)
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.feature).toBe('sharedLibrary')
  })

  it('POST /api/team/share-contract returns 403 for solo-tier users', async () => {
    mockAuthedClient('team_1')
    const req = new NextRequest('http://localhost/api/team/share-contract', {
      method: 'POST',
      body: JSON.stringify({ contractId: 'contract_1', share: true }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await postShareContract(req)
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.feature).toBe('sharedLibrary')
  })

  it('DELETE /api/team/members/:memberId returns 403 for solo-tier users', async () => {
    mockAuthedClient('team_1')
    const req = new NextRequest('http://localhost/api/team/members/user_2', { method: 'DELETE' })
    const res = await deleteTeamMember(req, { params: Promise.resolve({ memberId: 'user_2' }) })
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.feature).toBe('sharedLibrary')
  })

  it('POST /api/team/join returns 403 when owner lacks sharedLibrary entitlement', async () => {
    mockAuthedClient(null, 'invitee@acme.test')
    const invite = {
      id: 'invite_1',
      token: 'tok_1',
      status: 'pending',
      email: 'invitee@acme.test',
      team_id: 'team_1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      teams: { name: 'Acme Team', owner_id: 'owner_1' },
    }

    mocks.createServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: invite }),
            }),
          }),
        }),
      }),
    })

    const req = new NextRequest('http://localhost/api/team/join', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok_1' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await postJoin(req)
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.feature).toBe('sharedLibrary')
  })
})
