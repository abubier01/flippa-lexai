// Integration test for codex CRITICAL fix #2 — contract lifecycle sync.
//
// Drives both terminal transitions and asserts contracts.{status,risk_score}
// stay in lockstep with analysis_runs:
//   * Successful run → contracts.status='completed', risk_score = output.risk_score
//   * Failed run     → contracts.status='failed'
//
// Both transitions go through SECURITY DEFINER RPCs from scripts/021 so the
// pair is atomic (no half-completed states).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  makeServiceRoleClient,
} from './helpers/supabase-int'
import { promoteToCurrent, insertRun, failRun } from '@/lib/analysis/repo'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'

describe('contract lifecycle sync (codex CRITICAL fix #2)', () => {
  const cleanup: string[] = []
  let user: Awaited<ReturnType<typeof createTestUser>>
  let personaVersionId: string

  beforeAll(async () => {
    user = await createTestUser()
    cleanup.push(user.id)

    const svc = makeServiceRoleClient()
    const { data: pv, error } = await svc
      .from('persona_versions')
      .select('id, content_hash')
      .eq('persona_id', 'procurement')
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single()
    if (error || !pv) throw new Error(`could not load persona version: ${error?.message}`)
    personaVersionId = pv.id as string
  })

  afterAll(async () => {
    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  async function seedContract(): Promise<string> {
    const svc = makeServiceRoleClient()
    const { data, error } = await svc
      .from('contracts')
      .insert({
        user_id: user.id,
        title: 'lifecycle-test',
        file_name: 'test.txt',
        raw_text: 'placeholder',
        status: 'pending',
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`contract insert failed: ${error?.message}`)
    return data.id as string
  }

  async function cleanupContract(contractId: string) {
    const svc = makeServiceRoleClient()
    await svc.from('contracts').update({ current_run_id: null }).eq('id', contractId)
    await svc.from('analysis_runs').delete().eq('contract_id', contractId)
    await svc.from('contracts').delete().eq('id', contractId)
  }

  it('promote_analysis_run flips contracts.status to completed and writes risk_score', async () => {
    const contractId = await seedContract()
    try {
      const svc = makeServiceRoleClient()
      const run = await insertRun(svc, {
        contract_id: contractId,
        user_context: null,
        persona_id: 'procurement',
        persona_version_id: personaVersionId,
        persona_hash: 'h',
        core_version: 'v1',
        model_id: 'm',
        model_params: {},
        prompt_hash: 'p',
        context_hash: null,
      })

      const output = { risk_score: 42 } as unknown as AnalysisOutput
      await promoteToCurrent(svc, run.id, output)

      const { data: contract } = await svc
        .from('contracts')
        .select('status, risk_score, current_run_id')
        .eq('id', contractId)
        .single()
      expect(contract!.status).toBe('completed')
      expect(contract!.risk_score).toBe(42)
      expect(contract!.current_run_id).toBe(run.id)
    } finally {
      await cleanupContract(contractId)
    }
  })

  it('fail_analysis_run flips contracts.status to failed and appends diagnostic', async () => {
    const contractId = await seedContract()
    try {
      const svc = makeServiceRoleClient()
      const run = await insertRun(svc, {
        contract_id: contractId,
        user_context: null,
        persona_id: 'procurement',
        persona_version_id: personaVersionId,
        persona_hash: 'h',
        core_version: 'v1',
        model_id: 'm',
        model_params: {},
        prompt_hash: 'p',
        context_hash: null,
      })

      await failRun(svc, run.id, { code: 'MODEL_ERROR', detail: 'boom' })

      const { data: contract } = await svc
        .from('contracts')
        .select('status')
        .eq('id', contractId)
        .single()
      expect(contract!.status).toBe('failed')

      const { data: runRow } = await svc
        .from('analysis_runs')
        .select('status, diagnostics, completed_at')
        .eq('id', run.id)
        .single()
      expect(runRow!.status).toBe('failed')
      expect(runRow!.completed_at).not.toBeNull()
      const diags = runRow!.diagnostics as Array<{ code: string }>
      expect(diags.some(d => d.code === 'MODEL_ERROR')).toBe(true)
    } finally {
      await cleanupContract(contractId)
    }
  })

  it('parallel promote_analysis_run calls keep exactly one current row + synced pointer', async () => {
    const contractId = await seedContract()
    try {
      const svc = makeServiceRoleClient()
      const runA = await insertRun(svc, {
        contract_id: contractId,
        user_context: null,
        persona_id: 'procurement',
        persona_version_id: personaVersionId,
        persona_hash: 'h',
        core_version: 'v1',
        model_id: 'm',
        model_params: {},
        prompt_hash: 'p-a',
        context_hash: null,
      })
      await svc.from('analysis_runs').update({ status: 'completed' }).eq('id', runA.id)

      const runB = await insertRun(svc, {
        contract_id: contractId,
        user_context: null,
        persona_id: 'procurement',
        persona_version_id: personaVersionId,
        persona_hash: 'h',
        core_version: 'v1',
        model_id: 'm',
        model_params: {},
        prompt_hash: 'p-b',
        context_hash: null,
      })
      await svc.from('analysis_runs').update({ status: 'completed' }).eq('id', runB.id)

      await Promise.all([
        promoteToCurrent(svc, runA.id, { risk_score: 41 } as unknown as AnalysisOutput),
        promoteToCurrent(svc, runB.id, { risk_score: 82 } as unknown as AnalysisOutput),
      ])

      const { data: currentRows } = await svc
        .from('analysis_runs')
        .select('id')
        .eq('contract_id', contractId)
        .eq('is_current', true)
      expect((currentRows ?? []).length).toBe(1)
      const currentId = currentRows?.[0]?.id as string

      const { data: contract } = await svc
        .from('contracts')
        .select('current_run_id')
        .eq('id', contractId)
        .single()
      expect(contract?.current_run_id).toBe(currentId)
    } finally {
      await cleanupContract(contractId)
    }
  })
})
