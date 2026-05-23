import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '../logger'

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('redacts known sensitive keys', () => {
    vi.stubEnv('NODE_ENV', 'production')
    log.info('test', 'redact', { email: 'a@b.com', safe: 'ok' })
    const line = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line) as { fields: Record<string, unknown> }
    expect(parsed.fields.email).toBe('[REDACTED]')
    expect(parsed.fields.safe).toBe('ok')
  })

  it('redacts nested sensitive keys', () => {
    vi.stubEnv('NODE_ENV', 'production')
    log.info('test', 'nested', { user: { profile: { token: 'abc', name: 'N' } } })
    const line = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line) as { fields: { user: { profile: Record<string, unknown> } } }
    expect(parsed.fields.user.profile.token).toBe('[REDACTED]')
    expect(parsed.fields.user.profile.name).toBe('N')
  })

  it('does not recurse past depth 4 and handles circular refs', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const deep: Record<string, unknown> = { a: { b: { c: { d: { e: 'x' } } } } }
    deep.self = deep
    log.info('test', 'depth', { deep })
    const line = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line) as { fields: Record<string, unknown> }
    expect(parsed.fields.deep).toBeTypeOf('object')
    expect((parsed.fields.deep as Record<string, unknown>).self).toBe('[Circular]')
    const lvl = ((parsed.fields.deep as Record<string, unknown>).a as Record<string, unknown>).b as Record<string, unknown>
    expect(lvl.c).toBe('[Truncated]')
  })

  it('extracts Stripe requestId from err shape', () => {
    vi.stubEnv('NODE_ENV', 'production')
    log.error('stripe-webhook', 'failed', { err: { requestId: 'req_123', type: 'StripeCardError' } })
    const line = errorSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line) as { requestId?: string }
    expect(parsed.requestId).toBe('req_123')
  })

  it('emits parseable JSON output in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    log.warn('scope', 'msg', { x: 1 })
    const line = warnSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line) as { level: string; scope: string; msg: string }
    expect(parsed.level).toBe('warn')
    expect(parsed.scope).toBe('scope')
    expect(parsed.msg).toBe('msg')
  })

  it('emits non-JSON output in dev mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    log.info('scope', 'dev message', { email: 'a@b.com' })
    const line = logSpy.mock.calls[0][0] as string
    expect(() => JSON.parse(line)).toThrow()
    expect(line).toContain('dev message')
    expect(line).toContain('[REDACTED]')
  })
})
