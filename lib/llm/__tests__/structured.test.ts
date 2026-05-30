// Spec invariant #13: persona-derived JSON schema (with enum constraints) is
// passed to the provider so structured output is enum-constrained at
// generation time — not just validated post-hoc.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const generateObjectMock = vi.hoisted(() => vi.fn())
const jsonSchemaMock = vi.hoisted(() =>
  vi.fn((s: unknown) => ({ __wrappedJsonSchema: s })),
)
const createGroqMock = vi.hoisted(() =>
  vi.fn(() => (id: string) => ({ __groqModel: id })),
)

vi.mock('ai', () => {
  class NoObjectGeneratedError extends Error {
    usage?: unknown
    cause?: unknown
    static isInstance(e: unknown): boolean {
      return e instanceof NoObjectGeneratedError
    }
  }
  return {
    generateObject: generateObjectMock,
    jsonSchema: jsonSchemaMock,
    NoObjectGeneratedError,
  }
})

vi.mock('@ai-sdk/groq', () => ({
  createGroq: createGroqMock,
}))

import {
  callStructured,
  computeCostMicros,
  ModelCallError,
  SchemaGenerationError,
} from '../structured'
import { NoObjectGeneratedError } from 'ai'
import { MODEL_ID } from '@/lib/prompt/model-config'

const sampleJsonSchema = {
  type: 'object',
  properties: {
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          risk_area_id: { type: 'string', enum: ['a_risk', 'another_risk'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
      },
    },
  },
}

describe('callStructured — invariant #13 enum wiring', () => {
  beforeEach(() => {
    generateObjectMock.mockReset()
    jsonSchemaMock.mockClear()
    createGroqMock.mockClear()
    process.env.GROQ_API_KEY = 'test-key'
  })

  it('passes the persona-derived JSON schema (with enums) through jsonSchema() to generateObject', async () => {
    generateObjectMock.mockResolvedValue({
      object: { risks: [] },
      usage: { inputTokens: 100, outputTokens: 50 },
    })

    await callStructured({
      prompt: 'test prompt',
      jsonSchema: sampleJsonSchema,
      modelParams: { temperature: 0.2, top_p: 1, max_tokens: 4096 },
    })

    expect(jsonSchemaMock).toHaveBeenCalledTimes(1)
    expect(jsonSchemaMock.mock.calls[0][0]).toBe(sampleJsonSchema)
    // Enums must be preserved verbatim — not stripped, mutated, or downgraded.
    const passed = jsonSchemaMock.mock.calls[0][0] as typeof sampleJsonSchema
    const itemProps = passed.properties.risks.items.properties as Record<
      string,
      { enum?: string[] }
    >
    expect(itemProps.risk_area_id.enum).toEqual(['a_risk', 'another_risk'])
    expect(itemProps.severity.enum).toEqual(['low', 'medium', 'high', 'critical'])

    expect(generateObjectMock).toHaveBeenCalledTimes(1)
    const call = generateObjectMock.mock.calls[0][0]
    expect(call.schema).toEqual({ __wrappedJsonSchema: sampleJsonSchema })
    expect(call.model).toEqual({ __groqModel: MODEL_ID })
    expect(call.prompt).toBe('test prompt')
    expect(call.temperature).toBe(0.2)
    expect(call.topP).toBe(1)
    expect(call.maxOutputTokens).toBe(4096)
  })

  it('extracts usage and returns { output, usage }', async () => {
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { inputTokens: 42, outputTokens: 7 },
    })
    const res = await callStructured({
      prompt: 'p',
      jsonSchema: sampleJsonSchema,
      modelParams: { temperature: 0, top_p: 1, max_tokens: 100 },
    })
    expect(res.output).toEqual({ ok: true })
    expect(res.usage).toEqual({ input_tokens: 42, output_tokens: 7 })
  })

  it('throws ModelCallError when generateObject rejects with a plain provider error', async () => {
    generateObjectMock.mockRejectedValue(new Error('boom'))
    await expect(
      callStructured({
        prompt: 'p',
        jsonSchema: sampleJsonSchema,
        modelParams: { temperature: 0, top_p: 1, max_tokens: 100 },
      }),
    ).rejects.toBeInstanceOf(ModelCallError)
  })

  it('throws SchemaGenerationError (not ModelCallError) when AI SDK raises NoObjectGeneratedError (codex MAJOR fix #4)', async () => {
    const cause = new Error('zod parse failed')
    // Constructor is mocked above as `(message: string)`; cast to bypass the
    // real AI SDK type which requires more fields.
    const ErrCtor = NoObjectGeneratedError as unknown as new (m: string) => Error & {
      usage?: unknown
      cause?: unknown
    }
    const err = new ErrCtor('schema validation failed')
    err.cause = cause
    err.usage = { inputTokens: 100, outputTokens: 50 }
    generateObjectMock.mockRejectedValue(err)

    const promise = callStructured({
      prompt: 'p',
      jsonSchema: sampleJsonSchema,
      modelParams: { temperature: 0, top_p: 1, max_tokens: 100 },
    })
    await expect(promise).rejects.toBeInstanceOf(SchemaGenerationError)
    // It must NOT be a ModelCallError — that's the whole point of the split.
    await expect(promise).rejects.not.toBeInstanceOf(ModelCallError)
    // Partial usage surfaced for telemetry.
    try {
      await promise
    } catch (e) {
      expect((e as SchemaGenerationError).partialUsage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
      })
    }
  })

  it('throws ModelCallError when GROQ_API_KEY is missing', async () => {
    delete process.env.GROQ_API_KEY
    await expect(
      callStructured({
        prompt: 'p',
        jsonSchema: sampleJsonSchema,
        modelParams: { temperature: 0, top_p: 1, max_tokens: 100 },
      }),
    ).rejects.toBeInstanceOf(ModelCallError)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })
})

describe('computeCostMicros', () => {
  it('re-exports the model-config implementation', () => {
    const cost = computeCostMicros({ input_tokens: 1_000_000, output_tokens: 0 })
    // 1M input tokens * $0.59 per Mtok * 1_000_000 micros/USD = 590000 micros
    expect(cost).toBe(590_000)
  })
})
