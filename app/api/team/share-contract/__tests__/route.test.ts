// app/api/team/share-contract/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

let userSupabase: ReturnType<typeof createSupabaseMock>

const { hasTeamAccessMock } = vi.hoisted(() => ({
  hasTeamAccessMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => Promise.resolve(userSupabase.client)),
}))

vi.mock('@/lib/plan/access', () => ({
  hasTeamAccess: hasTeamAccessMock,
}))

import { POST } from '../route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/team/share-contract', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function setup({
  user = { id: 'user-1', email: 'owner@example.com' } as { id: string; email?: string } | null,
  profile = { plan: 'team', team_id: 'team-1' } as { plan: string; team_id: string | null } | null,
  contract = { id: 'c-1', user_id: 'user-1' } as { id: string; user_id: string } | null,
  teamAccess = { ok: true, via: 'own', teamId: 'team-1' } as { ok: boolean; via: 'own' | 'membership' | null; teamId: string | null },
  updateError = null as { message: string } | null,
} = {}) {
  userSupabase = createSupabaseMock({
    auth: { user: user ?? undefined },
    tables: {
      profiles: { single: { data: profile, error: null } },
      contracts: {
        single: { data: contract, error: null },
        update: { data: null, error: updateError },
      },
    },
  })
  if (!user) {
    ;(userSupabase.client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null })
  }
  hasTeamAccessMock.mockReset()
  hasTeamAccessMock.mockResolvedValue(teamAccess)
}

beforeEach(() => setup())

describe('POST /api/team/share-contract', () => {
  it('401 when unauthenticated', async () => {
    setup({ user: null })
    const res = await POST(req({ contractId: 'c-1', share: true }))
    expect(res.status).toBe(401)
  })

  it('400 when contractId missing', async () => {
    const res = await POST(req({ share: true }))
    expect(res.status).toBe(400)
  })

  it('403 when user does not hold team plan', async () => {
    setup({ teamAccess: { ok: false, via: null, teamId: null } })
    const res = await POST(req({ contractId: 'c-1', share: true }))
    expect(res.status).toBe(403)
  })

  it('403 when owner plan flips inactive mid-flight (hasTeamAccess.ok=false)', async () => {
    // Profile still shows team_id (cached) but access lookup returns ok:false.
    setup({
      profile: { plan: 'team', team_id: 'team-1' },
      teamAccess: { ok: false, via: null, teamId: 'team-1' },
    })
    const res = await POST(req({ contractId: 'c-1', share: true }))
    expect(res.status).toBe(403)
  })

  it('404 when contract not owned by user / not found', async () => {
    setup({ contract: null })
    const res = await POST(req({ contractId: 'c-1', share: true }))
    expect(res.status).toBe(404)
  })

  it('500 when update returns an error', async () => {
    setup({ updateError: { message: 'db down' } })
    const res = await POST(req({ contractId: 'c-1', share: true }))
    expect(res.status).toBe(500)
  })

  it('200 { success, shared: true } on happy path', async () => {
    const res = await POST(req({ contractId: 'c-1', share: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, shared: true })
  })

  it('200 { success, shared: false } when unsharing', async () => {
    const res = await POST(req({ contractId: 'c-1', share: false }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, shared: false })
  })
})
