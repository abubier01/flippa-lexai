// lib/analysis/repo.ts
//
// Service-role data access for analysis_runs. The publish path is delegated to
// the promote_analysis_run RPC (scripts/017_admin_rpcs.sql) which atomically
// demotes any prior current run for the contract, promotes the target run, and
// updates contracts.current_run_id.
//
// Spec § Publish Mechanics — two-attempt retry on 23505 unique_violation.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'

export type DiagnosticCode =
  | 'OUTPUT_SCHEMA_FAIL'
  | 'GROUNDING_FAIL'
  | 'MODEL_ERROR'
  | 'PUBLISH_ERROR'

export type Diagnostic =
  | { code: 'OUTPUT_SCHEMA_FAIL'; detail?: unknown }
  | { code: 'GROUNDING_FAIL'; failures: unknown[] }
  | { code: 'MODEL_ERROR'; detail?: unknown }
  | { code: 'PUBLISH_ERROR'; detail?: unknown }

export interface InsertRunInput {
  contract_id: string
  user_context: string | null
  persona_id: string
  persona_version_id: string
  persona_hash: string
  core_version: string
  model_id: string
  model_params: Record<string, unknown>
  prompt_hash: string
  context_hash: string | null
}

export interface Telemetry {
  input_tokens: number | null
  output_tokens: number | null
  cost_usd_micros: number | null
  latency_ms: number | null
}

export class AnalysisRepoError extends Error {
  constructor(public code: 'not_found' | 'db_error', message: string, public detail?: unknown) {
    super(message)
    this.name = 'AnalysisRepoError'
  }
}

export async function insertRun(
  client: SupabaseClient,
  input: InsertRunInput,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('analysis_runs')
    .insert({
      ...input,
      status: 'running',
      is_current: false,
      diagnostics: [],
    })
    .select('id')
    .single()
  if (error || !data) throw new AnalysisRepoError('db_error', error?.message ?? 'insert failed', error)
  return { id: data.id as string }
}

export async function updateRunTelemetry(
  client: SupabaseClient,
  id: string,
  telemetry: Telemetry,
): Promise<void> {
  const { error } = await client.from('analysis_runs').update(telemetry).eq('id', id)
  if (error) throw new AnalysisRepoError('db_error', error.message, error)
}

export async function failRun(
  client: SupabaseClient,
  id: string,
  diagnostic: Diagnostic,
): Promise<void> {
  // Read-then-write append. analysis_runs is server-write-only and contention
  // on a single failed run is effectively nil — no need for a Postgres-side
  // jsonb_set helper here.
  const { data: row, error: readErr } = await client
    .from('analysis_runs')
    .select('diagnostics')
    .eq('id', id)
    .single()
  if (readErr || !row) {
    throw new AnalysisRepoError('not_found', `analysis_run ${id} not found`, readErr)
  }
  const existing = Array.isArray(row.diagnostics) ? (row.diagnostics as Diagnostic[]) : []
  const next = [...existing, diagnostic]
  const { error } = await client
    .from('analysis_runs')
    .update({ diagnostics: next, status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new AnalysisRepoError('db_error', error.message, error)
}

export async function promoteToCurrent(
  client: SupabaseClient,
  runId: string,
  output: AnalysisOutput,
): Promise<void> {
  const MAX_ATTEMPTS = 2
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await client.rpc('promote_analysis_run', {
      p_run_id: runId,
      p_output: output as unknown as Record<string, unknown>,
    })
    if (!error) return
    lastErr = error
    // 23505 = unique_violation on the partial index. Another publish committed
    // first; retry will demote that row and promote ours.
    if ((error as { code?: string }).code !== '23505') break
  }
  throw new AnalysisRepoError(
    'db_error',
    `promote_analysis_run failed after retries: ${(lastErr as Error | null)?.message ?? String(lastErr)}`,
    lastErr,
  )
}
