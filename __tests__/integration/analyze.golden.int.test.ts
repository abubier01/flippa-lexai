// Integration test for spec test #24 — Golden contract fixture.
//
// Drives POST /api/contracts/analyze end-to-end against the local Supabase,
// with the model call (`callStructured`) and the cookie-based user client
// stubbed. Verifies:
//   * 200 response shape
//   * Output deep-equals fixture
//   * analysis_runs row provenance + telemetry + is_current
//   * contracts.current_run_id pointer flip
//   * Grounding passes cleanly (no GROUNDING_FAIL diagnostic)
//
// This is the cutover canary: any persona, schema, or compile-pipeline change
// that affects this output forces an intentional fixture update in the same PR.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import {
  createTestUser,
  deleteTestUser,
  makeServiceRoleClient,
} from './helpers/supabase-int'

vi.mock('server-only', () => ({}))

// Load fixtures up front (top-level so vi.hoisted has access).
const MSA_TEXT = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/golden/msa.txt'),
  'utf8',
)
const EXPECTED_OUTPUT = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../fixtures/golden/expected.json'),
    'utf8',
  ),
)

// ---------------------------------------------------------------------------
// Mocks: callStructured (returns the fixture output) and the cookie-based
// user-auth client (returns a stub backed by the test user + service role).
// ---------------------------------------------------------------------------

const { callStructuredMock, userClientHolder } = vi.hoisted(() => ({
  callStructuredMock: vi.fn(),
  userClientHolder: { client: null as unknown },
}))

vi.mock('@/lib/llm/structured', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm/structured')>(
    '@/lib/llm/structured',
  )
  return {
    ...actual,
    callStructured: callStructuredMock,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => userClientHolder.client),
}))

// ---------------------------------------------------------------------------
// Setup: env vars for service client + test user + contract.
// ---------------------------------------------------------------------------

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.INT_SUPABASE_URL || 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.INT_SUPABASE_SERVICE_ROLE_KEY!

// Rate limiter writes to Upstash — skip by stubbing the module.
vi.mock('@/lib/rate-limits', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}))

describe('golden contract fixture — spec test #24', () => {
  const cleanup: string[] = []
  let user: Awaited<ReturnType<typeof createTestUser>>
  let contractId: string

  beforeAll(async () => {
    user = await createTestUser()
    cleanup.push(user.id)
    userClientHolder.client = user.userScopedClient

    const svc = makeServiceRoleClient()
    const { data, error } = await svc
      .from('contracts')
      .insert({
        user_id: user.id,
        title: 'golden MSA',
        file_name: 'msa.txt',
        raw_text: MSA_TEXT,
        status: 'pending',
      })
      .select('id')
      .single()
    if (error) throw new Error(`contract insert failed: ${error.message}`)
    contractId = data!.id as string

    callStructuredMock.mockResolvedValue({
      output: EXPECTED_OUTPUT,
      usage: { input_tokens: 4000, output_tokens: 800 },
    })
  })

  afterAll(async () => {
    const svc = makeServiceRoleClient()
    if (contractId) {
      // Clear contracts.current_run_id pointer before deleting runs.
      await svc.from('contracts').update({ current_run_id: null }).eq('id', contractId)
      await svc.from('analysis_runs').delete().eq('contract_id', contractId)
      await svc.from('contracts').delete().eq('id', contractId)
    }
    while (cleanup.length) {
      await deleteTestUser(cleanup.pop()!).catch(() => {})
    }
  })

  it('end-to-end: 200, output matches fixture, provenance + telemetry persisted', async () => {
    // Import the route AFTER mocks are wired.
    const { POST } = await import('@/app/api/contracts/analyze/route')
    const { MODEL_PARAMS, computeCostMicros } = await import(
      '@/lib/prompt/model-config'
    )

    const req = new NextRequest('http://localhost/api/contracts/analyze', {
      method: 'POST',
      body: JSON.stringify({ contractId }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.analysis_run_id).toEqual(expect.any(String))
    expect(body.analyzed_at).toEqual(expect.any(String))
    expect(body.diagnostic_warnings).toEqual([])
    expect(body.output).toEqual(EXPECTED_OUTPUT)

    // ----- DB-level assertions ------------------------------------------------
    const svc = makeServiceRoleClient()
    const { data: runs, error: runsErr } = await svc
      .from('analysis_runs')
      .select('*')
      .eq('contract_id', contractId)
    expect(runsErr).toBeNull()
    expect(runs).toHaveLength(1)
    const run = runs![0]

    expect(run.is_current).toBe(true)
    expect(run.status).toBe('completed')
    expect(run.output).toEqual(EXPECTED_OUTPUT)

    // Telemetry: all 4 columns populated and matching the mock usage.
    expect(run.latency_ms).toEqual(expect.any(Number))
    expect(run.input_tokens).toBe(4000)
    expect(run.output_tokens).toBe(800)
    expect(run.cost_usd_micros).toBe(
      computeCostMicros({ input_tokens: 4000, output_tokens: 800 }),
    )

    // Provenance: all columns populated and consistent with persona row.
    expect(run.persona_id).toBe('procurement')
    expect(typeof run.persona_version_id).toBe('string')
    expect(typeof run.persona_hash).toBe('string')
    expect(run.persona_hash.length).toBe(64)
    expect(typeof run.core_version).toBe('string')
    expect(run.core_version.length).toBeGreaterThan(0)
    expect(run.model_id).toBe('llama-3.3-70b-versatile')
    expect(run.model_params).toEqual(MODEL_PARAMS)
    expect(typeof run.prompt_hash).toBe('string')
    expect(run.prompt_hash.length).toBe(64)

    const { data: pv } = await svc
      .from('persona_versions')
      .select('content_hash')
      .eq('id', run.persona_version_id)
      .single()
    expect(run.persona_hash).toBe(pv!.content_hash)

    // No GROUNDING_FAIL diagnostic (or any other) on the happy path.
    const diagnostics = (run.diagnostics as Array<{ code: string }>) ?? []
    expect(diagnostics.find((d) => d.code === 'GROUNDING_FAIL')).toBeUndefined()

    // contracts.{current_run_id, status, risk_score} synced on success
    // (codex CRITICAL fix #2 — lifecycle sync).
    const { data: contract } = await svc
      .from('contracts')
      .select('current_run_id, status, risk_score')
      .eq('id', contractId)
      .single()
    expect(contract!.current_run_id).toBe(run.id)
    expect(contract!.status).toBe('completed')
    expect(contract!.risk_score).toBe((EXPECTED_OUTPUT as { risk_score: number }).risk_score)
  })
})
