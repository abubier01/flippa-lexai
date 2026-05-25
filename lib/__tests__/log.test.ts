import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '@/lib/log'

describe('log', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not throw when context contains a circular reference', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(() => log.info('cycle', { node: a })).not.toThrow()
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.msg).toBe('cycle')
    expect(payload.node.name).toBe('a')
    expect(payload.node.self).toBe('[Circular]')
  })

  it('emits JSON entries with level, message, timestamp, and context', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('upload.failed', { route: 'contracts.upload', userId: 'user-1' })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.level).toBe('info')
    expect(payload.msg).toBe('upload.failed')
    expect(payload.ts).toEqual(expect.any(String))
    expect(payload.route).toBe('contracts.upload')
    expect(payload.userId).toBe('user-1')
  })

  it('serializes Error objects for error logs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error('handler.failed', { err: new Error('boom') })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.level).toBe('error')
    expect(payload.err).toMatchObject({ message: 'boom', name: 'Error' })
    expect(payload.err.stack).toEqual(expect.any(String))
  })

  it('serializes Error objects for warn and info logs (not just error)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.warn('handler.warned', { err: new Error('warn-boom') })
    log.info('handler.noted', { err: new Error('info-boom') })
    const warnPayload = JSON.parse(warnSpy.mock.calls[0][0] as string)
    const infoPayload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(warnPayload.err).toMatchObject({ message: 'warn-boom', name: 'Error' })
    expect(infoPayload.err).toMatchObject({ message: 'info-boom', name: 'Error' })
  })

  it('child logger merges base context', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const child = log.child({ requestId: 'req-1', route: 'stripe.webhook' })
    child.warn('dedup: in-flight', { eventId: 'evt_1' })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.requestId).toBe('req-1')
    expect(payload.route).toBe('stripe.webhook')
    expect(payload.eventId).toBe('evt_1')
  })

  it('child logger error keeps base context and serialized err', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const child = log.child({ requestId: 'req-2', route: 'contracts.chat' })
    child.error('chat.failed', { userId: 'user-1', err: new Error('oops') })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.requestId).toBe('req-2')
    expect(payload.route).toBe('contracts.chat')
    expect(payload.userId).toBe('user-1')
    expect(payload.err.message).toBe('oops')
  })

  it('redacts denylisted fields (top-level)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('user.signin', { userId: 'u1', password: 'p4ssw0rd', apiKey: 'sk_test_abc' })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.userId).toBe('u1')
    expect(payload.password).toBe('[REDACTED]')
    expect(payload.apiKey).toBe('[REDACTED]')
  })

  it('redacts case-insensitively', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('mixed.case', {
      Password: 'a',
      API_KEY: 'b',
      Authorization: 'Bearer c',
      SessionId: 'd',
    })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.Password).toBe('[REDACTED]')
    expect(payload.API_KEY).toBe('[REDACTED]')
    expect(payload.Authorization).toBe('[REDACTED]')
    expect(payload.SessionId).toBe('[REDACTED]')
  })

  it('redacts nested fields recursively', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('nested', {
      user: { id: 'u1', token: 'tk_abc' },
      request: { headers: { cookie: 'sid=xyz' } },
    })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.user.id).toBe('u1')
    expect(payload.user.token).toBe('[REDACTED]')
    expect(payload.request.headers.cookie).toBe('[REDACTED]')
  })

  it('redacts inside arrays of objects', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('arr', {
      items: [
        { name: 'one', secret: 's1' },
        { name: 'two', secret: 's2' },
      ],
    })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.items[0].name).toBe('one')
    expect(payload.items[0].secret).toBe('[REDACTED]')
    expect(payload.items[1].name).toBe('two')
    expect(payload.items[1].secret).toBe('[REDACTED]')
  })

  it('passes innocuous fields through untouched', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('innocuous', { userId: 'u1', route: '/x', count: 3, ok: true })
    const payload = JSON.parse(spy.mock.calls[0][0] as string)
    expect(payload.userId).toBe('u1')
    expect(payload.route).toBe('/x')
    expect(payload.count).toBe(3)
    expect(payload.ok).toBe(true)
  })

  describe('LOG_LEVEL filtering', () => {
    const originalLevel = process.env.LOG_LEVEL
    afterEach(() => {
      if (originalLevel === undefined) delete process.env.LOG_LEVEL
      else process.env.LOG_LEVEL = originalLevel
    })

    it('LOG_LEVEL=warn suppresses info and debug but emits warn', () => {
      process.env.LOG_LEVEL = 'warn'
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      log.info('should-be-suppressed')
      log.debug('also-suppressed')
      log.warn('should-fire')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('LOG_LEVEL=error suppresses everything except error', () => {
      process.env.LOG_LEVEL = 'error'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      log.debug('no')
      log.info('no')
      log.warn('no')
      log.error('yes')
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalled()
    })

    it('default (LOG_LEVEL unset) is info — debug suppressed, info fires', () => {
      delete process.env.LOG_LEVEL
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      log.debug('hidden')
      log.info('shown')
      expect(logSpy).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
      expect(payload.msg).toBe('shown')
    })

    it('LOG_LEVEL=debug emits all levels (debug + info both fire)', () => {
      process.env.LOG_LEVEL = 'debug'
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      log.debug('d')
      log.info('i')
      expect(logSpy).toHaveBeenCalledTimes(2)
    })
  })
})
