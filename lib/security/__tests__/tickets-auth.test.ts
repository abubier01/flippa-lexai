import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as lookupPost } from '../../../app/api/tickets/lookup/route'
import { GET as ticketGet } from '../../../app/api/tickets/[id]/route'
import { POST as ticketsPost } from '../../../app/api/tickets/route'
import { createAuthClient, createLookupClient, createTicketServiceClient } from './helpers'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createServiceClient,
}))

vi.mock('server-only', () => ({}))

function jsonRequest(url: string, body: Record<string, unknown>, ip = '198.51.100.10') {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  })
}

describe('tickets route security behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    ;(globalThis as { __lexaiRateLimitStore?: unknown }).__lexaiRateLimitStore = undefined
  })

  it('returns 401 for unauthenticated POST /api/tickets/lookup', async () => {
    mocks.createClient.mockResolvedValue(createAuthClient({ user: null }))
    const res = await lookupPost(jsonRequest('http://localhost/api/tickets/lookup', {}) as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 for mismatched email in POST /api/tickets/lookup', async () => {
    mocks.createClient.mockResolvedValue(
      createLookupClient({
        user: { id: 'u_1', email: 'owner@example.com' },
      }),
    )
    const res = await lookupPost(
      jsonRequest('http://localhost/api/tickets/lookup', { email: 'other@example.com' }) as never,
    )
    expect(res.status).toBe(403)
  })

  it('returns 401 for unauthenticated GET /api/tickets/[id]', async () => {
    mocks.createClient.mockResolvedValue(createAuthClient({ user: null }))
    const res = await ticketGet(new Request('http://localhost/api/tickets/ticket_1') as never, {
      params: Promise.resolve({ id: 'ticket_1' }),
    })
    expect(res.status).toBe(401)
  })

  it('rate-limits POST /api/tickets on the 6th call from same IP', async () => {
    mocks.createClient.mockResolvedValue(createAuthClient({ user: null }))
    mocks.createServiceClient.mockReturnValue(createTicketServiceClient())

    for (let i = 1; i <= 5; i += 1) {
      const res = await ticketsPost(
        jsonRequest(
          'http://localhost/api/tickets',
          {
            name: 'Alex Builder',
            email: `user${i}@example.com`,
            subject: 'Help',
            message: 'This is a valid support message with enough length.',
          },
          '203.0.113.9',
        ) as never,
      )
      expect(res.status).toBe(200)
    }

    const limited = await ticketsPost(
      jsonRequest(
        'http://localhost/api/tickets',
        {
          name: 'Alex Builder',
          email: 'overflow@example.com',
          subject: 'Help',
          message: 'This is a valid support message with enough length.',
        },
        '203.0.113.9',
      ) as never,
    )
    expect(limited.status).toBe(429)
  })
})
