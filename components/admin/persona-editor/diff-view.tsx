// Renders a PersonaDiff: description text diff + key-clause / risk-area row diffs.
// Used by /admin/personas/[id]/diff and by the publish-confirmation modal.

import type { PersonaDiff } from '@/lib/persona/diff'
import type { KeyClause, RiskArea } from '@/lib/prompt/persona-types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function PersonaDiffView({ diff }: { diff: PersonaDiff }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </h2>
        <DescriptionDiff parts={diff.description} />
      </section>

      <RowDiffSection
        title="Key Clauses"
        added={diff.keyClauses.added}
        removed={diff.keyClauses.removed}
        modified={diff.keyClauses.modified}
        unchanged={diff.keyClauses.unchanged}
      />

      <RowDiffSection
        title="Risk Areas"
        added={diff.riskAreas.added}
        removed={diff.riskAreas.removed}
        modified={diff.riskAreas.modified}
        unchanged={diff.riskAreas.unchanged}
      />
    </div>
  )
}

function DescriptionDiff({ parts }: { parts: PersonaDiff['description'] }) {
  if (parts.every((p) => !p.added && !p.removed)) {
    return <p className="text-sm text-muted-foreground italic">No description changes.</p>
  }
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
      {parts.map((p, i) => {
        const cls = p.added
          ? 'bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-100'
          : p.removed
            ? 'bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100'
            : 'text-muted-foreground'
        const prefix = p.added ? '+ ' : p.removed ? '- ' : '  '
        return (
          <span key={i} className={cls}>
            {p.value
              .split('\n')
              .filter((l, idx, arr) => !(idx === arr.length - 1 && l === ''))
              .map((line, j) => (
                <span key={j} className="block">
                  {prefix}
                  {line}
                </span>
              ))}
          </span>
        )
      })}
    </pre>
  )
}

type Row = KeyClause | RiskArea

function RowDiffSection({
  title,
  added,
  removed,
  modified,
  unchanged,
}: {
  title: string
  added: Row[]
  removed: Row[]
  modified: Array<{ from: Row; to: Row; fields: string[] }>
  unchanged: Row[]
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}{' '}
        <span className="ml-2 font-normal text-xs">
          {added.length} added · {removed.length} removed · {modified.length} modified · {unchanged.length} unchanged
        </span>
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">ID</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Hint</TableHead>
            <TableHead className="w-[100px]">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {added.map((r) => (
            <TableRow key={`a-${r.id}`} className="bg-green-50/60 dark:bg-green-950/20">
              <TableCell className="font-mono text-xs">{r.id}</TableCell>
              <TableCell>{r.label}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.hint ?? '—'}</TableCell>
              <TableCell className="text-xs font-medium text-green-900 dark:text-green-200">added</TableCell>
            </TableRow>
          ))}
          {removed.map((r) => (
            <TableRow key={`r-${r.id}`} className="bg-red-50/60 line-through dark:bg-red-950/20">
              <TableCell className="font-mono text-xs">{r.id}</TableCell>
              <TableCell>{r.label}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.hint ?? '—'}</TableCell>
              <TableCell className="text-xs font-medium text-red-900 dark:text-red-200 no-underline">removed</TableCell>
            </TableRow>
          ))}
          {modified.map((m) => (
            <TableRow key={`m-${m.to.id}`} className="bg-yellow-50/60 dark:bg-yellow-950/20">
              <TableCell className="font-mono text-xs">{m.to.id}</TableCell>
              <TableCell>
                {m.fields.includes('label') ? (
                  <span>
                    <s className="text-red-700 dark:text-red-300">{m.from.label}</s>{' '}
                    <span className="text-green-800 dark:text-green-300">→ {m.to.label}</span>
                  </span>
                ) : (
                  m.to.label
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {m.fields.includes('hint') ? (
                  <span>
                    <s className="text-red-700 dark:text-red-300">{m.from.hint ?? '—'}</s>{' '}
                    <span className="text-green-800 dark:text-green-300">→ {m.to.hint ?? '—'}</span>
                  </span>
                ) : (
                  m.to.hint ?? '—'
                )}
              </TableCell>
              <TableCell className="text-xs font-medium text-yellow-900 dark:text-yellow-200">
                modified
              </TableCell>
            </TableRow>
          ))}
          {added.length === 0 && removed.length === 0 && modified.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground italic">
                No changes.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </section>
  )
}
