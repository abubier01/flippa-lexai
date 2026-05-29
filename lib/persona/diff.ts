// lib/persona/diff.ts
//
// Structured diff between two Persona versions for the admin diff view.
// Returns three sub-diffs:
//   * description: line-by-line text diff (additions / removals / unchanged)
//   * keyClauses : per-id add / remove / modify (field-level)
//   * riskAreas  : per-id add / remove / modify (field-level)

import { diffLines } from 'diff'
import type { Persona, KeyClause, RiskArea } from '@/lib/prompt/persona-types'

export interface TextDiffPart {
  value: string
  added?: boolean
  removed?: boolean
}

export interface RowDiff<T> {
  added: T[]
  removed: T[]
  modified: Array<{ from: T; to: T; fields: string[] }>
  unchanged: T[]
}

export interface PersonaDiff {
  description: TextDiffPart[]
  keyClauses: RowDiff<KeyClause>
  riskAreas: RowDiff<RiskArea>
}

export function diffPersona(a: Persona, b: Persona): PersonaDiff {
  return {
    description: diffLines(a.description, b.description).map((p) => ({
      value: p.value,
      added: p.added,
      removed: p.removed,
    })),
    keyClauses: diffRowsById(a.keyClauses, b.keyClauses),
    riskAreas: diffRowsById(a.riskAreas, b.riskAreas),
  }
}

function diffRowsById<T extends { id: string }>(from: T[], to: T[]): RowDiff<T> {
  const fromById = new Map(from.map((r) => [r.id, r]))
  const toById = new Map(to.map((r) => [r.id, r]))

  const added: T[] = []
  const removed: T[] = []
  const modified: RowDiff<T>['modified'] = []
  const unchanged: T[] = []

  for (const [id, toRow] of toById) {
    const fromRow = fromById.get(id)
    if (!fromRow) {
      added.push(toRow)
      continue
    }
    const fields = differingFields(fromRow, toRow)
    if (fields.length === 0) unchanged.push(toRow)
    else modified.push({ from: fromRow, to: toRow, fields })
  }
  for (const [id, fromRow] of fromById) {
    if (!toById.has(id)) removed.push(fromRow)
  }

  return { added, removed, modified, unchanged }
}

function differingFields<T extends Record<string, unknown>>(a: T, b: T): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: string[] = []
  for (const k of keys) {
    if ((a[k] ?? null) !== (b[k] ?? null)) out.push(k)
  }
  return out
}
