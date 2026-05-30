// GET    /api/admin/personas/[id]/draft  — return current draft (404 if none)
// POST   /api/admin/personas/[id]/draft  — create draft (clones current published)
// PATCH  /api/admin/personas/[id]/draft  — merge a partial Persona patch
// DELETE /api/admin/personas/[id]/draft  — hard-delete the draft row

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin/guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import {
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  PersonaRepoError,
} from '@/lib/persona/repo'
import type { Persona } from '@/lib/prompt/persona-types'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    const draft = await getDraft(getServiceClient(), id)
    if (!draft) return NextResponse.json({ error: 'no_draft' }, { status: 404 })
    return NextResponse.json({ draft })
  } catch (err) {
    return NextResponse.json({ error: 'db_error', detail: (err as Error).message }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    const draft = await createDraft(getServiceClient(), id, auth.userId)
    return NextResponse.json({ draft }, { status: 201 })
  } catch (err) {
    if (err instanceof PersonaRepoError) {
      const status = err.code === 'draft_exists' ? 409 : err.code === 'not_found' ? 404 : 500
      return NextResponse.json({ error: err.code, detail: err.detail }, { status })
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  let patch: unknown
  try {
    patch = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  try {
    const draft = await updateDraft(getServiceClient(), id, patch as Partial<Persona>, auth.userId)
    return NextResponse.json({ draft })
  } catch (err) {
    if (err instanceof PersonaRepoError) {
      const status =
        err.code === 'no_draft' ? 404 : err.code === 'validation' ? 422 : 500
      return NextResponse.json({ error: err.code, detail: err.detail }, { status })
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params

  try {
    await deleteDraft(getServiceClient(), id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PersonaRepoError && err.code === 'no_draft') {
      return NextResponse.json({ error: 'no_draft' }, { status: 404 })
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }
}
