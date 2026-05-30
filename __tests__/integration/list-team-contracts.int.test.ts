// Integration test for lib/contracts/read.ts::listTeamContractsWithRuns.
//
// Verifies the bulk read for the team dashboard:
//   - returns shared contracts joined to their current analysis_runs row,
//   - run.output carries the structured AnalysisOutput shape,
//   - contracts without a current_run_id surface as run: null,
//   - non-shared contracts and other teams' contracts are excluded.

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from './helpers/supabase-int'
import { listTeamContractsWithRuns } from '@/lib/contracts/read'
import { loadCurrentPersonaVersion } from '@/lib/persona/repo'

describe('listTeamContractsWithRuns (team dashboard bulk read)', () => {
  const cleanupUsers: string[] = []
  const cleanupContracts: string[] = []
  const cleanupTeams: string[] = []
  let teamId: string
  let otherTeamId: string
  let owner: Awaited<ReturnType<typeof createTestUser>>
  let sharedAnalyzedId: string
  let sharedUnanalyzedId: string
  let unsharedId: string
  let otherTeamContractId: string

  beforeAll(async () => {
    const svc = makeServiceRoleClient()
    owner = await createTestUser()
    cleanupUsers.push(owner.id)

    // Two teams owned by this user (owner_id) — exercising the team_id filter.
    const teamA = await svc
      .from('teams')
      .insert({ name: `int-team-${randomUUID()}`, owner_id: owner.id })
      .select('id')
      .single()
    if (teamA.error) throw new Error(teamA.error.message)
    teamId = teamA.data!.id as string
    cleanupTeams.push(teamId)

    const teamB = await svc
      .from('teams')
      .insert({ name: `int-team-${randomUUID()}`, owner_id: owner.id })
      .select('id')
      .single()
    if (teamB.error) throw new Error(teamB.error.message)
    otherTeamId = teamB.data!.id as string
    cleanupTeams.push(otherTeamId)

    // Persona version we can attach to the seeded run.
    const persona = await loadCurrentPersonaVersion(svc, 'procurement')

    // Three contracts on teamA + one on teamB. Helper inserts and registers cleanup.
    const insertContract = async (params: {
      team_id: string | null
      shared: boolean
      withRun: boolean
    }) => {
      const ins = await svc
        .from('contracts')
        .insert({
          user_id: owner.id,
          title: `t-${randomUUID().slice(0, 8)}`,
          file_name: 't.txt',
          raw_text: 'sample',
          status: 'completed',
          team_id: params.team_id,
          shared_with_team: params.shared,
        })
        .select('id')
        .single()
      if (ins.error) throw new Error(ins.error.message)
      const id = ins.data!.id as string
      cleanupContracts.push(id)

      if (params.withRun) {
        const runIns = await svc
          .from('analysis_runs')
          .insert({
            contract_id: id,
            status: 'completed',
            is_current: true,
            output: {
              summary: 'seeded summary',
              risk_score: 42,
              risks: [
                {
                  risk_area_id: persona.content.riskAreas[0].id,
                  severity: 'high',
                  title: 'r',
                  description: 'd',
                  evidence: { type: 'absence', missing_concept: 'no liability cap defined' },
                },
              ],
              clauses: [],
              suggestions: [],
            },
            persona_id: 'procurement',
            persona_version_id: persona.id,
            persona_hash: persona.content_hash,
            core_version: 'test',
            model_id: 'test',
            model_params: {},
            prompt_hash: 'h',
          })
          .select('id')
          .single()
        if (runIns.error) throw new Error(runIns.error.message)
        const runId = runIns.data!.id as string
        // Wire contracts.current_run_id to the run we just created.
        const upd = await svc
          .from('contracts')
          .update({ current_run_id: runId })
          .eq('id', id)
        if (upd.error) throw new Error(upd.error.message)
      }
      return id
    }

    sharedAnalyzedId = await insertContract({ team_id: teamId, shared: true, withRun: true })
    sharedUnanalyzedId = await insertContract({ team_id: teamId, shared: true, withRun: false })
    unsharedId = await insertContract({ team_id: teamId, shared: false, withRun: true })
    otherTeamContractId = await insertContract({ team_id: otherTeamId, shared: true, withRun: true })
  })

  afterAll(async () => {
    const svc = makeServiceRoleClient()
    // Unwire current_run_id so analysis_runs can be deleted without FK conflict.
    if (cleanupContracts.length > 0) {
      await svc.from('contracts').update({ current_run_id: null }).in('id', cleanupContracts)
      await svc.from('analysis_runs').delete().in('contract_id', cleanupContracts)
      await svc.from('contracts').delete().in('id', cleanupContracts)
    }
    if (cleanupTeams.length > 0) {
      await svc.from('teams').delete().in('id', cleanupTeams)
    }
    while (cleanupUsers.length) {
      await deleteTestUser(cleanupUsers.pop()!).catch(() => {})
    }
  })

  it('returns only shared contracts for the requested team', async () => {
    const svc = makeServiceRoleClient()
    const rows = await listTeamContractsWithRuns(teamId, svc)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(sharedAnalyzedId)
    expect(ids).toContain(sharedUnanalyzedId)
    expect(ids).not.toContain(unsharedId)
    expect(ids).not.toContain(otherTeamContractId)
  })

  it('joins analysis_runs.output for contracts with a current run', async () => {
    const svc = makeServiceRoleClient()
    const rows = await listTeamContractsWithRuns(teamId, svc)
    const analyzed = rows.find((r) => r.id === sharedAnalyzedId)
    expect(analyzed).toBeDefined()
    expect(analyzed!.run).not.toBeNull()
    expect(analyzed!.run!.output?.summary).toBe('seeded summary')
    expect(analyzed!.run!.output?.risk_score).toBe(42)
    expect(analyzed!.run!.output?.risks[0]?.severity).toBe('high')
  })

  it('returns run: null for contracts that have not been analyzed yet', async () => {
    const svc = makeServiceRoleClient()
    const rows = await listTeamContractsWithRuns(teamId, svc)
    const unanalyzed = rows.find((r) => r.id === sharedUnanalyzedId)
    expect(unanalyzed).toBeDefined()
    expect(unanalyzed!.run).toBeNull()
  })
})
