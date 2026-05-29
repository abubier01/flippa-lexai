// GET /api/admin/personas — list all personas with their current version metadata.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { logger } from '@/lib/log/request'

export async function GET(req: NextRequest) {
  const rlog = logger(req, 'admin.personas.list')
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('personas')
    .select('id, current_version_id, created_at, updated_at')
    .order('id', { ascending: true })

  if (error) {
    rlog.error('admin.personas.list_failed', { err: error })
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ personas: data ?? [] })
}
