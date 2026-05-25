import { describe, it, expect } from 'vitest'
import { scrubSentryEvent } from '../sentry-scrubber'
import type { ErrorEvent } from '@sentry/nextjs'

describe('scrubSentryEvent', () => {
  it('drops request.data entirely', () => {
    const event = {
      request: {
        url: 'https://example.com/api/x',
        data: { prompt: 'sensitive content', email: 'a@b.com' },
        headers: { host: 'example.com' },
      },
    } as unknown as ErrorEvent
    const out = scrubSentryEvent(event)
    expect(out?.request?.data).toBeUndefined()
  })

  it('whitelists request headers to host, user-agent, referer only', () => {
    const event = {
      request: {
        headers: {
          host: 'example.com',
          'user-agent': 'Mozilla/5.0',
          referer: 'https://example.com/x',
          authorization: 'Bearer secret-token',
          cookie: 'session=abc',
          'x-custom': 'should-be-stripped',
        },
      },
    } as unknown as ErrorEvent
    const out = scrubSentryEvent(event)
    expect(out?.request?.headers).toEqual({
      host: 'example.com',
      'user-agent': 'Mozilla/5.0',
      referer: 'https://example.com/x',
    })
  })

  it('strips query string from request.url, preserves path', () => {
    const event = {
      request: { url: 'https://example.com/api/x?email=a@b.com&token=xyz' },
    } as unknown as ErrorEvent
    const out = scrubSentryEvent(event)
    expect(out?.request?.url).toBe('https://example.com/api/x')
  })

  it('returns the event (does not null it out)', () => {
    const event = { message: 'plain error' } as ErrorEvent
    const out = scrubSentryEvent(event)
    expect(out).not.toBeNull()
    expect(out?.message).toBe('plain error')
  })
})
