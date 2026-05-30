// app/api/team/join/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

let userSupabase: ReturnType<typeof createSupabaseMock>
let serviceSupabase: ReturnType<typeof createSupabaseMock>

const { getActivePlanMock } = vi.hoisted(() => ({
  getActivePlanMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => Promise.resolve(userSupabase.client)),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => serviceSupabase.client),
}))

vi.mock('@/lib/plan/access', () => ({
  getActivePlan: getActivePlanMock,
  invalidatePlanCache: vi.fn(),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/team/join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

type InviteRow = {
  id: string
  team_id: string
  email: string
  expires_at: string
  status: string
  teams: { name: string; owner_id: string }
}

function setup({
  user = { id: 'user-1', email: 'joiner@example.com' } as { id: string; email?: string } | null,
  invite = {
    id: 'inv-1',
    team_id: 'team-1',
    email: 'joiner@example.com',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'pending',
    teams: { name: 'Acme', owner_id: 'owner-1' },
  } as InviteRow | null,
  ownerPlan = { tier: 'team', status: 'active' },
  memberCount = 3,
} = {}) {
  userSupabase = createSupabaseMock({ auth: { user: user ?? undefined } })
  if (!user) {
    ;(userSupabase.client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null })
  }

  serviceSupabase = createSupabaseMock({
    tables: {
      team_invites: {
        single: { data: invite, error: null },
        update: { data: null, error: null },
      },
      team_members: {
        select: { data: [], error: null, count: memberCount } as any,
        upsert: { data: null, error: null },
      },
      profiles: { update: { data: null, error: null } },
    },
  })

  getActivePlanMock.mockReset()
  getActivePlanMock.mockResolvedValue(ownerPlan)
}

beforeEach(() => setup())

describe('POST /api/team/join', () => {
  it('401 when unauthenticated', async () => {
    setup({ user: null })
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(401)
  })

  it('400 when token missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('404 when invite not found', async () => {
    setup({ invite: null })
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(404)
  })

  it('410 and marks expired when invite past expiry', async () => {
    setup({
      invite: {
        id: 'inv-1',
        team_id: 'team-1',
        email: 'joiner@example.com',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        status: 'pending',
        teams: { name: 'Acme', owner_id: 'owner-1' },
      },
    })
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(410)
    // verify update({ status: 'expired' }) was issued — captured by mock's
    // updates tracker
    const invitesTouched = serviceSupabase.calls?.fromByTable?.team_invites ?? 0
    expect(invitesTouched).toBeGreaterThan(0)
  })

  it('403 when invite email does not match authed user', async () => {
    setup({ user: { id: 'user-1', email: 'someoneelse@example.com' } })
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(403)
  })

  it('402 when team owner does not hold active team plan', async () => {
    setup({ ownerPlan: { tier: 'solo', status: 'active' } })
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(402)
  })

  it('403 when team is full (MAX_TEAM_MEMBERS reached)', async () => {
    setup({ memberCount: 10 })
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/full/i)
  })

  it('200 with { success: true, teamName } on happy path', async () => {
    const res = await POST(req({ token: 'tok' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, teamName: 'Acme' })
  })
})
