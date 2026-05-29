// lib/contracts/read.ts
//
// Consolidated read-path for the structured analysis view. Replaces the legacy
// `contract_analyses` fetches scattered across app/contracts/[id]/page.tsx,
// app/api/contracts/chat/route.ts, and elsewhere.
//
// Spec § Source-of-Truth Contract: contracts.current_run_id is the read pointer,
// analysis_runs.is_current is the DB-enforced canonical marker. Historical runs
// MUST render against THEIR persona version (spec test #13), so we join through
// analysis_runs.persona_version_id rather than loading the currently-published
// persona.

import type { SupabaseClient } from '@supabase/supabase-js'
import { PersonaSchema, type Persona } from '@/lib/prompt/persona-types'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'

export interface AnalysisRunRow {
  id: string
  contract_id: string
  status: 'running' | 'completed' | 'failed'
  is_current: boolean
  output: AnalysisOutput | null
  diagnostics: unknown[]
  user_context: string | null
  persona_id: string
  persona_version_id: string
  persona_hash: string
  core_version: string
  model_id: string
  model_params: Record<string, unknown>
  prompt_hash: string
  context_hash: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd_micros: number | null
  latency_ms: number | null
  created_at: string
  completed_at: string | null
}

export interface RunWithPersona {
  run: AnalysisRunRow
  persona: Persona
}

export class PersonaCorruptionError extends Error {
  constructor(public personaVersionId: string, public detail: unknown) {
    super(`persona_version ${personaVersionId} failed PersonaSchema parse`)
    this.name = 'PersonaCorruptionError'
  }
}

/**
 * Fetch the contract's current published analysis run AND the exact persona
 * version it was analyzed under. Returns null when:
 *   - the contract does not exist or RLS hides it,
 *   - no analysis has been run yet (current_run_id is null).
 *
 * Throws PersonaCorruptionError if the joined persona content fails
 * PersonaSchema (server-side corruption — bubble to ErrorBoundary).
 *
 * One round-trip via PostgREST's embedded resource selection:
 *   contracts → analysis_runs(current_run_id) → persona_versions(persona_version_id)
 */
export async function getCurrentRunWithPersona(
  contractId: string,
  client: SupabaseClient,
): Promise<RunWithPersona | null> {
  // PostgREST embeds the joined run by FK contracts.current_run_id; we then
  // hop one more level to persona_versions(content) via the run's FK.
  const { data, error } = await client
    .from('contracts')
    .select(
      `
      id,
      current_run_id,
      run:analysis_runs!current_run_id(
        id, contract_id, status, is_current, output, diagnostics,
        user_context, persona_id, persona_version_id, persona_hash,
        core_version, model_id, model_params, prompt_hash, context_hash,
        input_tokens, output_tokens, cost_usd_micros, latency_ms,
        created_at, completed_at,
        persona_version:persona_versions(content)
      )
      `,
    )
    .eq('id', contractId)
    .maybeSingle()

  if (error) {
    // RLS-hidden rows return data=null without error; a real error indicates
    // schema drift or transient DB failure. Surface to the caller.
    throw error
  }
  if (!data || !data.current_run_id || !data.run) return null

  // PostgREST returns the embedded row as either an object or array depending
  // on the relationship; normalize defensively.
  const runRow = (Array.isArray(data.run) ? data.run[0] : data.run) as
    | (AnalysisRunRow & {
        persona_version: { content: unknown } | { content: unknown }[] | null
      })
    | undefined
  if (!runRow) return null

  const pvEmbed = runRow.persona_version
  const pvRow = Array.isArray(pvEmbed) ? pvEmbed[0] : pvEmbed
  if (!pvRow) return null

  const parsed = PersonaSchema.safeParse(pvRow.content)
  if (!parsed.success) {
    throw new PersonaCorruptionError(runRow.persona_version_id, parsed.error.format())
  }

  // Strip the joined persona_version off before returning the typed row.
  const { persona_version: _omit, ...run } = runRow
  void _omit
  return { run: run as AnalysisRunRow, persona: parsed.data }
}

/**
 * For the "Latest analysis failed, previous result shown below" banner
 * (spec § Empty-state matrix). Returns the most recent run for the contract
 * IF it differs from currentRunId. If it matches (or no rows exist), returns
 * null — the caller shouldn't render a banner.
 */
export async function getLatestRunIfDifferent(
  contractId: string,
  currentRunId: string | null,
  client: SupabaseClient,
): Promise<Pick<AnalysisRunRow, 'id' | 'status' | 'created_at' | 'diagnostics'> | null> {
  const { data, error } = await client
    .from('analysis_runs')
    .select('id, status, created_at, diagnostics')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  if (currentRunId && data.id === currentRunId) return null
  return data as Pick<AnalysisRunRow, 'id' | 'status' | 'created_at' | 'diagnostics'>
}
