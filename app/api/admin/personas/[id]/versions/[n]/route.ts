// GET /api/admin/personas/[id]/versions/[n] — fetch a specific version_number.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; n: string }> },
) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id, n } = await ctx.params

  const versionNumber = Number.parseInt(n, 10)
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return NextResponse.json({ error: 'invalid_version' }, { status: 400 })
  }

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('persona_versions')
    .select(
      'id, persona_id, version_number, status, content, content_hash, notes, created_at, created_by, published_at, published_by',
    )
    .eq('persona_id', id)
    .eq('version_number', versionNumber)
    .eq('status', 'published')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ version: data })
}
