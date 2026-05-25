import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureException = vi.fn()
const captureMessage = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  captureException,
  captureMessage,
}))

describe('log → Sentry bridge', () => {
  beforeEach(() => {
    captureException.mockClear()
    captureMessage.mockClear()
  })

  it('forwards log.error with Error to Sentry.captureException', async () => {
    const { log } = await import('../log')
    const err = new Error('boom')
    log.error('something broke', { err, subsystem: 'rate-limit' })
    expect(captureException).toHaveBeenCalledTimes(1)
    const [capturedErr, opts] = captureException.mock.calls[0]
    expect(capturedErr).toBe(err)
    expect(opts.tags).toEqual({ subsystem: 'rate-limit' })
    expect(opts.extra).toMatchObject({ subsystem: 'rate-limit' })
  })

  it('forwards log.error without Error to Sentry.captureMessage at error level', async () => {
    const { log } = await import('../log')
    log.error('no error object', { subsystem: 'stripe' })
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [msg, opts] = captureMessage.mock.calls[0]
    expect(msg).toBe('no error object')
    expect(opts.level).toBe('error')
    expect(opts.tags).toEqual({ subsystem: 'stripe' })
  })

  it('does NOT forward log.warn to Sentry', async () => {
    const { log } = await import('../log')
    log.warn('just a warning', { subsystem: 'stripe' })
    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('redacts auth-shaped keys before forwarding extra payload', async () => {
    const { log } = await import('../log')
    log.error('auth failure', { err: new Error('x'), authorization: 'Bearer abc', subsystem: 'auth' })
    const [, opts] = captureException.mock.calls[0]
    expect(opts.extra.authorization).toBe('[REDACTED]')
  })
})
