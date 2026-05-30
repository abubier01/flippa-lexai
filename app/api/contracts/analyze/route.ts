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
import { consumeRateLimitMultiScope } from '@/lib/security/rate-limit-multi'
import { rejected, failed, success } from '@/lib/api/responses'
import { validateAndScrub, UserContextError } from '@/lib/prompt/user-context'
import { compile } from '@/lib/prompt/compile'
import { buildOutputSchema } from '@/lib/prompt/output-schema'
import { CORE_VERSION } from '@/lib/prompt/core'
import { MODEL_ID, MODEL_PARAMS, MAX_CONTRACT_TOKENS, computeCostMicros } from '@/lib/prompt/model-config'
import { PersonaSchema } from '@/lib/prompt/persona-types'
import { loadCurrentPersonaVersion } from '@/lib/persona/repo'
import {
  insertRun,
  updateRunTelemetry,
  failRun,
  promoteToCurrent,
} from '@/lib/analysis/repo'
import { callStructured, ModelCallError, SchemaGenerationError } from '@/lib/llm/structured'
import { verifyGrounding } from '@/lib/grounding'
import { getActivePlan } from '@/lib/plan/access'

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
    return rejected('UNAUTHENTICATED', 401)
  }
  const userId = user.id
  const ulog = rlog.child({ userId })

  const service = getServiceClient()

  // tenantId comes from the user's profile; tier resolves through getActivePlan
  // (which now caches per-userId, so this is cheap on hot paths).
  const { data: profile } = await service
    .from('profiles')
    .select('team_id')
    .eq('id', userId)
    .maybeSingle()
  const tenantId = (profile?.team_id as string | null | undefined) ?? userId
  let tier: 'solo' | 'team' | 'pro' = 'solo'
  try {
    const active = await getActivePlan(userId)
    tier = (active.tier ?? 'solo') as 'solo' | 'team' | 'pro'
  } catch (err) {
    ulog.warn('analyze.plan_lookup_failed_fallback_solo', { err })
  }

  // ---- Step 3: rate limit ----------------------------------------------------
  const rl = await consumeRateLimitMultiScope({ userId, tenantId, tier })
  if (!rl.allowed) {
    logRejection(ulog, {
      code: 'RATE_LIMITED',
      userId,
      tenantId,
      scope: rl.scope,
      retryAfterSeconds: rl.retryAfterSeconds,
    })
    return rejected(
      'RATE_LIMITED',
      429,
      { scope: rl.scope, retry_after_seconds: rl.retryAfterSeconds },
      { headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
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
        return rejected(err.code, 400)
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

  // ---- Step 6b: OWNER-ONLY write gate ---------------------------------------
  // RLS lets team members SELECT a shared contract (scripts/010_*.sql); without
  // this check, a team viewer could trigger a new analysis and overwrite the
  // owner's current_run_id with their own userContext. Mirrors the owner-gate
  // pattern in app/api/contracts/chat/route.ts. Tier 1 has no collaborator-write
  // model — writes are strictly owner-only.
  if (contract.user_id !== userId) {
    return NextResponse.json(
      {
        error: 'Analyze is owner-only for shared team contracts. Ask the contract owner to run analysis.',
        kind: 'analyze_readonly',
      },
      { status: 403 },
    )
  }

  const contractText: string = typeof contract.raw_text === 'string' ? contract.raw_text : ''

  // ---- Step 7: CONTRACT_EMPTY ------------------------------------------------
  if (contractText.trim().length === 0) {
    logRejection(ulog, { code: 'CONTRACT_EMPTY', userId, contractId })
    return rejected('CONTRACT_EMPTY', 400)
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
    return rejected('CONTRACT_TOO_LONG', 400)
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
    return rejected('PERSONA_INVALID', 500)
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
  let run: { id: string }
  try {
    run = await insertRun(service, {
      contract_id: contractId,
      user_context: userContext ?? null,
      persona_id: PERSONA_ID,
      persona_version_id: personaVersion.id,
      persona_hash: personaHash,
      core_version: CORE_VERSION,
      model_id: MODEL_ID,
      model_params: MODEL_PARAMS,
      prompt_hash: promptHash,
      context_hash: contextHash,
    })
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'conflict') {
      return rejected(
        'ANALYSIS_ALREADY_RUNNING',
        409,
        { retry_after_seconds: 3 },
        { headers: { 'Retry-After': '3' } },
      )
    }
    throw err
  }

  // ---- Step 14: callStructured ----------------------------------------------
  const t0 = performance.now()
  let modelOutput: unknown
  let usage: { input_tokens: number; output_tokens: number } | undefined
  let modelError: ModelCallError | null = null
  let schemaGenError: SchemaGenerationError | null = null
  try {
    const result = await callStructured({
      prompt,
      jsonSchema: OUTPUT_SCHEMA_JSON,
      modelParams: MODEL_PARAMS,
    })
    modelOutput = result.output
    usage = result.usage
  } catch (err) {
    if (err instanceof SchemaGenerationError) {
      schemaGenError = err
      usage = err.partialUsage
    } else if (err instanceof ModelCallError) {
      modelError = err
    } else {
      throw err
    }
  }
  const latencyMs = Math.round(performance.now() - t0)

  // ---- Step 15: telemetry FIRST regardless of outcome -----------------------
  // Wrap in try/catch — if the telemetry update fails (transient DB error),
  // the run row would otherwise be stranded at status='running' forever.
  // On telemetry failure, attempt to mark the row failed with PUBLISH_ERROR
  // so it reaches a terminal state and the user gets a clean response.
  try {
    await updateRunTelemetry(service, run.id, {
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      cost_usd_micros: usage ? computeCostMicros(usage) : null,
      latency_ms: latencyMs,
    })
  } catch (telemetryErr) {
    ulog.error('telemetry_write_failed', { err: telemetryErr, run_id: run.id })
    // Best-effort transition to a terminal state. If failRun also throws,
    // we surface PUBLISH_ERROR to the user — the run row may remain stranded
    // and the weekly invariant cron will surface it.
    await failRun(service, run.id, {
      code: 'PUBLISH_ERROR',
      detail: 'telemetry_write_failed',
    }).catch(failErr => {
      ulog.error('failRun_also_failed_after_telemetry', { err: failErr, run_id: run.id })
    })
    return failed('PUBLISH_ERROR', 500, { analysis_run_id: run.id })
  }

  // ---- Step 16a: SchemaGenerationError → OUTPUT_SCHEMA_FAIL (422) -----------
  // The AI SDK could not parse/validate the model's text against the schema.
  // This is NOT a provider failure — route to the schema/prompt on-call, not
  // the model on-call (codex MAJOR fix #4).
  if (schemaGenError) {
    await failRun(service, run.id, {
      code: 'OUTPUT_SCHEMA_FAIL',
      detail: schemaGenError.message,
    })
    ulog.error('analyze.schema_generation_error', {
      event: 'analyze.schema_generation_error',
      run_id: run.id,
      contractId,
      err: schemaGenError,
    })
    return failed('OUTPUT_SCHEMA_FAIL', 422, { analysis_run_id: run.id })
  }

  // ---- Step 16: MODEL_ERROR --------------------------------------------------
  if (modelError) {
    await failRun(service, run.id, { code: 'MODEL_ERROR', detail: modelError.message })
    ulog.error('analyze.model_error', {
      event: 'analyze.model_error',
      run_id: run.id,
      contractId,
      err: modelError,
    })
    return failed('MODEL_ERROR', 502, { analysis_run_id: run.id })
  }

  // ---- Step 17: OUTPUT_SCHEMA_FAIL ------------------------------------------
  const parsed = OutputSchema.safeParse(modelOutput)
  if (!parsed.success) {
    await failRun(service, run.id, {
      code: 'OUTPUT_SCHEMA_FAIL',
      detail: parsed.error.flatten(),
    })
    return failed('OUTPUT_SCHEMA_FAIL', 422, {
      analysis_run_id: run.id,
      issues: parsed.error.flatten(),
    })
  }

  // ---- Step 18: GROUNDING_FAIL ----------------------------------------------
  const failures = verifyGrounding(parsed.data, contractText)
  if (failures.length > 0) {
    await failRun(service, run.id, { code: 'GROUNDING_FAIL', failures })
    return failed('GROUNDING_FAIL', 422, {
      analysis_run_id: run.id,
      failures,
    })
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
    return failed('PUBLISH_ERROR', 500, { analysis_run_id: run.id })
  }

  const { data: promotedContract, error: promotedContractErr } = await service
    .from('contracts')
    .select('current_run_id, risk_score')
    .eq('id', contractId)
    .single()
  if (
    promotedContractErr ||
    !promotedContract ||
    promotedContract.current_run_id !== run.id ||
    promotedContract.risk_score !== parsed.data.risk_score
  ) {
    ulog.error('analyze.publish_verify_mismatch', {
      event: 'analyze.publish_verify_mismatch',
      run_id: run.id,
      contractId,
      expected_risk_score: parsed.data.risk_score,
      observed_current_run_id: promotedContract?.current_run_id ?? null,
      observed_risk_score: promotedContract?.risk_score ?? null,
      err: promotedContractErr,
    })
    Sentry.captureMessage('promote_analysis_run_verify_mismatch', {
      level: 'fatal',
      tags: { event: 'analyze.publish_verify_mismatch' },
      extra: {
        run_id: run.id,
        contract_id: contractId,
        expected_risk_score: parsed.data.risk_score,
        observed_current_run_id: promotedContract?.current_run_id ?? null,
        observed_risk_score: promotedContract?.risk_score ?? null,
        error: promotedContractErr ? JSON.stringify(promotedContractErr) : null,
      },
    })
    return failed('PUBLISH_ERROR', 500, { analysis_run_id: run.id })
  }

  // ---- Step 20: success ------------------------------------------------------
  return NextResponse.json({
    analysis_run_id: run.id,
    analyzed_at: new Date().toISOString(),
    output: parsed.data,
    diagnostic_warnings: [],
  })
}
