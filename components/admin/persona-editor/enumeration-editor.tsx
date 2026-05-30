'use client'

// Generic row editor for keyClauses / riskAreas. Shape is identical:
//   { id: string, label: string, hint?: string }
// Behaviors per spec § Part 5 § 3 (Edit draft):
//   * ID is read-only on rows whose id is in `publishedIds` (slug lock).
//   * "Remove" on a never-published row hard-deletes; on a published row
//     it sets a tag-for-removal flag (strikethrough; excluded on publish).
//   * Restore action on tagged-for-removal rows.
//   * Reorder via up/down buttons (Tier 1 fallback — @dnd-kit not in deps).
//   * "+ Add" appends an empty row.

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface EditableRow {
  id: string
  label: string
  hint?: string
  /** True if this row has appeared in a published version (slug-locked, removable as tag-for-removal). */
  published: boolean
  /** True if marked for removal in this draft. */
  removed: boolean
  /** True if this row was added in this draft (never published). */
  isNew: boolean
}

export interface EnumerationEditorProps {
  kind: 'keyClause' | 'riskArea'
  rows: EditableRow[]
  onChange: (next: EditableRow[]) => void
  /** Per-row field errors, keyed by stable row identity (id or "__new_<idx>"). */
  errors?: Record<string, string>
}

const LABEL = {
  keyClause: { title: 'Key Clauses', noun: 'clause' },
  riskArea: { title: 'Risk Areas', noun: 'risk area' },
} as const

export function EnumerationEditor({ kind, rows, onChange, errors }: EnumerationEditorProps) {
  const formId = useId()
  const label = LABEL[kind]

  function update(index: number, patch: Partial<EditableRow>) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChange(next)
  }

  function remove(index: number) {
    const row = rows[index]
    if (row.published) {
      // Tag for removal (preserve in state for publish-time exclusion).
      update(index, { removed: true })
    } else {
      // Hard-delete.
      onChange(rows.filter((_, i) => i !== index))
    }
  }

  function restore(index: number) {
    update(index, { removed: false })
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    onChange(next)
  }

  function add() {
    onChange([
      ...rows,
      {
        id: '',
        label: '',
        hint: '',
        published: false,
        removed: false,
        isNew: true,
      },
    ])
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {label.title} ({rows.filter((r) => !r.removed).length})
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Add {label.noun}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">ID (slug)</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Hint (optional)</TableHead>
            <TableHead className="w-[160px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground italic">
                No {label.noun}s yet. Add one to get started.
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row, i) => {
            const rowKey = row.published ? row.id : `${formId}-new-${i}`
            const errKey = row.id || `__new_${i}`
            const err = errors?.[errKey]
            const idLocked = row.published
            return (
              <TableRow
                key={rowKey}
                data-testid={`row-${rowKey}`}
                className={
                  row.removed
                    ? 'bg-red-50/40 line-through dark:bg-red-950/20'
                    : err
                      ? 'bg-destructive/5'
                      : undefined
                }
              >
                <TableCell>
                  {idLocked ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Input
                            readOnly
                            aria-readonly="true"
                            data-locked="true"
                            value={row.id}
                            className="cursor-not-allowed font-mono text-xs"
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          Historical runs reference this ID — see version history.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Input
                      value={row.id}
                      onChange={(e) => update(i, { id: e.target.value })}
                      placeholder="snake_case_id"
                      className="font-mono text-xs"
                      aria-label="ID slug"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    value={row.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Display label"
                    disabled={row.removed}
                    aria-label="Label"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.hint ?? ''}
                    onChange={(e) => update(i, { hint: e.target.value })}
                    placeholder="Optional one-line hint"
                    disabled={row.removed}
                    aria-label="Hint"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Move up"
                      disabled={i === 0 || row.removed}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Move down"
                      disabled={i === rows.length - 1 || row.removed}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                    {row.removed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => restore(i)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove(i)}
                        aria-label="Remove"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  {err ? (
                    <div className="mt-1 text-right text-xs text-destructive">{err}</div>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
