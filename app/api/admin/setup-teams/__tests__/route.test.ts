// app/api/admin/setup-teams/__tests__/route.test.ts
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

describe('POST /api/admin/setup-teams', () => {
  it('returns 403 immediately when requireAdminAccess denies access', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    mockRequireAdminAccess.mockResolvedValue(forbidden)

    const request = new Request('http://localhost/api/admin/setup-teams', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRequireAdminAccess).toHaveBeenCalledOnce()
  })

  it('returns 200 with results array on happy path', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    const request = new Request('http://localhost/api/admin/setup-teams', { method: 'POST' })
    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toBeDefined()
    expect(Array.isArray(body.results)).toBe(true)
    expect(mockRequireAdminAccess).toHaveBeenCalledOnce()
  })
})
