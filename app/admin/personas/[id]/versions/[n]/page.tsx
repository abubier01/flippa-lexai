// P6.5 — Version detail (read-only render of a specific historical version).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformAdminPage } from '@/lib/admin/page-guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { getUserEmails } from '@/lib/users/lookup'
import { PersonaSchema } from '@/lib/prompt/persona-types'
import { PersonaReadOnlyView } from '@/components/admin/persona-editor/readonly-view'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function VersionDetailPage({
  params,
}: {
  params: Promise<{ id: string; n: string }>
}) {
  await requirePlatformAdminPage()
  const { id, n } = await params
  const versionNumber = Number.parseInt(n, 10)
  if (!Number.isInteger(versionNumber) || versionNumber < 1) notFound()
  const svc = getServiceClient()

  const { data: persona, error: pErr } = await svc
    .from('personas')
    .select('current_version_id')
    .eq('id', id)
    .maybeSingle()
  if (pErr || !persona) notFound()
  const currentVersionId = (persona as { current_version_id: string | null }).current_version_id

  const { data: row, error } = await svc
    .from('persona_versions')
    .select(
      'id, version_number, status, content, content_hash, notes, published_at, published_by, created_at, created_by',
    )
    .eq('persona_id', id)
    .eq('version_number', versionNumber)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !row) notFound()

  const parsed = PersonaSchema.safeParse((row as { content: unknown }).content)
  if (!parsed.success) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Stored persona content failed validation. The record is corrupt — contact engineering.
      </div>
    )
  }

  const isCurrent = (row as { id: string }).id === currentVersionId
  const publishedBy = (row as { published_by: string | null }).published_by
  const emails = await getUserEmails(publishedBy ? [publishedBy] : [])
  const email = publishedBy ? emails.get(publishedBy) ?? 'unknown' : '—'

  // Current version number for the banner.
  let currentVersionNumber: number | null = null
  if (currentVersionId) {
    const { data: cur } = await svc
      .from('persona_versions')
      .select('version_number')
      .eq('id', currentVersionId)
      .maybeSingle()
    currentVersionNumber = (cur as { version_number: number } | null)?.version_number ?? null
  }

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
        <Link href={`/admin/personas/${id}/versions`} className="hover:underline">
          Versions
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">v{versionNumber}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Version {versionNumber}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {isCurrent ? <Badge>current</Badge> : <Badge variant="outline">published</Badge>}
            <span className="font-mono text-xs" title={(row as { content_hash: string }).content_hash}>
              hash {(row as { content_hash: string }).content_hash.slice(0, 12)}…
            </span>
            <span>
              published{' '}
              {(row as { published_at: string | null }).published_at
                ? new Date((row as { published_at: string }).published_at).toLocaleString()
                : '—'}{' '}
              by {email}
            </span>
          </div>
        </div>
      </div>

      {!isCurrent && currentVersionNumber !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <span>
            This is version {versionNumber}. Current published version is {currentVersionNumber}.
          </span>
          <div className="flex gap-4">
            <Link
              href={`/admin/personas/${id}/diff?from=${versionNumber}&to=current`}
              className="text-primary hover:underline"
            >
              Diff vs current
            </Link>
            <Link
              href={`/admin/personas/${id}/versions`}
              className="text-primary hover:underline"
            >
              Back to history
            </Link>
          </div>
        </div>
      ) : null}

      {(row as { notes: string | null }).notes ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Notes
          </div>
          {(row as { notes: string }).notes}
        </div>
      ) : null}

      <PersonaReadOnlyView persona={parsed.data} />
    </div>
  )
}
