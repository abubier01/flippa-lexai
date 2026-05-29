// app/api/contracts/analyze/route.ts
//
// Tier 1 modular contract analysis — Phase 4 route rewrite.
// Spec § Part 3 (Route-handler integration) is canonical.
//
// Step order — DO NOT REORDER:
//   1. ANALYSIS_ENABLED feature flag
//   2. Auth
//   3. Rate-limit (per-user / per-tenant / per-tenant-daily)
//   4. Body parse
//   5. validateAndScrub(userContext)
//   6. Load contract (user-auth client, RLS-gated)
//   7. CONTRACT_EMPTY
//   8. CONTRACT_TOO_LONG
//   9. Load current persona version (+ PersonaSchema re-validate)
//  10. buildOutputSchema(persona)
//  11. compile(...)
//  12. personaHash equality assertion
//  13. insertRun(...) — provenance baseline
//  14. callStructured(...) — model call
//  15. updateRunTelemetry(...) — ALWAYS, even on failure (latency_ms)
//  16. ModelCallError → failRun(MODEL_ERROR) → 502
//  17. OutputSchema.safeParse → failRun(OUTPUT_SCHEMA_FAIL) → 422
//  18. verifyGrounding → failRun(GROUNDING_FAIL) → 422
//  19. promoteToCurrent → failRun(PUBLISH_ERROR) → 500
//  20. 200 { analysis_run_id, analyzed_at, output, diagnostic_warnings: [] }

import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { logger } from '@/lib/log/request'
import { logRejection } from '@/lib/log/rejection'
import { checkRateLimit } from '@/lib/rate-limits'
import { validateAndScrub, UserContextError } from '@/lib/prompt/user-context'
import { compile } from '@/lib/prompt/compile'
import { buildOutputSchema } from '@/lib/prompt/output-schema'
import { CORE_VERSION } from '@/lib/prompt/core'
import { MODEL_ID, MODEL_PARAMS, MAX_CONTRACT_TOKENS, computeCostMicros } from '@/lib/prompt/model-config'
import { PersonaSchema } from '@/lib/prompt/persona-types'
import { loadCurrentPersonaVersion } from '@/lib/persona/repo'
import { insertRun, updateRunTelemetry, failRun, promoteToCurrent } from '@/lib/analysis/repo'
import { callStructured, ModelCallError } from '@/lib/llm/structured'
import { verifyGrounding } from '@/lib/grounding'

const PERSONA_ID = 'procurement'

