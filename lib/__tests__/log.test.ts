import { beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '@/lib/log'

describe('log', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
})
