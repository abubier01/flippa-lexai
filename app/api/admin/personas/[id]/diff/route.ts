// GET /api/admin/personas/[id]/diff?from=N&to=M
//
// Returns structured diff between two persona versions. `from` and `to` accept
// either a version_number (integer) or the literal "draft" for the current
// draft row.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { diffPersona } from '@/lib/persona/diff'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Persona } from '@/lib/prompt/persona-types'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'missing_query', detail: 'from and to required' }, { status: 400 })
  }

  const svc = getServiceClient()
  try {
    const a = await loadByRef(svc, id, from)
    const b = await loadByRef(svc, id, to)
    return NextResponse.json({
      from: { ref: from, version_number: a.version_number, status: a.status },
      to: { ref: to, version_number: b.version_number, status: b.status },
      diff: diffPersona(a.content, b.content),
    })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg === 'not_found' ? 404 : msg === 'invalid_ref' ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

async function loadByRef(
  svc: SupabaseClient,
  personaId: string,
  ref: string,
): Promise<{ content: Persona; version_number: number; status: string }> {
  if (ref === 'draft') {
    const { data, error } = await svc
      .from('persona_versions')
      .select('content, version_number, status')
      .eq('persona_id', personaId)
      .eq('status', 'draft')
      .maybeSingle()
    if (error) throw new Error('db_error')
    if (!data) throw new Error('not_found')
    return data as { content: Persona; version_number: number; status: string }
  }

  const n = Number.parseInt(ref, 10)
  if (!Number.isInteger(n) || n < 1) throw new Error('invalid_ref')

  const { data, error } = await svc
    .from('persona_versions')
    .select('content, version_number, status')
    .eq('persona_id', personaId)
    .eq('version_number', n)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error('db_error')
  if (!data) throw new Error('not_found')
  return data as { content: Persona; version_number: number; status: string }
}