// Loose token estimator — Groq does not expose a tokenizer. 4 chars/token is a
// safe overestimate for English contracts; we only use this to enforce the
// MAX_CONTRACT_TOKENS ceiling, not for billing.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function POST(req: NextRequest) {
  const rlog = logger(req, 'contracts.analyze')

  // ---- Step 1: feature flag --------------------------------------------------
  if (process.env.ANALYSIS_ENABLED === 'false') {
    return NextResponse.json(
      { status: 'unavailable', reason: 'analysis_disabled' },
      { status: 503 },
    )
  }

  // ---- Step 2: auth ----------------------------------------------------------
  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ status: 'rejected', code: 'UNAUTHENTICATED' }, { status: 401 })
  }
  const userId = user.id
  const ulog = rlog.child({ userId })

  const service = getServiceClient()

  // Resolve tenantId + tier from the user's profile. Solo plan → tenantId = userId.
  const { data: profile } = await service
    .from('profiles')
    .select('team_id, plan')
    .eq('id', userId)
    .maybeSingle()
  const tenantId = (profile?.team_id as string | null | undefined) ?? userId
  const tier = ((profile?.plan as string | undefined) ?? 'solo') as
    | 'solo'
    | 'team'
    | 'pro'

  // ---- Step 3: rate limit ----------------------------------------------------
  const rl = await checkRateLimit(userId, tenantId, tier)
  if (!rl.allowed) {
    logRejection(ulog, {
      code: 'RATE_LIMITED',
      userId,
      tenantId,
      scope: rl.scope,
      retryAfterSeconds: rl.retryAfterSeconds,
    })
    return NextResponse.json(
      {
        status: 'rejected',
        code: 'RATE_LIMITED',
        scope: rl.scope,
        retry_after_seconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      },
    )
  }

  // ---- Step 4: body parse ----------------------------------------------------
  let body: { contractId?: string; userContext?: unknown }
  try {
    body = (await req.json()) as { contractId?: string; userContext?: unknown }
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const contractId = body.contractId
  if (!contractId) {
    return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
  }

  // ---- Step 5: validateAndScrub(userContext) --------------------------------
  let userContext: string | undefined
  if (body.userContext !== undefined && body.userContext !== null && body.userContext !== '') {
    try {
      userContext = validateAndScrub(body.userContext)
    } catch (err) {
      if (err instanceof UserContextError) {
        logRejection(ulog, {
          code: err.code,
          userId,
          contractId,
          rawLength: typeof body.userContext === 'string' ? body.userContext.length : undefined,
        })
        return NextResponse.json({ status: 'rejected', code: err.code }, { status: 400 })
      }
      throw err
    }
  }

  // ---- Step 6: load contract (user-auth client, RLS-gated) ------------------
  const { data: contract, error: contractErr } = await userClient
    .from('contracts')
    .select('id, raw_text, user_id, status')
    .eq('id', contractId)
    .single()
  if (contractErr || !contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }
  const contractText: string = typeof contract.raw_text === 'string' ? contract.raw_text : ''

  // ---- Step 7: CONTRACT_EMPTY ------------------------------------------------
  if (contractText.trim().length === 0) {
    logRejection(ulog, { code: 'CONTRACT_EMPTY', userId, contractId })
    return NextResponse.json({ status: 'rejected', code: 'CONTRACT_EMPTY' }, { status: 400 })
  }

  // ---- Step 8: CONTRACT_TOO_LONG --------------------------------------------
  const estimatedTokens = estimateTokens(contractText)
  if (estimatedTokens > MAX_CONTRACT_TOKENS) {
    logRejection(ulog, {
      code: 'CONTRACT_TOO_LONG',
      userId,
      contractId,
      tokens: estimatedTokens,
    })
    return NextResponse.json(
      { status: 'rejected', code: 'CONTRACT_TOO_LONG' },
      { status: 400 },
    )
  }

  // ---- Step 9: load persona + re-validate -----------------------------------
  const personaVersion = await loadCurrentPersonaVersion(service, PERSONA_ID)
  const personaParsed = PersonaSchema.safeParse(personaVersion.content)
  if (!personaParsed.success) {
    ulog.error('persona_invalid', {
      event: 'persona_invalid',
      persona_id: PERSONA_ID,
      persona_version_id: personaVersion.id,
      issues: personaParsed.error.flatten(),
    })
    Sentry.captureMessage('persona_invalid', {
      level: 'error',
      tags: { event: 'persona_invalid', persona_version_id: personaVersion.id },
      extra: { issues: JSON.stringify(personaParsed.error.issues).slice(0, 2000) },
    })
    return NextResponse.json(
      { status: 'rejected', code: 'PERSONA_INVALID' },
      { status: 500 },
    )
  }
  const persona = personaParsed.data

  // ---- Step 10–12: build schema, compile, hash assertion --------------------
  const { OutputSchema, OUTPUT_SCHEMA_JSON } = buildOutputSchema(persona)
  const { prompt, promptHash, contextHash, personaHash } = compile({
    persona,
    contractText,
    userContext,
  })
  if (personaHash !== personaVersion.content_hash) {
    // Server-side logic error — the persona we just loaded should hash to
    // the content_hash row we read. Surface loudly.
    throw new Error(
      `persona_hash drift: compile=${personaHash} db=${personaVersion.content_hash}`,
    )
  }

  // ---- Step 13: insertRun (provenance baseline) -----------------------------
  const run = await insertRun(service, {
    contract_id: contractId,
    user_context: userContext ?? null,
    persona_id: PERSONA_ID,
    persona_version_id: personaVersion.id,
    persona_hash: personaHash,
    core_version: CORE_VERSION,
    model_id: MODEL_ID,
    // Invariant #11: MODEL_PARAMS is the frozen const — no mutation, no spread.
    model_params: MODEL_PARAMS as unknown as Record<string, unknown>,
    prompt_hash: promptHash,
    context_hash: contextHash,
  })

  // ---- Step 14: callStructured ----------------------------------------------
  const t0 = performance.now()
  let modelOutput: unknown
  let usage: { input_tokens: number; output_tokens: number } | undefined
  let modelError: ModelCallError | null = null
  try {
    const result = await callStructured({
      prompt,
      jsonSchema: OUTPUT_SCHEMA_JSON,
      modelParams: MODEL_PARAMS,
    })
    modelOutput = result.output
    usage = result.usage
  } catch (err) {
    if (err instanceof ModelCallError) {
      modelError = err
      usage = err.partialUsage
    } else {
      throw err
    }
  }
  const latencyMs = Math.round(performance.now() - t0)

  // ---- Step 15: telemetry FIRST regardless of outcome -----------------------
  await updateRunTelemetry(service, run.id, {
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    cost_usd_micros: usage ? computeCostMicros(usage) : null,
    latency_ms: latencyMs,
  })

  // ---- Step 16: MODEL_ERROR --------------------------------------------------
  if (modelError) {
    await failRun(service, run.id, { code: 'MODEL_ERROR', detail: modelError.message })
    ulog.error('analyze.model_error', {
      event: 'analyze.model_error',
      run_id: run.id,
      contractId,
      err: modelError,
    })
    return NextResponse.json(
      { status: 'failed', code: 'MODEL_ERROR', analysis_run_id: run.id },
      { status: 502 },
    )
  }

  // ---- Step 17: OUTPUT_SCHEMA_FAIL ------------------------------------------
  const parsed = OutputSchema.safeParse(modelOutput)
  if (!parsed.success) {
    await failRun(service, run.id, {
      code: 'OUTPUT_SCHEMA_FAIL',
      detail: parsed.error.flatten(),
    })
    return NextResponse.json(
      {
        status: 'failed',
        code: 'OUTPUT_SCHEMA_FAIL',
        analysis_run_id: run.id,
        issues: parsed.error.flatten(),
      },
      { status: 422 },
    )
  }

  // ---- Step 18: GROUNDING_FAIL ----------------------------------------------
  const failures = verifyGrounding(parsed.data, contractText)
  if (failures.length > 0) {
    await failRun(service, run.id, { code: 'GROUNDING_FAIL', failures })
    return NextResponse.json(
      {
        status: 'failed',
        code: 'GROUNDING_FAIL',
        analysis_run_id: run.id,
        failures,
      },
      { status: 422 },
    )
  }

  // ---- Step 19: promote ------------------------------------------------------
  try {
    await promoteToCurrent(service, run.id, parsed.data)
  } catch (err) {
    await failRun(service, run.id, {
      code: 'PUBLISH_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    })
    ulog.error('analyze.publish_error', {
      event: 'analyze.publish_error',
      run_id: run.id,
      contractId,
      err,
    })
    return NextResponse.json(
      { status: 'failed', code: 'PUBLISH_ERROR', analysis_run_id: run.id },
      { status: 500 },
    )
  }

  // ---- Step 20: success ------------------------------------------------------
  return NextResponse.json({
    analysis_run_id: run.id,
    analyzed_at: new Date().toISOString(),
    output: parsed.data,
    diagnostic_warnings: [],
  })
}
