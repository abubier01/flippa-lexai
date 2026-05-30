// Unit tests for POST /api/stripe/verify
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockProfileSingle, mockSessionRetrieve } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockProfileSingle: vi.fn(),
  mockSessionRetrieve: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockProfileSingle,
    }),
  }),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    checkout: { sessions: { retrieve: mockSessionRetrieve } },
  }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/stripe/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const paidSession = (overrides: Partial<{
  payment_status: string
  client_reference_id: string
  metadata: Record<string, string>
}> = {}) => ({
  payment_status: 'paid',
  client_reference_id: 'user-1',
  metadata: { plan: 'pro', userId: 'user-1' },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockProfileSingle.mockResolvedValue({ data: { plan: 'solo' } })
  mockSessionRetrieve.mockResolvedValue(paidSession())
})

describe('POST /api/stripe/verify', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when sessionId missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('returns 402 when payment_status is not "paid"', async () => {
    mockSessionRetrieve.mockResolvedValueOnce(paidSession({ payment_status: 'unpaid' }))
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(402)
  })

  it('returns 403 when session belongs to a different user', async () => {
    mockSessionRetrieve.mockResolvedValueOnce(
      paidSession({ client_reference_id: 'other', metadata: { plan: 'pro', userId: 'other' } }),
    )
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when plan metadata is invalid', async () => {
    mockSessionRetrieve.mockResolvedValueOnce(
      paidSession({ metadata: { plan: 'enterprise', userId: 'user-1' } }),
    )
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when attempting tier downgrade', async () => {
    mockProfileSingle.mockResolvedValueOnce({ data: { plan: 'team' } })
    // session.plan='pro' < current 'team' → downgrade
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(409)
  })

  it('returns 200 on happy path with success and plan', async () => {
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, plan: 'pro' })
  })

  it('returns 500 on unexpected throw', async () => {
    mockSessionRetrieve.mockRejectedValueOnce(new Error('stripe down'))
    const res = await POST(req({ sessionId: 'cs_1' }))
    expect(res.status).toBe(500)
  })
})
