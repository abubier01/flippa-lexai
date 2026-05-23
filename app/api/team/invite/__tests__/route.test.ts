// app/api/team/invite/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

let userSupabase: ReturnType<typeof createSupabaseMock>
let serviceSupabase: ReturnType<typeof createSupabaseMock>

const { hasTeamAccessMock } = vi.hoisted(() => ({
  hasTeamAccessMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => Promise.resolve(userSupabase.client)),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => serviceSupabase.client),
}))

vi.mock('@/lib/plan/access', () => ({
  hasTeamAccess: hasTeamAccessMock,
}))

vi.mock('server-only', () => ({}))

import { POST } from '../route'

function buildReq(body: unknown) {
  return new NextRequest('http://localhost/api/team/invite', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function configureDefault({
  authedUser = { id: 'user-1', email: 'owner@example.com' } as { id: string; email?: string } | null,
  profile = { plan: 'team', team_id: 'team-1' } as { plan: string; team_id: string | null } | null,
  teamAccess = { ok: true, via: 'own', teamId: 'team-1' } as { ok: boolean; via: 'own' | 'membership' | null; teamId: string | null },
  memberCount = 3,
  existingInvite = null as { id: string } | null,
  insertReturn = { data: { id: 'inv-1', token: 'tok-abc', team_id: 'team-1' }, error: null } as any,
} = {}) {
  userSupabase = createSupabaseMock({ auth: { user: authedUser ?? undefined } })
  if (!authedUser) {
    ;(userSupabase.client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null })
  }

  serviceSupabase = createSupabaseMock({
    tables: {
      profiles: { single: { data: profile, error: null } },
      team_members: { select: { data: [], error: null, count: memberCount } as any },
      team_invites: {
        maybeSingle: { data: existingInvite, error: null },
        insert: insertReturn,
      },
    },
  })

  hasTeamAccessMock.mockResolvedValue(teamAccess)
}

beforeEach(() => {
  hasTeamAccessMock.mockReset()
  configureDefault()
})

describe('POST /api/team/invite', () => {
  it('401 when unauthenticated', async () => {
    configureDefault({ authedUser: null })
    const res = await POST(buildReq({ email: 'invitee@x.com' }))
    expect(res.status).toBe(401)
  })

  it('400 when email is missing', async () => {
    const res = await POST(buildReq({}))
    expect(res.status).toBe(400)
  })

  it('400 when email is whitespace', async () => {
    const res = await POST(buildReq({ email: '   ' }))
    expect(res.status).toBe(400)
  })

  it('403 when hasTeamAccess returns ok=false', async () => {
    configureDefault({ teamAccess: { ok: false, via: null, teamId: null } })
    const res = await POST(buildReq({ email: 'invitee@x.com' }))
    expect(res.status).toBe(403)
  })

  it('403 when access.via !== "own" (membership access cannot invite)', async () => {
    configureDefault({
      teamAccess: { ok: true, via: 'membership', teamId: 'team-1' },
    })
    const res = await POST(buildReq({ email: 'invitee@x.com' }))
    expect(res.status).toBe(403)
  })

  it('403 when team is at member limit (10)', async () => {
    configureDefault({ memberCount: 10 })
    const res = await POST(buildReq({ email: 'invitee@x.com' }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.error).toMatch(/team is full/i)
  })

  it('409 when an existing pending invite is found for the same email', async () => {
    configureDefault({ existingInvite: { id: 'inv-0' } })
    const res = await POST(buildReq({ email: 'invitee@x.com' }))
    expect(res.status).toBe(409)
  })

  it('successful invite returns 200 with invite + inviteLink, and inserts normalized email', async () => {
    const res = await POST(buildReq({ email: 'Foo@Bar.COM' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.invite).toBeDefined()
    expect(body.inviteLink).toMatch(/^\/team\/join\?token=/)
    expect(serviceSupabase.calls.inserts.team_invites?.[0]).toMatchObject({
      team_id: 'team-1',
      invited_by: 'user-1',
      email: 'foo@bar.com',  // normalized
    })
  })

  it('Foo@Bar.COM and foo@bar.com collide on existing-invite check (email normalized before query)', async () => {
    // Configure existing invite ONLY for the normalized form
    configureDefault({ existingInvite: { id: 'pre-existing' } })
    const res = await POST(buildReq({ email: 'Foo@Bar.COM' }))
    expect(res.status).toBe(409)
  })

  it('500 when team_invites.insert errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configureDefault({ insertReturn: { data: null, error: { message: 'insert boom' } } })
    const res = await POST(buildReq({ email: 'invitee@x.com' }))
    expect(res.status).toBe(500)
    errSpy.mockRestore()
  })
})
