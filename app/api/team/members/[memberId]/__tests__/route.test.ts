// app/api/team/members/[memberId]/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '@/__tests__/helpers/supabase-mock'

let userSupabase: ReturnType<typeof createSupabaseMock>
let serviceSupabase: ReturnType<typeof createSupabaseMock>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => Promise.resolve(userSupabase.client)),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => serviceSupabase.client),
}))

import { DELETE } from '../route'

function req() {
  return new NextRequest('http://localhost/api/team/members/member-2', { method: 'DELETE' })
}

function setup({
  user = { id: 'owner-1', email: 'owner@example.com' } as { id: string; email?: string } | null,
  profile = { team_id: 'team-1' } as { team_id: string | null } | null,
  team = { owner_id: 'owner-1' } as { owner_id: string } | null,
} = {}) {
  userSupabase = createSupabaseMock({
    auth: { user: user ?? undefined },
    tables: {
      profiles: { single: { data: profile, error: null } },
    },
  })
  if (!user) {
    ;(userSupabase.client.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null })
  }
  serviceSupabase = createSupabaseMock({
    tables: {
      teams: { single: { data: team, error: null } },
      team_members: { delete: { data: null, error: null } },
      profiles: { update: { data: null, error: null } },
    },
  })
}

beforeEach(() => setup())

function params(memberId: string) {
  return { params: Promise.resolve({ memberId }) }
}

describe('DELETE /api/team/members/[memberId]', () => {
  it('401 when unauthenticated', async () => {
    setup({ user: null })
    const res = await DELETE(req(), params('member-2'))
    expect(res.status).toBe(401)
  })

  it('403 when caller not in a team', async () => {
    setup({ profile: { team_id: null } })
    const res = await DELETE(req(), params('member-2'))
    expect(res.status).toBe(403)
  })

  it('403 when caller is not the team owner', async () => {
    setup({ team: { owner_id: 'someone-else' } })
    const res = await DELETE(req(), params('member-2'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/only the team owner/i)
  })

  it('400 when owner tries to remove themselves', async () => {
    const res = await DELETE(req(), params('owner-1'))
    expect(res.status).toBe(400)
  })

  it('200 on happy-path removal', async () => {
    const res = await DELETE(req(), params('member-2'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
