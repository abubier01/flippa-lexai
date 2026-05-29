// Read-only renderer for a persona's three sections. Shared by
// /admin/personas/[id] (current) and /admin/personas/[id]/versions/[n] (historical).

import type { Persona } from '@/lib/prompt/persona-types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function PersonaReadOnlyView({ persona }: { persona: Persona }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </h2>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
          {persona.description}
        </pre>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Key Clauses ({persona.keyClauses.length})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">ID</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Hint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {persona.keyClauses.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.id}</TableCell>
                <TableCell>{c.label}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.hint ?? <span className="italic">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Risk Areas ({persona.riskAreas.length})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">ID</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Hint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {persona.riskAreas.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.hint ?? <span className="italic">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
