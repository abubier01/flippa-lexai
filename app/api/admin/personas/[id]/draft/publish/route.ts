// POST /api/admin/personas/[id]/draft/publish — promote the draft to a new
// published version. Atomicity handled by publish_persona_draft RPC.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { publishDraft, PersonaRepoError } from '@/lib/persona/repo'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    const version = await publishDraft(getServiceClient(), id, auth.userId)
    return NextResponse.json({ version })
  } catch (err) {
    if (err instanceof PersonaRepoError) {
      const status =
        err.code === 'no_draft' ? 404 : err.code === 'validation' ? 422 : 500
      return NextResponse.json({ error: err.code, detail: err.detail }, { status })
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
