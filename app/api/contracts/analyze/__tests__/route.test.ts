// Unit tests for POST /api/contracts/analyze (Tier 1 rewrite).
//
// Spec test coverage: #5 (ANALYSIS_ENABLED), #6a/b (CONTRACT_EMPTY/TOO_LONG),
// #7 (OUTPUT_SCHEMA_FAIL with persona-derived enum violation), #10a
// (PUBLISH_ERROR), #10b (MODEL_ERROR), #11 (prompt_hash on insertRun),
// #17 (GROUNDING_FAIL), #18 (whitespace + smart-quote tolerance in grounding),
// #19 (per-user rate limit), #21 (latency_ms always populated),
// invariant #11 (model_params deep-equals frozen MODEL_PARAMS).
//
// Model call is mocked at lib/llm/structured boundary — no Groq traffic.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  callStructuredMock,
  insertRunMock,
  updateTelemetryMock,
  failRunMock,
  promoteMock,
  loadPersonaMock,
  checkRateLimitMock,
  ModelCallErrorCls,
  SchemaGenerationErrorCls,
  CONTRACT_TEXT,
  PERSONA_CONTENT,
  PERSONA_HASH,
  // Capture what insertRun saw, for invariant inspection.
  insertedRows,
  telemetryRows,
} = vi.hoisted(() => {
  const insertedRows: unknown[] = []
  const telemetryRows: unknown[] = []
  const insertRunMock = vi.fn(async (_client: unknown, row: unknown) => {
    insertedRows.push(row)
    return { id: 'run-1' }
  })
  const updateTelemetryMock = vi.fn(async (_c: unknown, _id: string, t: unknown) => {
    telemetryRows.push(t)
  })
  const failRunMock = vi.fn(async () => undefined)
  const promoteMock = vi.fn(async () => undefined)
  const callStructuredMock = vi.fn()

  class ModelCallErrorCls extends Error {
    constructor(
      public cause: unknown,
      public partialUsage?: { input_tokens: number; output_tokens: number },
    ) {
      super(cause instanceof Error ? cause.message : String(cause))
      this.name = 'ModelCallError'
    }
  }
  class SchemaGenerationErrorCls extends Error {
    constructor(
      public cause: unknown,
      public partialUsage?: { input_tokens: number; output_tokens: number },
    ) {
      super(cause instanceof Error ? cause.message : String(cause))
      this.name = 'SchemaGenerationError'
    }
  }

  // Persona must satisfy PersonaSchema. Single key clause + risk area to make
  // the enum lists tiny and the OUTPUT_SCHEMA_FAIL test trivially reproducible.
  const PERSONA_CONTENT = {
    id: 'procurement',
    description:
      'Buyer-side procurement counsel. Test persona used by route.test.ts to keep enum surfaces minimal.',
    keyClauses: [{ id: 'termination', label: 'Termination' }],
    riskAreas: [{ id: 'unfavorable_termination', label: 'Unfavorable Termination' }],
  }
  // Pre-computed hash matching canonicalSerializePersona of PERSONA_CONTENT.
  // We let the real compile() compute it and stash the result on first call.
  const PERSONA_HASH = '__will_be_set_by_loadPersonaMock__'

  const loadPersonaMock = vi.fn()
  const checkRateLimitMock = vi.fn(async () => ({ allowed: true as const }))

  const CONTRACT_TEXT =
    'This contract may be terminated by either party for convenience upon thirty (30) days written notice to the other party.'

  return {
    callStructuredMock,
    insertRunMock,
    updateTelemetryMock,
    failRunMock,
    promoteMock,
    loadPersonaMock,
    checkRateLimitMock,
    ModelCallErrorCls,
    SchemaGenerationErrorCls,
    CONTRACT_TEXT,
    PERSONA_CONTENT,
    PERSONA_HASH,
    insertedRows,
    telemetryRows,
  }
})

