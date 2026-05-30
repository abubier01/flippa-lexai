// Unit tests for POST /api/stripe/portal
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockProfileSingle, mockPortalCreate } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockProfileSingle: vi.fn(),
  mockPortalCreate: vi.fn(),
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
    billingPortal: { sessions: { create: mockPortalCreate } },
  }),
}))

import { POST } from '../route'

function req() {
  return new NextRequest('http://localhost/api/stripe/portal', { method: 'POST' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockProfileSingle.mockResolvedValue({ data: { stripe_customer_id: 'cus_123' } })
  mockPortalCreate.mockResolvedValue({ url: 'https://billing.example/portal' })
  process.env.STRIPE_PORTAL_RETURN_URL = 'https://app.example/account'
})

describe('POST /api/stripe/portal', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(req())
    expect(res.status).toBe(401)
  })

  it('returns 404 when no stripe_customer_id on profile', async () => {
    mockProfileSingle.mockResolvedValueOnce({ data: { stripe_customer_id: null } })
    const res = await POST(req())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/no stripe customer/i)
  })

  it('returns 500 when STRIPE_PORTAL_RETURN_URL is unset', async () => {
    delete process.env.STRIPE_PORTAL_RETURN_URL
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/not configured/i)
  })

  it('returns 502 when stripe portal create throws', async () => {
    mockPortalCreate.mockRejectedValueOnce(new Error('stripe down'))
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/failed to open billing portal/i)
  })

  it('returns 200 with portal url on happy path', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://billing.example/portal')
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.example/account',
    })
  })
})
