import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingleMock }),
      }),
    }),
  })),
}))

import { requirePlatformAdmin } from '../guard'

const { getUserMock, maybeSingleMock } = mocks

describe('requirePlatformAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when profile row exists with is_platform_admin=false', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null })
    maybeSingleMock.mockResolvedValueOnce({
      data: { is_platform_admin: false },
      error: null,
    })

    const result = await requirePlatformAdmin()
    expect('status' in result ? result.status : 200).toBe(403)
  })

  it('returns userId only when is_platform_admin===true', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'admin' } }, error: null })
    maybeSingleMock.mockResolvedValueOnce({
      data: { is_platform_admin: true },
      error: null,
    })

    const result = await requirePlatformAdmin()
    expect(result).toEqual({ userId: 'admin' })
  })
})
