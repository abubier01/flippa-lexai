// P6.2 — Persona detail (read-only) with metadata strip, draft banner /
// create-draft action, version-history link, usage counter, and the three
// read-only sections.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformAdminPage } from '@/lib/admin/page-guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { loadCurrentPersonaVersion, getDraft, PersonaRepoError } from '@/lib/persona/repo'
import { getUsageCount } from '@/lib/persona/usage'
import { getUserEmails } from '@/lib/users/lookup'
import { PersonaReadOnlyView } from '@/components/admin/persona-editor/readonly-view'
import { CreateDraftButton } from '@/components/admin/persona-editor/create-draft-button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface Params {
  id: string
}

export default async function PersonaDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  await requirePlatformAdminPage()
  const { id } = await params
  const svc = getServiceClient()

  let current
  try {
    current = await loadCurrentPersonaVersion(svc, id)
  } catch (err) {
    if (err instanceof PersonaRepoError && err.code === 'not_found') notFound()
    throw err
  }
  const draft = await getDraft(svc, id)
  const usageCount = await getUsageCount(svc, current.id, 30)

  const idsToLookUp = [
    current.published_by ?? current.created_by,
    draft?.created_by ?? null,
  ].filter((s): s is string => Boolean(s))
  const emails = await getUserEmails(idsToLookUp)
  const publisherEmail =
    emails.get(current.published_by ?? current.created_by ?? '') ?? 'unknown'
  const draftEditorEmail = draft ? emails.get(draft.created_by) ?? 'unknown' : null

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/admin/personas" className="hover:underline">
          Personas
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{id}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{id}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="outline">v{current.version_number}</Badge>
            <span
              className="font-mono text-xs"
              title={current.content_hash}
            >
              hash {current.content_hash.slice(0, 12)}…
            </span>
            <span>
              published{' '}
              {current.published_at
                ? new Date(current.published_at).toLocaleString()
                : '—'}{' '}
              by {publisherEmail}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {draft ? null : <CreateDraftButton personaId={id} />}
          <Link
            href={`/admin/personas/${id}/versions`}
            className="text-sm text-primary hover:underline"
          >
            View version history →
          </Link>
        </div>
      </div>

      {draft ? (
        <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <strong>Draft in progress.</strong>{' '}
              Last edited{' '}
              {new Date(draft.created_at).toLocaleString()} by {draftEditorEmail}.
            </div>
            <Link
              href={`/admin/personas/${id}/draft`}
              className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-800"
            >
              Continue editing
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Recent usage
        </div>
        <div className="mt-1 text-2xl font-semibold">
          {usageCount.toLocaleString()}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            runs in last 30 days (current version)
          </span>
        </div>
      </div>

      <PersonaReadOnlyView persona={current.content} />
    </div>
  )
}
