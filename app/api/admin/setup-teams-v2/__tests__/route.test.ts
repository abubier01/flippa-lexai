// app/api/admin/setup-teams-v2/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stubAdminEnv, restoreAdminEnv } from '@/__tests__/helpers/admin-env'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/security/admin-guard', () => ({
  requireAdminAccess: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }),
}))

// setup-teams-v2 dynamically imports 'pg' — mock it so no real DB connection is made
const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockEnd = vi.fn().mockResolvedValue(undefined)

class MockClient {
  connect = mockConnect
  query = mockQuery
  end = mockEnd
}

vi.mock('pg', () => ({
  default: { Client: MockClient },
  Client: MockClient,
}))

const fetchMock = vi.fn()

import { requireAdminAccess } from '@/lib/security/admin-guard'
import { POST } from '../route'

const mockRequireAdminAccess = requireAdminAccess as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
  mockRequireAdminAccess.mockReset()
  mockQuery.mockResolvedValue({ rows: [] })
  mockConnect.mockResolvedValue(undefined)
  mockEnd.mockResolvedValue(undefined)
  stubAdminEnv({})
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')
  vi.stubEnv('SUPABASE_PROJECT_ID', 'proj-id')
  vi.stubEnv('SUPABASE_ACCESS_TOKEN', 'access-tok')
  vi.stubEnv('POSTGRES_URL_NON_POOLING', 'postgresql://user:pass@localhost:5432/db')
})

afterEach(() => {
  vi.unstubAllGlobals()
  restoreAdminEnv()
  fetchMock.mockReset()
})

describe('POST /api/admin/setup-teams-v2', () => {
  it('returns 403 immediately when requireAdminAccess denies access', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    mockRequireAdminAccess.mockResolvedValue(forbidden)

    const request = new Request('http://localhost/api/admin/setup-teams-v2', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRequireAdminAccess).toHaveBeenCalledOnce()
  })

  it('returns 200 with steps array on happy path', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    const request = new Request('http://localhost/api/admin/setup-teams-v2', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toBeDefined()
    expect(Array.isArray(body.steps)).toBe(true)
    expect(mockRequireAdminAccess).toHaveBeenCalledOnce()
  })

  it('returns 500 when POSTGRES_URL_NON_POOLING is missing', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '')

    const request = new Request('http://localhost/api/admin/setup-teams-v2', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toMatch(/POSTGRES_URL_NON_POOLING/)
  })

  it('records ok:false in steps when a DDL query throws', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)
    mockQuery.mockRejectedValue(new Error('DDL failed'))

    const request = new Request('http://localhost/api/admin/setup-teams-v2', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.steps)).toBe(true)
    const failedStep = body.steps.find((s: { ok: boolean; error?: string }) => s.ok === false)
    expect(failedStep).toBeDefined()
    expect(typeof failedStep.error).toBe('string')
  })
})
