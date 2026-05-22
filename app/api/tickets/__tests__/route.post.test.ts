import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  supportTicketInsert: vi.fn(),
  ticketReplyInsert: vi.fn(),
  state: {
    user: null as null | { id: string; email?: string },
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createServiceClient,
}))

vi.mock('server-only', () => ({}))

function buildRequest(payload: Record<string, unknown>, ip: string) {
  return new Request('http://localhost/api/tickets', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(payload),
  })
}

function validPayload(email: string) {
  return {
    name: 'Alex Builder',
    email,
    subject: 'Support request',
    category: 'general',
    message: 'This is a valid support request with enough content.',
  }
}

describe('POST /api/tickets hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { __lexaiRateLimitStore?: unknown }).__lexaiRateLimitStore = undefined

    mocks.state.user = null
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: mocks.state.user },
        }),
      },
    })

    mocks.supportTicketInsert.mockImplementation(() => ({
      select: () => ({
        single: async () => ({
          data: { id: 'ticket_1', ticket_number: 1001 },
          error: null,
        }),
      }),
    }))
    mocks.ticketReplyInsert.mockResolvedValue({ error: null })

    mocks.createServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'support_tickets') {
          return { insert: mocks.supportTicketInsert }
        }
        if (table === 'ticket_replies') {
          return { insert: mocks.ticketReplyInsert }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    })
  })

  it('returns 429 on the 6th request from the same IP', async () => {
    for (let i = 1; i <= 5; i += 1) {
      const res = await POST(buildRequest(validPayload(`user${i}@example.com`), '198.51.100.10') as never)
      expect(res.status).toBe(200)
    }

    const limited = await POST(buildRequest(validPayload('user6@example.com'), '198.51.100.10') as never)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
  })

  it('returns 429 on the 4th request for the same email across different IPs', async () => {
    const email = 'same@example.com'
    const ips = ['203.0.113.10', '203.0.113.11', '203.0.113.12', '203.0.113.13']

    for (const ip of ips.slice(0, 3)) {
      const res = await POST(buildRequest(validPayload(email), ip) as never)
      expect(res.status).toBe(200)
    }

    const limited = await POST(buildRequest(validPayload(email), ips[3]) as never)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
  })

  it('skips auto-reply writes for unauthenticated submissions', async () => {
    const res = await POST(buildRequest(validPayload('anon@example.com'), '198.51.100.20') as never)
    expect(res.status).toBe(200)
    expect(mocks.supportTicketInsert).toHaveBeenCalledTimes(1)
    expect(mocks.ticketReplyInsert).not.toHaveBeenCalled()
  })
})
