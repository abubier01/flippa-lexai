// lib/llm/structured.ts
//
// Provider-agnostic structured-output adapter for the analyze pipeline.
// Tier 1 wires Groq llama-3.3-70b-versatile via @ai-sdk/groq + ai SDK.
//
// Invariant #13 — the persona-derived JSON schema (OUTPUT_SCHEMA_JSON from
// buildOutputSchema(persona)) is the AUTHORITATIVE form passed to the model so
// enum constraints (key_clause_id / risk_area_id) are enforced at generation
// time, not just in post-parse validation.
//
// The route handler never imports @ai-sdk/groq directly — it only sees
// callStructured() and a uniform { output, usage } result.

import 'server-only'

import { createGroq } from '@ai-sdk/groq'
import { generateObject, jsonSchema, NoObjectGeneratedError } from 'ai'
import {
  MODEL_ID,
  computeCostMicros as computeCostMicrosImpl,
} from '@/lib/prompt/model-config'

export interface StructuredCallInput {
  prompt: string
  // OUTPUT_SCHEMA_JSON from buildOutputSchema(persona). zod-to-json-schema
  // output — passed verbatim to the provider so persona-derived enums are
  // honored at generation time.
  jsonSchema: unknown
  modelParams: {
    temperature: number
    top_p: number
    max_tokens: number
    seed?: number
  }
}

export interface StructuredCallUsage {
  input_tokens: number
  output_tokens: number
}

export interface StructuredCallResult {
  output: unknown
  usage?: StructuredCallUsage
}

export class ModelCallError extends Error {
  constructor(
    public cause: unknown,
    public partialUsage?: StructuredCallUsage,
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'ModelCallError'
  }
}

export async function callStructured(
  input: StructuredCallInput,
): Promise<StructuredCallResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new ModelCallError(new Error('GROQ_API_KEY is not configured'))
  }

  const groq = createGroq({ apiKey })
  // Wrap the persona-derived JSON schema so the AI SDK passes it to the
  // provider as a structured-output spec (vs. interpreting it as a Zod schema).
  const schema = jsonSchema(input.jsonSchema as Parameters<typeof jsonSchema>[0])

  try {
    const result = await generateObject({
      model: groq(MODEL_ID),
      schema,
      prompt: input.prompt,
      temperature: input.modelParams.temperature,
      topP: input.modelParams.top_p,
      maxOutputTokens: input.modelParams.max_tokens,
      ...(input.modelParams.seed !== undefined ? { seed: input.modelParams.seed } : {}),
    })

    const usage = extractUsage(result.usage)
    return { output: result.object, usage }
  } catch (err) {
    // generateObject throws NoObjectGeneratedError with .usage attached when the
    // model produced text but it could not be coerced into the schema. Surface
    // the partial usage so the route can persist telemetry even on failure.
    let partial: StructuredCallUsage | undefined
    if (err instanceof NoObjectGeneratedError && err.usage) {
      partial = extractUsage(err.usage)
    }
    throw new ModelCallError(err, partial)
  }
}

function extractUsage(raw: unknown): StructuredCallUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const u = raw as Record<string, unknown>
  // AI SDK v6 exposes `inputTokens` / `outputTokens`; older shapes used
  // `promptTokens` / `completionTokens`. Accept both.
  const input =
    typeof u.inputTokens === 'number'
      ? u.inputTokens
      : typeof u.promptTokens === 'number'
        ? u.promptTokens
        : undefined
  const output =
    typeof u.outputTokens === 'number'
      ? u.outputTokens
      : typeof u.completionTokens === 'number'
        ? u.completionTokens
        : undefined
  if (input === undefined || output === undefined) return undefined
  return { input_tokens: input, output_tokens: output }
}

export const computeCostMicros = computeCostMicrosImpl
