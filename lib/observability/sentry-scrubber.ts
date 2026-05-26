import type { ErrorEvent } from '@sentry/nextjs'

const ALLOWED_HEADERS = new Set(['host', 'user-agent', 'referer'])

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    delete event.request.data

    if (event.request.headers) {
      const filtered: Record<string, string> = {}
      for (const [k, v] of Object.entries(event.request.headers)) {
        if (ALLOWED_HEADERS.has(k.toLowerCase()) && typeof v === 'string') {
          filtered[k.toLowerCase()] = v
        }
      }
      event.request.headers = filtered
    }

    if (event.request.url) {
      const qIdx = event.request.url.indexOf('?')
      if (qIdx >= 0) event.request.url = event.request.url.slice(0, qIdx)
    }
  }

  return event
}
