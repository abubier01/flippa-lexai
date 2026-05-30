// Integration tests for analysis_runs RLS — spec tests #9, #22.
//
// Asserts:
//   * SELECT mirrors contracts ownership (owner sees, other tenant does not).
//   * Authenticated users cannot INSERT / UPDATE / DELETE under any column path.
//   * No non-SELECT policies and no INSERT/UPDATE/DELETE grants for non-service roles.

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from '../helpers/supabase-int'

// Seed values for an analysis_runs row that satisfies the NOT NULL provenance columns.
async function seedRunForContract(opts: {
  contractId: string
  personaVersionId: string
  personaHash: string
}) {
  const admin = makeServiceRoleClient()
  const { data, error } = await admin
    .from('analysis_runs')
    .insert({
      contract_id: opts.contractId,
      status: 'completed',
      is_current: true,
      output: { summary: 'seed', risk_score: 10, risks: [], clauses: [], suggestions: [] },
      persona_id: 'procurement',
      persona_version_id: opts.personaVersionId,
      persona_hash: opts.personaHash,
      core_version: 'test',
      model_id: 'test-model',
      model_params: { temperature: 0.2 },
      prompt_hash: 'deadbeef',
      context_hash: null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed run failed: ${error.message}`)
  return data!.id as string
}

describe('analysis_runs RLS (spec tests #9, #22)', () => {
  const cleanup: string[] = []
  let userA: Awaited<ReturnType<typeof createTestUser>>
  let userB: Awaited<ReturnType<typeof createTestUser>>
  let contractA: string
  let runA: string
  let personaVersionId: string
  let personaHash: string

  beforeAll(async () => {
    userA = await createTestUser()
    cleanup.push(userA.id)
    userB = await createTestUser()
    cleanup.push(userB.id)

    const admin = makeServiceRoleClient()

    // Resolve seeded persona v1 for FK + persona_hash invariant.
    const { data: pv } = await admin
      .from('persona_versions')
      .select('id, content_hash')
      .eq('persona_id', 'procurement')
      .eq('version_number', 1)
      .single()
    personaVersionId = pv!.id as string
    personaHash = pv!.content_hash as string

    const { data: c } = await admin
      .from('contracts')
      .insert({
        user_id: userA.id,
        title: 'RLS test contract',
        file_name: 'rls.txt',
        raw_text: 'hello',
        status: 'completed',
      })
      .select('id')
      .single()
    contractA = c!.id as string

    runA = await seedRunForContract({ contractId: contractA, personaVersionId, personaHash })
  })

  afterAll(async () => {
    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  it('owner can SELECT, other user cannot', async () => {
    const aRead = await userA.userScopedClient.from('analysis_runs').select('id').eq('id', runA)
    expect(aRead.error).toBeNull()
    expect(aRead.data?.length).toBe(1)

    const bRead = await userB.userScopedClient.from('analysis_runs').select('id').eq('id', runA)
    // RLS filters silently — empty array, not an error.
    expect(bRead.error).toBeNull()
    expect(bRead.data?.length ?? 0).toBe(0)
  })

  it('authenticated users cannot INSERT into analysis_runs', async () => {
    const ins = await userA.userScopedClient.from('analysis_runs').insert({
      contract_id: contractA,
      status: 'running',
      persona_id: 'procurement',
      persona_version_id: personaVersionId,
      persona_hash: personaHash,
      core_version: 'test',
      model_id: 'test',
      model_params: {},
      prompt_hash: 'x',
    })
    expect(ins.error).not.toBeNull()
  })

  it('authenticated users cannot UPDATE is_current / output / diagnostics', async () => {
    const updCurrent = await userA.userScopedClient
      .from('analysis_runs')
      .update({ is_current: false })
      .eq('id', runA)
    expect(updCurrent.error || (((updCurrent.data ?? []) as unknown[]).length) === 0).toBeTruthy()

    const updOutput = await userA.userScopedClient
      .from('analysis_runs')
      .update({ output: { tampered: true } })
      .eq('id', runA)
    expect(updOutput.error || (((updOutput.data ?? []) as unknown[]).length) === 0).toBeTruthy()

    const updDiag = await userA.userScopedClient
      .from('analysis_runs')
      .update({ diagnostics: [{ code: 'TAMPER' }] })
      .eq('id', runA)
    expect(updDiag.error || (((updDiag.data ?? []) as unknown[]).length) === 0).toBeTruthy()

    // Confirm row is still intact via admin.
    const admin = makeServiceRoleClient()
    const { data } = await admin
      .from('analysis_runs')
      .select('is_current, output, diagnostics')
      .eq('id', runA)
      .single()
    expect(data!.is_current).toBe(true)
    expect((data!.output as { summary?: string } | null)?.summary).toBe('seed')
    expect(Array.isArray(data!.diagnostics) ? (data!.diagnostics as unknown[]).length : -1).toBe(0)
  })

  it('authenticated users cannot DELETE', async () => {
    const del = await userA.userScopedClient.from('analysis_runs').delete().eq('id', runA)
    expect(del.error || (((del.data ?? []) as unknown[]).length) === 0).toBeTruthy()

    const admin = makeServiceRoleClient()
    const { data } = await admin.from('analysis_runs').select('id').eq('id', runA).maybeSingle()
    expect(data?.id).toBe(runA)
  })

  // SQL-level invariants ("no non-SELECT policies on analysis_runs", "no
  // INSERT/UPDATE/DELETE grants outside service_role/postgres") cannot be
  // queried through PostgREST and belong in a CI SQL gate (plan P8.4 / spec
  // test #22), not this JS-client suite. The behavioral coverage above
  // (every write path errors or no-ops) is the JS-side counterpart.
})
