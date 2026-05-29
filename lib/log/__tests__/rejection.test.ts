import { describe, it, expect, vi } from 'vitest'
import { logRejection } from '../rejection'

function makeLogger() {
  const warn = vi.fn()
  return {
    logger: {
      warn,
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    } as unknown as Parameters<typeof logRejection>[0],
    warn,
  }
}

describe('logRejection — shape per spec § "What you log per run"', () => {
  it('emits base snake_case keys for any code (CONTRACT_EMPTY)', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, {
      code: 'CONTRACT_EMPTY',
      userId: 'u-1',
      contractId: 'c-1',
      tenantId: 't-1',
    })
    expect(warn).toHaveBeenCalledWith(
      'analysis.rejected',
      expect.objectContaining({
        event: 'analysis.rejected',
        subsystem: 'analyze',
        code: 'CONTRACT_EMPTY',
        user_id: 'u-1',
        contract_id: 'c-1',
        tenant_id: 't-1',
      }),
    )
  })

  it('attaches scope + retry_after_seconds for RATE_LIMITED', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, {
      code: 'RATE_LIMITED',
      userId: 'u-2',
      tenantId: 't-2',
      scope: 'tenant_daily',
      retryAfterSeconds: 42,
    })
    const arg = warn.mock.calls[0][1] as Record<string, unknown>
    expect(arg.code).toBe('RATE_LIMITED')
    expect(arg.scope).toBe('tenant_daily')
    expect(arg.retry_after_seconds).toBe(42)
    expect(arg.contract_id).toBeNull()
  })

  it('attaches tokens for CONTRACT_TOO_LONG', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, {
      code: 'CONTRACT_TOO_LONG',
      userId: 'u-3',
      contractId: 'c-3',
      tokens: 9001,
    })
    const arg = warn.mock.calls[0][1] as Record<string, unknown>
    expect(arg.tokens).toBe(9001)
    expect(arg.raw_length).toBeUndefined()
  })

  it('attaches raw_length for TOO_LONG', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, {
      code: 'TOO_LONG',
      userId: 'u-4',
      contractId: 'c-4',
      rawLength: 5000,
    })
    const arg = warn.mock.calls[0][1] as Record<string, unknown>
    expect(arg.raw_length).toBe(5000)
    expect(arg.tokens).toBeUndefined()
  })

  it('omits optional code-specific fields when not provided', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, {
      code: 'PERSONA_INVALID',
      userId: 'u-5',
    })
    const arg = warn.mock.calls[0][1] as Record<string, unknown>
    expect(arg.code).toBe('PERSONA_INVALID')
    expect('scope' in arg).toBe(false)
    expect('retry_after_seconds' in arg).toBe(false)
    expect('tokens' in arg).toBe(false)
    expect('raw_length' in arg).toBe(false)
  })

  it('normalizes null contract_id / tenant_id when omitted', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, { code: 'EMPTY_AFTER_SCRUB', userId: 'u-6' })
    const arg = warn.mock.calls[0][1] as Record<string, unknown>
    expect(arg.contract_id).toBeNull()
    expect(arg.tenant_id).toBeNull()
  })

  it('uses event name "analysis.rejected" as the log msg and event field', () => {
    const { logger, warn } = makeLogger()
    logRejection(logger, { code: 'SENTINEL_VIOLATION', userId: 'u-7' })
    expect(warn.mock.calls[0][0]).toBe('analysis.rejected')
    expect((warn.mock.calls[0][1] as Record<string, unknown>).event).toBe('analysis.rejected')
  })
})
