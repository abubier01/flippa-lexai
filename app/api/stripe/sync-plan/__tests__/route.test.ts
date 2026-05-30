// Unit tests for POST /api/stripe/sync-plan
//
// This endpoint was intentionally deprecated when Stripe webhooks took over
// plan persistence. The current implementation always returns 410 Gone with
// a deprecation message. These tests pin that contract so a future revival
// of sync-plan does not regress without conscious test rewriting.
import { describe, it, expect } from 'vitest'
import { POST } from '../route'

describe('POST /api/stripe/sync-plan (deprecated)', () => {
  it('always returns 410 Gone', async () => {
    const res = await POST()
    expect(res.status).toBe(410)
  })

  it('body explains the deprecation', async () => {
    const res = await POST()
    const body = await res.json()
    expect(body.error).toMatch(/deprecated|webhook/i)
  })
})