vi.mock('@/lib/llm/structured', () => ({
  callStructured: callStructuredMock,
  ModelCallError: ModelCallErrorCls,
  SchemaGenerationError: SchemaGenerationErrorCls,
  computeCostMicros: (u: { input_tokens: number; output_tokens: number }) =>
    Math.round(u.input_tokens * 0.59 + u.output_tokens * 0.79),
}))

vi.mock('@/lib/analysis/repo', () => ({
  insertRun: insertRunMock,
  updateRunTelemetry: updateTelemetryMock,
  failRun: failRunMock,
  promoteToCurrent: promoteMock,
}))

vi.mock('@/lib/persona/repo', () => ({
  loadCurrentPersonaVersion: loadPersonaMock,
}))

vi.mock('@/lib/security/rate-limit-multi', () => ({
  consumeRateLimitMultiScope: checkRateLimitMock,
}))

// User-auth supabase client (createClient) — only used for auth.getUser + the
// contract row load. Service client (getServiceClient) is used for the
// profiles row + repo writes; we mock just enough for profiles.
let currentContract: Record<string, unknown> | null = {
  id: 'contract-1',
  user_id: 'user-1',
  raw_text: CONTRACT_TEXT,
  status: 'pending',
}
let currentPromotedContract: Record<string, unknown> | null = {
  current_run_id: 'run-1',
  risk_score: 30,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({
        data: currentContract,
        error: currentContract ? null : { message: 'not found' },
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role-core', () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: { team_id: null, plan: 'solo' },
            error: null,
          })),
        }
      }
      if (table === 'contracts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({
            data: currentPromotedContract,
            error: currentPromotedContract ? null : { message: 'not found' },
          })),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      }
    }),
  })),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import route + helpers AFTER mocks
// ---------------------------------------------------------------------------
import { POST } from '../route'
import { MODEL_PARAMS } from '@/lib/prompt/model-config'
import { canonicalSerializePersona } from '@/lib/prompt/compile'
import crypto from 'node:crypto'

const realPersonaHash = crypto
  .createHash('sha256')
  .update(canonicalSerializePersona(PERSONA_CONTENT), 'utf8')
  .digest('hex')

