// P6.4 — Version history. Reverse-chronological table of persona versions.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformAdminPage } from '@/lib/admin/page-guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { getUserEmails } from '@/lib/users/lookup'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

interface VersionRow {
  id: string
  version_number: number
  status: 'draft' | 'published'
  notes: string | null
  published_at: string | null
  published_by: string | null
  created_at: string
  created_by: string
  used_in: number
  is_current: boolean
}

export default async function VersionHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePlatformAdminPage()
  const { id } = await params
  const svc = getServiceClient()

  const { data: persona, error: personaErr } = await svc
    .from('personas')
    .select('id, current_version_id')
    .eq('id', id)
    .maybeSingle()
  if (personaErr || !persona) notFound()
  const currentVersionId = (persona as { current_version_id: string | null }).current_version_id

  const { data: versions, error } = await svc
    .from('persona_versions')
    .select(
      'id, version_number, status, notes, published_at, published_by, created_at, created_by',
    )
    .eq('persona_id', id)
    .order('version_number', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load versions: {error.message}
      </div>
    )
  }

  const versionRows = (versions ?? []) as Array<Omit<VersionRow, 'used_in' | 'is_current'>>

  // Lifetime usage counts per version.
  const enriched: VersionRow[] = await Promise.all(
    versionRows.map(async (v) => {
      const { count } = await svc
        .from('analysis_runs')
        .select('id', { count: 'exact', head: true })
        .eq('persona_version_id', v.id)
      return {
        ...v,
        used_in: count ?? 0,
        is_current: v.id === currentVersionId,
      }
    }),
  )

  const ids = enriched
    .map((v) => v.published_by ?? v.created_by)
    .filter((s): s is string => Boolean(s))
  const emails = await getUserEmails(ids)

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
        <span className="text-foreground">Versions</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Version history</h1>
        <p className="text-sm text-muted-foreground">
          Every published version is immutable; historical runs continue to render against the version that produced them.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Used in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enriched.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No versions.
                </TableCell>
              </TableRow>
            ) : (
              enriched.map((v) => {
                const editorId = v.published_by ?? v.created_by
                const email = emails.get(editorId) ?? 'unknown'
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      {v.status === 'draft' ? (
                        <span className="text-muted-foreground">draft</span>
                      ) : (
                        `v${v.version_number}`
                      )}
                    </TableCell>
                    <TableCell>
                      {v.is_current ? (
                        <Badge>current</Badge>
                      ) : v.status === 'draft' ? (
                        <Badge variant="secondary">draft</Badge>
                      ) : (
                        <Badge variant="outline">published</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.published_at ? (
                        <>
                          {new Date(v.published_at).toLocaleString()}
                          <div className="text-xs">by {email}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.notes ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.used_in.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-3 text-sm">
                        {v.status === 'published' ? (
                          <Link
                            href={`/admin/personas/${id}/versions/${v.version_number}`}
                            className="text-primary hover:underline"
                          >
                            View
                          </Link>
                        ) : null}
                        {!v.is_current && currentVersionId ? (
                          <Link
                            href={`/admin/personas/${id}/diff?from=${
                              v.status === 'draft' ? 'draft' : v.version_number
                            }&to=current`}
                            className="text-primary hover:underline"
                          >
                            Diff vs current
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
