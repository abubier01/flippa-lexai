// Integration test for spec test #13 — "Removed IDs still resolve on historical runs".
//
// Flow:
//   1. Snapshot persona v1 (must contain termination key clause).
//   2. Seed an analysis_runs row referencing v1 with a clauses[] entry whose
//      key_clause_id = 'termination'.
//   3. Create a draft via repo, remove termination, publish via publishDraft
//      → v2 created with renumbered version_number = 2.
//   4. loadPersonaVersion(v1) still returns termination with its v1 label.
//   5. Seed a fresh run referencing v2 with no termination clause.
//   6. v1 historical run untouched: persona_version_id still v1; v1 content
//      still resolves termination.
//
// Verifies that removing a key-clause ID is non-breaking for historical runs
// and that loadPersonaVersion is the safe read for historical persona resolution.

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from './helpers/supabase-int'
import {
  loadCurrentPersonaVersion,
  loadPersonaVersion,
  createDraft,
  updateDraft,
  publishDraft,
} from '@/lib/persona/repo'

const BOOTSTRAP_ADMIN = '8a652f73-1f2d-407b-bf18-32a3ddd1b979'

describe('persona version history — historical runs resolve removed IDs (spec #13)', () => {
  const cleanup: string[] = []
  let userA: Awaited<ReturnType<typeof createTestUser>>
  let contractId: string
  let v1Id: string
  let v1Hash: string
  let v1RunId: string

  beforeAll(async () => {
    userA = await createTestUser()
    cleanup.push(userA.id)

    const svc = makeServiceRoleClient()

    // Reset to a known state in case a prior failed run left stale rows.
    // First pull whichever persona_versions row is version 1 published; reset
    // pointer to it, then nuke everything else.
    const { data: v1Row } = await svc
      .from('persona_versions')
      .select('id')
      .eq('persona_id', 'procurement')
      .eq('version_number', 1)
      .eq('status', 'published')
      .single()
    if (v1Row) {
      await svc.from('personas').update({ current_version_id: v1Row.id }).eq('id', 'procurement')
      // Find stale (non-v1) versions, delete any analysis_runs referencing
      // them, then drop the versions themselves.
      const { data: stale } = await svc
        .from('persona_versions')
        .select('id')
        .eq('persona_id', 'procurement')
        .neq('id', v1Row.id)
      const staleIds = (stale ?? []).map((r) => r.id as string)
      if (staleIds.length > 0) {
        await svc.from('analysis_runs').delete().in('persona_version_id', staleIds)
        await svc.from('persona_versions').delete().in('id', staleIds)
      }
    }

    const v1 = await loadCurrentPersonaVersion(svc, 'procurement')
    v1Id = v1.id
    v1Hash = v1.content_hash
    expect(v1.content.keyClauses.some((c) => c.id === 'termination')).toBe(true)

    const { data: c, error: cErr } = await svc
      .from('contracts')
      .insert({
        user_id: userA.id,
        title: 'history test',
        file_name: 'h.txt',
        raw_text: 'Termination shall require 30 days notice.',
        status: 'completed',
      })
      .select('id')
      .single()
    if (cErr) throw new Error(cErr.message)
    contractId = c!.id as string

    const { data: run, error: runErr } = await svc
      .from('analysis_runs')
      .insert({
        contract_id: contractId,
        status: 'completed',
        is_current: true,
        output: {
          summary: 'v1 analysis',
          risk_score: 30,
          risks: [],
          clauses: [
            {
              key_clause_id: 'termination',
              presence: { status: 'present', quoted_text: 'Termination shall require 30 days notice.' },
            },
          ],
          suggestions: [],
        },
        persona_id: 'procurement',
        persona_version_id: v1Id,
        persona_hash: v1Hash,
        core_version: 'test',
        model_id: 'test',
        model_params: { temperature: 0.2 },
        prompt_hash: 'h1',
      })
      .select('id')
      .single()
    if (runErr) throw new Error(runErr.message)
    v1RunId = run!.id as string
  })

  afterAll(async () => {
    const svc = makeServiceRoleClient()

    // Reset pointer first so the v>1 rows can be deleted (personas FK).
    await svc
      .from('personas')
      .update({ current_version_id: v1Id })
      .eq('id', 'procurement')

    // Drop any analysis_runs created by this suite, then the v>1 persona_versions.
    if (contractId) {
      await svc.from('analysis_runs').delete().eq('contract_id', contractId)
      await svc.from('contracts').delete().eq('id', contractId)
    }
    const { data: stale } = await svc
      .from('persona_versions')
      .select('id')
      .eq('persona_id', 'procurement')
      .neq('id', v1Id)
    const staleIds = (stale ?? []).map((r) => r.id as string)
    if (staleIds.length > 0) {
      await svc.from('analysis_runs').delete().in('persona_version_id', staleIds)
      await svc.from('persona_versions').delete().in('id', staleIds)
    }

    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  it('creates v2 without termination via publishDraft', async () => {
    const svc = makeServiceRoleClient()

    const draft = await createDraft(svc, 'procurement', BOOTSTRAP_ADMIN)
    expect(draft.status).toBe('draft')

    const withoutTermination = draft.content.keyClauses.filter((c) => c.id !== 'termination')
    const updated = await updateDraft(
      svc,
      'procurement',
      { keyClauses: withoutTermination },
      BOOTSTRAP_ADMIN,
    )
    expect(updated.content.keyClauses.some((c) => c.id === 'termination')).toBe(false)

    const v2 = await publishDraft(svc, 'procurement', BOOTSTRAP_ADMIN)
    expect(v2.status).toBe('published')
    expect(v2.version_number).toBe(2)
    expect(v2.content.keyClauses.some((c) => c.id === 'termination')).toBe(false)

    const current = await loadCurrentPersonaVersion(svc, 'procurement')
    expect(current.id).toBe(v2.id)
  })

  it('loadPersonaVersion(v1) still resolves termination with its v1 label', async () => {
    const svc = makeServiceRoleClient()
    const v1 = await loadPersonaVersion(svc, v1Id)
    const term = v1.content.keyClauses.find((c) => c.id === 'termination')
    expect(term).toBeDefined()
    expect(term!.label).toBe('Termination')
  })

  it('historical v1 run still points at v1 and its output still references termination', async () => {
    const svc = makeServiceRoleClient()
    const { data: run } = await svc
      .from('analysis_runs')
      .select('persona_version_id, output')
      .eq('id', v1RunId)
      .single()

    expect(run!.persona_version_id).toBe(v1Id)
    const output = run!.output as { clauses: Array<{ key_clause_id: string }> }
    expect(output.clauses.some((c) => c.key_clause_id === 'termination')).toBe(true)
  })

  it('a new run against v2 succeeds with no termination clause entry', async () => {
    const svc = makeServiceRoleClient()
    const v2 = await loadCurrentPersonaVersion(svc, 'procurement')

    // Insert a second run referencing v2; demote the v1 row first to satisfy
    // the partial unique index (the analyze route uses promoteToCurrent, which
    // handles this; we replicate manually here for the data-layer test).
    await svc.from('analysis_runs').update({ is_current: false }).eq('id', v1RunId)

    const { data: r2, error } = await svc
      .from('analysis_runs')
      .insert({
        contract_id: contractId,
        status: 'completed',
        is_current: true,
        output: { summary: 'v2 analysis', risk_score: 20, risks: [], clauses: [], suggestions: [] },
        persona_id: 'procurement',
        persona_version_id: v2.id,
        persona_hash: v2.content_hash,
        core_version: 'test',
        model_id: 'test',
        model_params: { temperature: 0.2 },
        prompt_hash: 'h2',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(r2?.id).toBeDefined()

    // v1 run is untouched in terms of which version it references.
    const { data: oldRun } = await svc
      .from('analysis_runs')
      .select('persona_version_id')
      .eq('id', v1RunId)
      .single()
    expect(oldRun!.persona_version_id).toBe(v1Id)
  })
})