function buildRequest(body: Record<string, unknown> = { contractId: 'contract-1' }): NextRequest {
  return new NextRequest('http://localhost/api/contracts/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

type AnyOutput = {
  summary: string
  risk_score: number
  risks: Array<Record<string, unknown>>
  clauses: Array<Record<string, unknown>>
  suggestions: string[]
}
function validModelOutput(): AnyOutput {
  // Quoted text must be a verbatim substring of CONTRACT_TEXT for grounding.
  return {
    summary: 'Test summary covering termination terms.',
    risk_score: 30,
    risks: [
      {
        risk_area_id: 'unfavorable_termination',
        severity: 'medium',
        title: 'Termination-for-convenience asymmetry',
        description: 'Either party may terminate at will, which is risky for the buyer.',
        evidence: {
          type: 'quoted',
          clause_reference: 'Termination clause',
          quoted_text:
            'This contract may be terminated by either party for convenience upon thirty (30) days written notice',
        },
      },
    ],
    clauses: [
      {
        key_clause_id: 'termination',
        presence: {
          status: 'present',
          quoted_text:
            'This contract may be terminated by either party for convenience upon thirty (30) days written notice',
        },
      },
    ],
    suggestions: ['Negotiate a longer notice period.'],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  insertedRows.length = 0
  telemetryRows.length = 0
  currentContract = {
    id: 'contract-1',
    user_id: 'user-1',
    raw_text: CONTRACT_TEXT,
    status: 'pending',
  }
  currentPromotedContract = {
    current_run_id: 'run-1',
    risk_score: 30,
  }
  loadPersonaMock.mockResolvedValue({
    id: 'pv-1',
    persona_id: 'procurement',
    version_number: 1,
    status: 'published',
    content: PERSONA_CONTENT,
    content_hash: realPersonaHash,
    notes: null,
    created_at: new Date().toISOString(),
    created_by: 'u',
    published_at: new Date().toISOString(),
    published_by: 'u',
  })
  callStructuredMock.mockResolvedValue({
    output: validModelOutput(),
    usage: { input_tokens: 100, output_tokens: 200 },
  })
  checkRateLimitMock.mockResolvedValue({ allowed: true })
  delete process.env.ANALYSIS_ENABLED
})

// ---------------------------------------------------------------------------
// Spec test #5 — ANALYSIS_ENABLED=false
// ---------------------------------------------------------------------------
describe('spec test #5 — ANALYSIS_ENABLED feature flag', () => {
  it('returns 503 and skips DB + model when ANALYSIS_ENABLED=false', async () => {
    process.env.ANALYSIS_ENABLED = 'false'
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body).toEqual({ status: 'unavailable', reason: 'analysis_disabled' })
    expect(callStructuredMock).not.toHaveBeenCalled()
    expect(insertRunMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Spec test #6 — contract validation
// ---------------------------------------------------------------------------
describe('spec test #6 — contract validation', () => {
  it('returns 400 CONTRACT_EMPTY when raw_text is blank, no model call', async () => {
    currentContract = { ...currentContract!, raw_text: '   ' }
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('CONTRACT_EMPTY')
    expect(callStructuredMock).not.toHaveBeenCalled()
    expect(insertRunMock).not.toHaveBeenCalled()
  })

  it('returns 400 CONTRACT_TOO_LONG when text exceeds budget, no model call', async () => {
    // 4 chars per estimated token; MAX_CONTRACT_TOKENS = 100_000; need > 400k chars.
    currentContract = { ...currentContract!, raw_text: 'a'.repeat(400_001) }
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('CONTRACT_TOO_LONG')
    expect(callStructuredMock).not.toHaveBeenCalled()
    expect(insertRunMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Spec test #7 — OUTPUT_SCHEMA_FAIL (made-up enum)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// CRITICAL — owner-only write gate (codex review finding)
//
// Team members can SELECT a shared contract via scripts/010_*.sql RLS, but
// must NOT be able to trigger an analysis that overwrites the owner's
// current_run_id with their own userContext.
// ---------------------------------------------------------------------------
describe('owner-only write gate (codex review)', () => {
  it('returns 403 analyze_readonly when caller is not the contract owner', async () => {
    currentContract = { ...currentContract!, user_id: 'someone-else' }
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.kind).toBe('analyze_readonly')
    expect(insertRunMock).not.toHaveBeenCalled()
    expect(callStructuredMock).not.toHaveBeenCalled()
  })
})

describe('spec test #7 — OUTPUT_SCHEMA_FAIL', () => {
  it('returns 422 + records OUTPUT_SCHEMA_FAIL diagnostic for unknown risk_area_id', async () => {
    const bad = validModelOutput()
    bad.risks[0].risk_area_id = 'made_up_area' // not in persona.riskAreas
    callStructuredMock.mockResolvedValueOnce({
      output: bad,
      usage: { input_tokens: 50, output_tokens: 30 },
    })
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('OUTPUT_SCHEMA_FAIL')
    expect(insertRunMock).toHaveBeenCalledTimes(1)
    expect(failRunMock).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ code: 'OUTPUT_SCHEMA_FAIL' }),
    )
  })
})

// ---------------------------------------------------------------------------
// Spec test #10 — failure paths
// ---------------------------------------------------------------------------
describe('spec test #10 — failure paths', () => {
  it('10a: promoteToCurrent throw → 500 PUBLISH_ERROR (not MODEL_ERROR)', async () => {
    promoteMock.mockRejectedValueOnce(new Error('unique_violation retry exhausted'))
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.code).toBe('PUBLISH_ERROR')
    expect(failRunMock).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ code: 'PUBLISH_ERROR' }),
    )
  })

  it('10b: callStructured throws ModelCallError → 502 MODEL_ERROR', async () => {
    callStructuredMock.mockRejectedValueOnce(
      new ModelCallErrorCls(new Error('groq 503'), { input_tokens: 10, output_tokens: 0 }),
    )
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(502)
    expect(body.code).toBe('MODEL_ERROR')
    expect(failRunMock).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ code: 'MODEL_ERROR' }),
    )
  })

  it('10d: insertRun conflict → 409 ANALYSIS_ALREADY_RUNNING', async () => {
    insertRunMock.mockRejectedValueOnce({ code: 'conflict' })
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(res.headers.get('Retry-After')).toBe('3')
    expect(body.code).toBe('ANALYSIS_ALREADY_RUNNING')
    expect(callStructuredMock).not.toHaveBeenCalled()
  })

  it('10e: post-promote verification mismatch → 500 PUBLISH_ERROR', async () => {
    currentPromotedContract = { current_run_id: 'someone-else', risk_score: 99 }
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.code).toBe('PUBLISH_ERROR')
  })

  it('10c: callStructured throws SchemaGenerationError → 422 OUTPUT_SCHEMA_FAIL (codex MAJOR fix #4)', async () => {
    callStructuredMock.mockRejectedValueOnce(
      new SchemaGenerationErrorCls(new Error('no object generated'), {
        input_tokens: 100,
        output_tokens: 50,
      }),
    )
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('OUTPUT_SCHEMA_FAIL')
    expect(failRunMock).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ code: 'OUTPUT_SCHEMA_FAIL' }),
    )
    // Partial usage must still be persisted via updateRunTelemetry.
    expect(updateTelemetryMock).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ input_tokens: 100, output_tokens: 50 }),
    )
  })
})

