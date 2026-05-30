// P6.6 — Diff view. Accepts ?from=N|"draft"|"current"&to=N|"draft"|"current".

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePlatformAdminPage } from '@/lib/admin/page-guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { diffPersona } from '@/lib/persona/diff'
import { PersonaSchema, type Persona } from '@/lib/prompt/persona-types'
import { PersonaDiffView } from '@/components/admin/persona-editor/diff-view'

export const dynamic = 'force-dynamic'

type Ref = string // "N" | "draft" | "current"

interface Loaded {
  ref: Ref
  label: string // "v3" | "draft" | "current (v5)"
  content: Persona
}

async function loadByRef(svc: SupabaseClient, personaId: string, ref: Ref): Promise<Loaded | null> {
  if (ref === 'current') {
    const { data: persona } = await svc
      .from('personas')
      .select('current_version_id')
      .eq('id', personaId)
      .maybeSingle()
    const currentId = (persona as { current_version_id: string | null } | null)?.current_version_id
    if (!currentId) return null
    const { data } = await svc
      .from('persona_versions')
      .select('content, version_number, status')
      .eq('id', currentId)
      .maybeSingle()
    if (!data) return null
    const parsed = PersonaSchema.safeParse((data as { content: unknown }).content)
    if (!parsed.success) return null
    return {
      ref,
      label: `current (v${(data as { version_number: number }).version_number})`,
      content: parsed.data,
    }
  }
  if (ref === 'draft') {
    const { data } = await svc
      .from('persona_versions')
      .select('content, version_number')
      .eq('persona_id', personaId)
      .eq('status', 'draft')
      .maybeSingle()
    if (!data) return null
    const parsed = PersonaSchema.safeParse((data as { content: unknown }).content)
    if (!parsed.success) return null
    return { ref, label: 'draft', content: parsed.data }
  }
  const n = Number.parseInt(ref, 10)
  if (!Number.isInteger(n) || n < 1) return null
  const { data } = await svc
    .from('persona_versions')
    .select('content, version_number')
    .eq('persona_id', personaId)
    .eq('version_number', n)
    .eq('status', 'published')
    .maybeSingle()
  if (!data) return null
  const parsed = PersonaSchema.safeParse((data as { content: unknown }).content)
  if (!parsed.success) return null
  return { ref, label: `v${(data as { version_number: number }).version_number}`, content: parsed.data }
}

export default async function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requirePlatformAdminPage()
  const { id } = await params
  const { from, to } = await searchParams
  if (!from || !to) notFound()

  const svc = getServiceClient()
  const [a, b] = await Promise.all([loadByRef(svc, id, from), loadByRef(svc, id, to)])
  if (!a || !b) {
    return (
      <div className="space-y-4">
        <nav className="text-sm text-muted-foreground">
          <Link href={`/admin/personas/${id}`} className="hover:underline">
            ← {id}
          </Link>
        </nav>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          One or both versions could not be loaded ({from} → {to}).
        </div>
      </div>
    )
  }

  const diff = diffPersona(a.content, b.content)

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/admin/personas" className="hover:underline">
          Personas
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/personas/${id}`} className="hover:underline">
          {id}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Diff</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">
          Comparing {a.label} → {b.label}
        </h1>
        <p className="text-sm text-muted-foreground">Persona: {id}</p>
      </div>

      <PersonaDiffView diff={diff} />
    </div>
  )
}
