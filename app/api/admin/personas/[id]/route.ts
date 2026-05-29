// GET /api/admin/personas/[id] — current published version of a persona.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { loadCurrentPersonaVersion, PersonaRepoError } from '@/lib/persona/repo'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    const version = await loadCurrentPersonaVersion(getServiceClient(), id)
    return NextResponse.json({ version })
  } catch (err) {
    if (err instanceof PersonaRepoError && err.code === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