// ---------------------------------------------------------------------------
// Spec test #11 + Invariant #11 — provenance baseline on insertRun
// ---------------------------------------------------------------------------
describe('spec test #11 + invariant #11 — insertRun provenance', () => {
  it('inserts run row with prompt_hash, persona_hash, and frozen MODEL_PARAMS BEFORE model call', async () => {
    // Hold the model call until we've inspected the insertRun row.
    let resolveModel!: (v: unknown) => void
    callStructuredMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveModel = resolve
        }),
    )
    const promise = POST(buildRequest())
    // Allow microtasks for insertRun to fire.
    await new Promise((r) => setImmediate(r))
    expect(insertRunMock).toHaveBeenCalledTimes(1)
    const row = insertedRows[0] as Record<string, unknown>
    expect(typeof row.prompt_hash).toBe('string')
    expect((row.prompt_hash as string).length).toBe(64)
    expect(row.persona_hash).toBe(realPersonaHash)
    // Invariant #11 — model_params deep-equals MODEL_PARAMS verbatim.
    expect(row.model_params).toEqual(MODEL_PARAMS)
    // Resolve so the route can finish.
    resolveModel({
      output: validModelOutput(),
      usage: { input_tokens: 100, output_tokens: 200 },
    })
    await promise
  })
})

// ---------------------------------------------------------------------------
// Spec test #17 — GROUNDING_FAIL
// ---------------------------------------------------------------------------
describe('spec test #17 — GROUNDING_FAIL', () => {
  it('returns 422 with failures when quoted_text is not in the contract', async () => {
    const bad = validModelOutput()
    bad.risks[0].evidence = {
      type: 'quoted',
      clause_reference: 'made up',
      quoted_text: 'this exact sentence is definitely not in the contract at all',
    }
    bad.clauses[0].presence = { status: 'absent' }
    callStructuredMock.mockResolvedValueOnce({
      output: bad,
      usage: { input_tokens: 10, output_tokens: 10 },
    })
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('GROUNDING_FAIL')
    expect(Array.isArray(body.failures)).toBe(true)
    expect(body.failures.length).toBeGreaterThan(0)
    expect(failRunMock).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ code: 'GROUNDING_FAIL' }),
    )
  })
})

