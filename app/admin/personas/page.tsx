// P6.1 — Personas list page. Server component; reads via service-role.

import Link from 'next/link'
import { requirePlatformAdminPage } from '@/lib/admin/page-guard'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { loadPersonaVersion } from '@/lib/persona/repo'
import { getUserEmails } from '@/lib/users/lookup'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

interface PersonaRow {
  id: string
  current_version_id: string | null
  created_at: string
  updated_at: string
}

export default async function PersonasListPage() {
  await requirePlatformAdminPage()
  const svc = getServiceClient()

  const { data: personas, error } = await svc
    .from('personas')
    .select('id, current_version_id, created_at, updated_at')
    .order('id', { ascending: true })

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load personas: {error.message}
      </div>
    )
  }

  const rows: PersonaRow[] = (personas ?? []) as PersonaRow[]

  // Pull current version metadata for each persona.
  const enriched = await Promise.all(
    rows.map(async (p) => {
      if (!p.current_version_id) {
        return { persona: p, version: null as null }
      }
      try {
        const v = await loadPersonaVersion(svc, p.current_version_id)
        return { persona: p, version: v }
      } catch {
        return { persona: p, version: null as null }
      }
    }),
  )

  const editorIds = enriched
    .map((e) => e.version?.published_by ?? e.version?.created_by)
    .filter((s): s is string => Boolean(s))
  const emails = await getUserEmails(editorIds)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Personas</h1>
        <p className="text-sm text-muted-foreground">
          Manage the LexAI analysis personas. Edits create new immutable versions; historical analyses keep their original lens.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Current version</TableHead>
              <TableHead>Last edited by</TableHead>
              <TableHead>Last edited at</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enriched.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No personas configured.
                </TableCell>
              </TableRow>
            ) : (
              enriched.map(({ persona, version }) => {
                const editorId = version?.published_by ?? version?.created_by ?? null
                const email = editorId ? emails.get(editorId) ?? null : null
                const editedAt = version?.published_at ?? version?.created_at ?? persona.updated_at
                return (
                  <TableRow key={persona.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/personas/${persona.id}`}
                        className="text-primary hover:underline"
                      >
                        {persona.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {version ? `v${version.version_number}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {email ?? <span className="italic">unknown</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {editedAt ? new Date(editedAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/personas/${persona.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </Link>
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
