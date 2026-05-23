// app/api/admin/migrate-blog/__tests__/route.test.ts
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
  stubAdminEnv({})
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')
  vi.stubEnv('SUPABASE_PROJECT_ID', 'proj-id')
  vi.stubEnv('SUPABASE_ACCESS_TOKEN', 'access-tok')
})

afterEach(() => {
  vi.unstubAllGlobals()
  restoreAdminEnv()
  fetchMock.mockReset()
})

describe('POST /api/admin/migrate-blog', () => {
  it('returns 403 immediately when requireAdminAccess denies access', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    mockRequireAdminAccess.mockResolvedValue(forbidden)

    const request = new Request('http://localhost/api/admin/migrate-blog', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRequireAdminAccess).toHaveBeenCalledOnce()
  })

  it('returns 200 with results and tableExists on happy path', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    const request = new Request('http://localhost/api/admin/migrate-blog', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toBeDefined()
    expect(Array.isArray(body.results)).toBe(true)
    expect(typeof body.tableExists).toBe('boolean')
    expect(mockRequireAdminAccess).toHaveBeenCalledOnce()
  })

  it('falls back to management API when exec_sql RPC returns !ok', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/rest/v1/rpc/exec_sql')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
      }
      if (url.includes('api.supabase.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const request = new Request('http://localhost/api/admin/migrate-blog', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.every((r: string) => typeof r === 'string')).toBe(true)
    expect(body.results.some((r: string) => r === 'OK via mgmt API')).toBe(true)
  })

  it('records "Error" result when mgmt API also returns !ok', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/rest/v1/rpc/exec_sql')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'forbidden' }) })
      }
      if (url.includes('api.supabase.com')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'forbidden' }) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'forbidden' }) })
    })

    const request = new Request('http://localhost/api/admin/migrate-blog', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.every((r: string) => r.startsWith('Error:'))).toBe(true)
  })

  it('records "Exception" when fetch throws', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    fetchMock.mockRejectedValue(new Error('network down'))

    const request = new Request('http://localhost/api/admin/migrate-blog', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.some((r: string) => r.includes('Exception:'))).toBe(true)
  })
})
