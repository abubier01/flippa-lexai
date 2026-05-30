// Integration test for codex CRITICAL fix #3 — analysis_runs CASCADE on
// contract delete.
//
// Pre-fix: analysis_runs.contract_id had no ON DELETE clause; deleting a
// contract with any run rows raised 23503 FK violation → 500.
// Post-fix (scripts/022): analysis_runs cascade with the contract, and
// contracts.current_run_id → analysis_runs(id) uses ON DELETE SET NULL so
// the circular FK can't deadlock the delete.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  makeServiceRoleClient,
} from './helpers/supabase-int'

describe('contract delete cascade (codex CRITICAL fix #3)', () => {
  const cleanup: string[] = []
  let user: Awaited<ReturnType<typeof createTestUser>>
  let personaVersionId: string

  beforeAll(async () => {
    user = await createTestUser()
    cleanup.push(user.id)

    const svc = makeServiceRoleClient()
    const { data: pv, error } = await svc
      .from('persona_versions')
      .select('id')
      .eq('persona_id', 'procurement')
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single()
    if (error || !pv) throw new Error(`persona load failed: ${error?.message}`)
    personaVersionId = pv.id as string
  })

  afterAll(async () => {
    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  it('deleting a contract cascades to its analysis_runs (success + failed)', async () => {
    const svc = makeServiceRoleClient()

    const { data: contract, error: cErr } = await svc
      .from('contracts')
      .insert({
        user_id: user.id,
        title: 'cascade-test',
        file_name: 't.txt',
        raw_text: 'x',
        status: 'pending',
      })
      .select('id')
      .single()
    if (cErr || !contract) throw new Error(`contract insert failed: ${cErr?.message}`)
    const contractId = contract.id as string

    const runFields = {
      contract_id: contractId,
      persona_id: 'procurement',
      persona_version_id: personaVersionId,
      persona_hash: 'h',
      core_version: 'v1',
      model_id: 'm',
      model_params: {},
      prompt_hash: 'p',
      diagnostics: [],
    }
    const { data: runs, error: rErr } = await svc
      .from('analysis_runs')
      .insert([
        { ...runFields, status: 'completed', is_current: true, output: { risk_score: 10 } },
        { ...runFields, status: 'failed', is_current: false },
      ])
      .select('id')
    if (rErr || !runs) throw new Error(`runs insert failed: ${rErr?.message}`)
    expect(runs).toHaveLength(2)

    // Point contracts.current_run_id at the completed run to exercise the
    // ON DELETE SET NULL side of the circular FK.
    await svc.from('contracts').update({ current_run_id: runs[0]!.id }).eq('id', contractId)

    // DELETE the contract directly — no need for the route to test the FK.
    const { error: dErr } = await svc.from('contracts').delete().eq('id', contractId)
    expect(dErr).toBeNull()

    // Both analysis_runs rows should be gone.
    const { data: leftovers, error: lErr } = await svc
      .from('analysis_runs')
      .select('id')
      .in('id', runs.map(r => r.id as string))
    expect(lErr).toBeNull()
    expect(leftovers).toEqual([])

    // Contract is gone.
    const { data: leftContract } = await svc
      .from('contracts')
      .select('id')
      .eq('id', contractId)
      .maybeSingle()
    expect(leftContract).toBeNull()
  })
})
