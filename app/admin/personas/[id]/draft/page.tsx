// P6.3 — Draft editor page. Server shell loads the draft + computes the
// "ever-published" ID set used for slug-locking + tag-for-removal semantics
// in the EnumerationEditor.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requirePlatformAdminPage } from '@/lib/admin/page-guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { getDraft } from '@/lib/persona/repo'
import { PersonaSchema, type Persona } from '@/lib/prompt/persona-types'
import { PersonaDraftEditor } from '@/components/admin/persona-editor/editor'

export const dynamic = 'force-dynamic'

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePlatformAdminPage()
  const { id } = await params
  const svc = getServiceClient()

  const draft = await getDraft(svc, id)
  if (!draft) {
    redirect(`/admin/personas/${id}`)
  }

  // Union of all IDs that have appeared in any published version, for slug-lock.
  const { data: publishedRows, error: pubErr } = await svc
    .from('persona_versions')
    .select('content')
    .eq('persona_id', id)
    .eq('status', 'published')
  if (pubErr) {
    throw new Error(`failed to load published-id history: ${pubErr.message}`)
  }

  const keyClauseIds = new Set<string>()
  const riskAreaIds = new Set<string>()
  for (const row of publishedRows ?? []) {
    const parsed = PersonaSchema.safeParse((row as { content: unknown }).content)
    if (!parsed.success) continue
    for (const c of parsed.data.keyClauses) keyClauseIds.add(c.id)
    for (const r of parsed.data.riskAreas) riskAreaIds.add(r.id)
  }

  // Validate the draft content shape before handing it to the editor. If a
  // direct-SQL write corrupted the draft, surface that here rather than
  // crashing the editor.
  const draftContent = PersonaSchema.safeParse(draft.content)
  const initialDraft: Persona = draftContent.success
    ? draftContent.data
    : (draft.content as Persona)

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
        <span className="text-foreground">Edit draft</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Edit draft</h1>
        <p className="text-sm text-muted-foreground">
          Persona <span className="font-mono">{id}</span>. Changes save to the
          draft only; publish to create an immutable new version.
        </p>
      </div>

      {!draftContent.success ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Warning: stored draft failed validation. Edits will repair it on save.
        </div>
      ) : null}

      <PersonaDraftEditor
        personaId={id}
        initialDraft={initialDraft}
        publishedIds={{
          keyClauses: Array.from(keyClauseIds),
          riskAreas: Array.from(riskAreaIds),
        }}
      />
    </div>
  )
}
