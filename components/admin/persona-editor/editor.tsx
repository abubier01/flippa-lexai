'use client'

// P6.3 — Persona draft editor (client component). Spec § Part 5 § 3.
//
// State model:
//   * `description` is the live description string.
//   * `keyClauses` / `riskAreas` are EditableRow[]; the editor tracks
//     `published`, `removed`, `isNew` flags per row so the publish payload
//     can faithfully express slug-locks + tag-for-removal semantics.
//
// Persistence:
//   * Explicit Save: PATCH /api/admin/personas/[id]/draft.
//   * Autosave on description blur (debounced 1s).
//
// Publish flow:
//   * Open modal -> fetch GET /diff?from=current&to=draft -> render diff
//   * Confirm -> POST /draft/publish -> redirect to detail on success
//   * 422 -> surface per-field errors inline
//
// Preview: POST /draft/preview -> renders prompt in a Sheet.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Persona } from '@/lib/prompt/persona-types'
import type { PersonaDiff } from '@/lib/persona/diff'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EnumerationEditor, type EditableRow } from './enumeration-editor'
import { PersonaDiffView } from './diff-view'

export interface DraftEditorProps {
  personaId: string
  initialDraft: Persona
  /** IDs that have ever appeared in any published version (slug-locked + tag-for-removal eligible). */
  publishedIds: { keyClauses: string[]; riskAreas: string[] }
}

interface FieldErrors {
  description?: string
  keyClauses?: Record<string, string>
  riskAreas?: Record<string, string>
  general?: string
}

const MAX_DESCRIPTION = 8_000

function hydrate(
  rows: Array<{ id: string; label: string; hint?: string }>,
  publishedSet: Set<string>,
): EditableRow[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    hint: r.hint ?? '',
    published: publishedSet.has(r.id),
    removed: false,
    isNew: !publishedSet.has(r.id),
  }))
}

function dehydrate(rows: EditableRow[]): Array<{ id: string; label: string; hint?: string }> {
  return rows
    .filter((r) => !r.removed)
    .map((r) => {
      const out: { id: string; label: string; hint?: string } = {
        id: r.id.trim(),
        label: r.label,
      }
      if (r.hint && r.hint.trim() !== '') out.hint = r.hint.trim()
      return out
    })
}