// ---------------------------------------------------------------------------
// Spec test #18 — whitespace + smart-quote tolerant grounding
// ---------------------------------------------------------------------------
describe('spec test #18 — grounding tolerates whitespace and smart quotes', () => {
  it('returns 200 when quoted_text differs only in whitespace/smart quotes', async () => {
    const out = validModelOutput()
    // Add smart quotes + extra whitespace; normalize() in grounding.ts folds these.
    out.risks[0].evidence = {
      type: 'quoted',
      clause_reference: 'Termination clause',
      quoted_text:
        '  This contract  may be terminated by either party for convenience upon thirty (30) days written notice  ',
    }
    out.clauses[0].presence = {
      status: 'present',
      quoted_text:
        '“This contract may be terminated by either party for convenience upon thirty (30) days written notice”',
    }
    callStructuredMock.mockResolvedValueOnce({
      output: out,
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.analysis_run_id).toBe('run-1')
    expect(promoteMock).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Spec test #19 — per-user rate limit
// ---------------------------------------------------------------------------
describe('spec test #19 — per-user rate limit', () => {
  it('returns 429 with Retry-After + RATE_LIMITED code when checkRateLimit rejects', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false as unknown as true, // discriminated union — tests need union shape
      scope: 'user',
      retryAfterSeconds: 42,
    } as never)
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(body.code).toBe('RATE_LIMITED')
    expect(body.scope).toBe('user')
    expect(body.retry_after_seconds).toBe(42)
    expect(insertRunMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Spec test #21 — telemetry on every outcome
// ---------------------------------------------------------------------------
describe('spec test #21 — telemetry written on every outcome', () => {
  it('happy path: all 4 telemetry columns populated', async () => {
    await POST(buildRequest())
    expect(updateTelemetryMock).toHaveBeenCalledTimes(1)
    const t = telemetryRows[0] as Record<string, unknown>
    expect(t.latency_ms).toEqual(expect.any(Number))
    expect(t.input_tokens).toBe(100)
    expect(t.output_tokens).toBe(200)
    expect(t.cost_usd_micros).toEqual(expect.any(Number))
  })

  it('MODEL_ERROR path: latency_ms still populated; tokens null when no partial usage', async () => {
    callStructuredMock.mockRejectedValueOnce(new ModelCallErrorCls(new Error('boom')))
    await POST(buildRequest())
    expect(updateTelemetryMock).toHaveBeenCalledTimes(1)
    const t = telemetryRows[0] as Record<string, unknown>
    expect(t.latency_ms).toEqual(expect.any(Number))
    expect(t.input_tokens).toBeNull()
    expect(t.output_tokens).toBeNull()
    expect(t.cost_usd_micros).toBeNull()
  })

  it('OUTPUT_SCHEMA_FAIL path: telemetry populated from usage', async () => {
    const bad = validModelOutput()
    bad.risks[0].risk_area_id = 'made_up'
    callStructuredMock.mockResolvedValueOnce({
      output: bad,
      usage: { input_tokens: 50, output_tokens: 30 },
    })
    await POST(buildRequest())
    const t = telemetryRows[0] as Record<string, unknown>
    expect(t.latency_ms).toEqual(expect.any(Number))
    expect(t.input_tokens).toBe(50)
    expect(t.output_tokens).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// PERSONA_INVALID — covers the spec § persona re-validation hook + Sentry tag
// ---------------------------------------------------------------------------
describe('PERSONA_INVALID — re-validation guard at request time', () => {
  it('returns 500 PERSONA_INVALID when persona content fails PersonaSchema', async () => {
    loadPersonaMock.mockResolvedValueOnce({
      id: 'pv-1',
      persona_id: 'procurement',
      version_number: 1,
      status: 'published',
      // Missing keyClauses — fails PersonaSchema.
      content: {
        id: 'procurement',
        description: 'No clauses',
        riskAreas: [{ id: 'r', label: 'R' }],
      },
      content_hash: 'whatever',
      notes: null,
      created_at: '',
      created_by: 'u',
      published_at: '',
      published_by: 'u',
    })
    const res = await POST(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.code).toBe('PERSONA_INVALID')
    expect(callStructuredMock).not.toHaveBeenCalled()
    expect(insertRunMock).not.toHaveBeenCalled()
  })
})
