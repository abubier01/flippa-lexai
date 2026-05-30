// GET /api/admin/personas/[id]/versions — full version history (reverse-chrono).

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { listPersonaVersions, PersonaRepoError } from '@/lib/persona/repo'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    const versions = await listPersonaVersions(getServiceClient(), id)
    return NextResponse.json({ versions })
  } catch (err) {
    if (err instanceof PersonaRepoError) {
      return NextResponse.json({ error: err.code, detail: err.detail }, { status: 500 })
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