export function PersonaDraftEditor({ personaId, initialDraft, publishedIds }: DraftEditorProps) {
  const router = useRouter()
  const publishedKey = useMemo(() => new Set(publishedIds.keyClauses), [publishedIds.keyClauses])
  const publishedRisk = useMemo(() => new Set(publishedIds.riskAreas), [publishedIds.riskAreas])

  const [description, setDescription] = useState(initialDraft.description)
  const [keyClauses, setKeyClauses] = useState<EditableRow[]>(() =>
    hydrate(initialDraft.keyClauses, publishedKey),
  )
  const [riskAreas, setRiskAreas] = useState<EditableRow[]>(() =>
    hydrate(initialDraft.riskAreas, publishedRisk),
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [dirty, setDirty] = useState(false)
  const [saving, startSaving] = useTransition()

  // Track dirty state on changes (skip first run / mount).
  // Using a ref + effect that reads (not writes) state on the trigger fields
  // avoids react-hooks/set-state-in-effect cascading-render warning.
  const mounted = useRef(false)
  const lastSnapshot = useRef<string>('')
  useEffect(() => {
    const snapshot = JSON.stringify({ description, keyClauses, riskAreas })
    if (!mounted.current) {
      mounted.current = true
      lastSnapshot.current = snapshot
      return
    }
    if (snapshot !== lastSnapshot.current) {
      lastSnapshot.current = snapshot
      setDirty(true)
    }
  }, [description, keyClauses, riskAreas])

  function buildPatch(): Partial<Persona> {
    return {
      id: personaId,
      description,
      keyClauses: dehydrate(keyClauses),
      riskAreas: dehydrate(riskAreas),
    }
  }

  async function save(): Promise<boolean> {
    const patch = buildPatch()
    const res = await fetch(`/api/admin/personas/${personaId}/draft`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      setErrors({})
      setDirty(false)
      return true
    }
    if (res.status === 422) {
      const body = await res.json().catch(() => ({}))
      const flat = body?.detail?.fieldErrors as Record<string, string[]> | undefined
      const next: FieldErrors = {}
      if (flat) {
        for (const [path, msgs] of Object.entries(flat)) {
          if (path.startsWith('description')) next.description = msgs[0]
          else if (path.startsWith('keyClauses')) {
            next.keyClauses ??= {}
            next.keyClauses[path] = msgs[0]
          } else if (path.startsWith('riskAreas')) {
            next.riskAreas ??= {}
            next.riskAreas[path] = msgs[0]
          } else {
            next.general = msgs[0]
          }
        }
      } else {
        next.general = 'Validation failed'
      }
      setErrors(next)
      toast.error('Validation failed', { description: next.general ?? 'See highlighted rows.' })
      return false
    }
    const body = await res.json().catch(() => ({}))
    toast.error('Save failed', { description: body.error ?? `HTTP ${res.status}` })
    return false
  }

  function handleSaveClick() {
    startSaving(async () => {
      const ok = await save()
      if (ok) toast.success('Draft saved')
    })
  }

  // Autosave description on blur (debounced 1s).
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleDescriptionBlur() {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => {
      if (dirty) startSaving(() => save().then(() => undefined))
    }, 1_000)
  }

  // -- Discard ---------------------------------------------------------------
  const [discardOpen, setDiscardOpen] = useState(false)
  const [discarding, startDiscarding] = useTransition()
  function handleDiscard() {
    startDiscarding(async () => {
      const res = await fetch(`/api/admin/personas/${personaId}/draft`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error('Discard failed', { description: body.error ?? `HTTP ${res.status}` })
        return
      }
      toast.success('Draft discarded')
      router.push(`/admin/personas/${personaId}`)
    })
  }

  // -- Preview ---------------------------------------------------------------
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<{ prompt: string; promptHash: string } | null>(null)
  async function handlePreview() {
    setPreviewBusy(true)
    setPreviewOpen(true)
    setPreview(null)
    try {
      // Save first so preview reflects current edits.
      if (dirty) {
        const ok = await save()
        if (!ok) {
          setPreviewBusy(false)
          setPreviewOpen(false)
          return
        }
      }
      const res = await fetch(`/api/admin/personas/${personaId}/draft/preview`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error('Preview failed', { description: body.error ?? `HTTP ${res.status}` })
        setPreviewOpen(false)
        return
      }
      const body = (await res.json()) as { prompt: string; promptHash: string }
      setPreview(body)
    } finally {
      setPreviewBusy(false)
    }
  }

  // -- Publish ---------------------------------------------------------------
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishDiff, setPublishDiff] = useState<PersonaDiff | null>(null)
  const [publishCanProceed, setPublishCanProceed] = useState(false)

  async function openPublishModal() {
    setPublishOpen(true)
    setPublishBusy(true)
    setPublishDiff(null)
    setPublishCanProceed(false)
    try {
      // Save first so the diff reflects the current edits.
      if (dirty) {
        const ok = await save()
        if (!ok) {
          setPublishOpen(false)
          return
        }
      }
      // The diff endpoint accepts numeric refs or "draft" (not "current") —
      // resolve the current version number first.
      const diff = await loadDiffFromCurrent()
      if (!diff) {
        toast.error('Could not load diff vs current')
        setPublishOpen(false)
        return
      }
      setPublishDiff(diff)
      setPublishCanProceed(true)
    } finally {
      setPublishBusy(false)
    }
  }

  async function loadDiffFromCurrent(): Promise<PersonaDiff | null> {
    // The API expects a numeric `from`. Look up the current published version.
    const cur = await fetch(`/api/admin/personas/${personaId}`).then((r) => r.json())
    const versionNumber = cur?.version?.version_number
    if (!versionNumber) return null
    const res = await fetch(
      `/api/admin/personas/${personaId}/diff?from=${versionNumber}&to=draft`,
    )
    if (!res.ok) return null
    const body = (await res.json()) as { diff: PersonaDiff }
    return body.diff
  }

  async function confirmPublish() {
    setPublishBusy(true)
    try {
      const res = await fetch(`/api/admin/personas/${personaId}/draft/publish`, {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Published new version')
        router.push(`/admin/personas/${personaId}`)
        router.refresh()
        return
      }
      if (res.status === 422) {
        const body = await res.json().catch(() => ({}))
        toast.error('Publish validation failed', {
          description: typeof body.detail === 'string' ? body.detail : 'See highlighted rows.',
        })
        setPublishOpen(false)
        return
      }
      const body = await res.json().catch(() => ({}))
      toast.error('Publish failed', { description: body.error ?? `HTTP ${res.status}` })
    } finally {
      setPublishBusy(false)
    }
  }

  const descCount = description.length
  const descOver = descCount > MAX_DESCRIPTION

  return (
    <div className="space-y-6">
      {/* Description */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h2>
          <span className={`text-xs ${descOver ? 'text-destructive' : 'text-muted-foreground'}`}>
            {descCount.toLocaleString()} / {MAX_DESCRIPTION.toLocaleString()}
          </span>
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          rows={16}
          className="font-mono text-sm"
          aria-label="Persona description"
        />
        {errors.description ? (
          <p className="mt-2 text-xs text-destructive">{errors.description}</p>
        ) : null}
      </section>

      <EnumerationEditor
        kind="keyClause"
        rows={keyClauses}
        onChange={setKeyClauses}
        errors={errors.keyClauses}
      />
      <EnumerationEditor
        kind="riskArea"
        rows={riskAreas}
        onChange={setRiskAreas}
        errors={errors.riskAreas}
      />

      {errors.general ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errors.general}
        </div>
      ) : null}

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <span className="mr-auto text-xs text-muted-foreground">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <Button variant="outline" onClick={handleSaveClick} disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>
        <Button variant="outline" onClick={() => setDiscardOpen(true)}>
          Discard draft
        </Button>
        <Button variant="outline" onClick={handlePreview} disabled={previewBusy}>
          Preview compiled prompt
        </Button>
        <Button onClick={openPublishModal} disabled={publishBusy}>
          Publish new version
        </Button>
      </div>

      {/* Discard modal */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard draft?</DialogTitle>
            <DialogDescription>
              All unpublished changes will be lost. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={discarding}>
              {discarding ? 'Discarding…' : 'Discard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish modal */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Publish new version</DialogTitle>
            <DialogDescription>
              Review the diff against the current published version before publishing. The new version is immutable.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {publishBusy && !publishDiff ? (
              <p className="text-sm text-muted-foreground">Loading diff…</p>
            ) : publishDiff ? (
              <PersonaDiffView diff={publishDiff} />
            ) : (
              <p className="text-sm text-muted-foreground">No diff available.</p>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmPublish}
              disabled={!publishCanProceed || publishBusy}
            >
              {publishBusy ? 'Publishing…' : 'Confirm publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview side panel */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full max-w-3xl">
          <SheetHeader>
            <SheetTitle>Compiled prompt preview</SheetTitle>
            <SheetDescription>
              Rendered against a sample contract using the current draft persona.
              {preview ? (
                <span className="ml-2 font-mono text-xs">hash {preview.promptHash.slice(0, 12)}…</span>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 h-[80vh] overflow-auto rounded-md border border-border bg-muted/40 p-4">
            {previewBusy ? (
              <p className="text-sm text-muted-foreground">Compiling…</p>
            ) : preview ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {preview.prompt}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No preview loaded.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
