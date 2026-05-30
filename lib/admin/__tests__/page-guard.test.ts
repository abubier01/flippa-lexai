// Unit tests for the persona admin server-component guard.
//
// The full HTTP/page-level "admin gets 200, non-admin gets redirected" check
// requires a running Next.js server — written here as a focused unit test
// that asserts each branch of requirePlatformAdminPage produces the expected
// redirect target.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    // Real next/navigation.redirect throws to short-circuit RSC rendering.
    throw new Error(`__REDIRECT__:${url}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  })),
}))

const { getUserMock, maybeSingleMock, fromMock } = mocks

import { requirePlatformAdminPage } from '../page-guard'

beforeEach(() => {
  vi.clearAllMocks()
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: maybeSingleMock }),
    }),
  })
})

describe('requirePlatformAdminPage', () => {
  it('redirects to login when no user is signed in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    await expect(requirePlatformAdminPage()).rejects.toThrow(
      /__REDIRECT__:\/auth\/login\?next=%2Fadmin%2Fpersonas/,
    )
  })

  it('redirects to forbidden when the profile lookup errors', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u-1' } } })
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(requirePlatformAdminPage()).rejects.toThrow(
      '__REDIRECT__:/admin/personas/forbidden',
    )
  })

  it('redirects to forbidden when is_platform_admin is false', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u-2' } } })
    maybeSingleMock.mockResolvedValueOnce({ data: { is_platform_admin: false }, error: null })
    await expect(requirePlatformAdminPage()).rejects.toThrow(
      '__REDIRECT__:/admin/personas/forbidden',
    )
  })

  it('redirects to forbidden when the profile row is missing', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u-3' } } })
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    await expect(requirePlatformAdminPage()).rejects.toThrow(
      '__REDIRECT__:/admin/personas/forbidden',
    )
  })

  it('returns the userId when is_platform_admin is true', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'admin-id' } } })
    maybeSingleMock.mockResolvedValueOnce({ data: { is_platform_admin: true }, error: null })
    const result = await requirePlatformAdminPage()
    expect(result).toEqual({ userId: 'admin-id' })
  })

  it('honours a custom login-next path', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    await expect(
      requirePlatformAdminPage('/admin/personas/procurement/draft'),
    ).rejects.toThrow(
      /__REDIRECT__:\/auth\/login\?next=%2Fadmin%2Fpersonas%2Fprocurement%2Fdraft/,
    )
  })
})
