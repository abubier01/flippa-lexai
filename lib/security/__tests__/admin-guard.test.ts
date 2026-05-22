import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAdminAccess } from '../admin-guard'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

const ENV_KEYS = [
  'NODE_ENV',
  'ENABLE_ADMIN_ROUTES',
  'ADMIN_API_KEY',
  'ADMIN_EMAIL_ALLOWLIST',
] as const

const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
)
const mutableEnv = process.env as Record<string, string | undefined>

function requestWithKey(value?: string) {
  return new Request('http://localhost/api/admin/test', {
    headers: value ? { 'x-admin-key': value } : {},
  })
}

async function statusOf(response: Promise<Response | null>) {
  const value = await response
  return value?.status ?? null
}

describe('requireAdminAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of ENV_KEYS) {
      if (ORIGINAL_ENV[key] === undefined) delete mutableEnv[key]
      else mutableEnv[key] = ORIGINAL_ENV[key]
    }
    mutableEnv['NODE_ENV'] = 'test'
    delete mutableEnv.ENABLE_ADMIN_ROUTES
    delete mutableEnv.ADMIN_API_KEY
    delete mutableEnv.ADMIN_EMAIL_ALLOWLIST
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    })
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (ORIGINAL_ENV[key] === undefined) delete mutableEnv[key]
      else mutableEnv[key] = ORIGINAL_ENV[key]
    }
  })

  it('returns 404 in production when admin routes are not enabled', async () => {
    mutableEnv['NODE_ENV'] = 'production'
    const status = await statusOf(requireAdminAccess(requestWithKey()))
    expect(status).toBe(404)
  })

  it('allows valid x-admin-key', async () => {
    mutableEnv.ADMIN_API_KEY = 'super-secret-key'
    const result = await requireAdminAccess(requestWithKey('super-secret-key'))
    expect(result).toBeNull()
  })

  it('rejects invalid x-admin-key with equal length', async () => {
    mutableEnv.ADMIN_API_KEY = 'super-secret-key'
    const status = await statusOf(requireAdminAccess(requestWithKey('wrong-secret-key')))
    expect(status).toBe(403)
  })

  it('allows authenticated user in email allowlist when no key is provided', async () => {
    mutableEnv.ADMIN_EMAIL_ALLOWLIST = 'owner@example.com'
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u_1', email: 'owner@example.com' } }, error: null }),
      },
    })
    const result = await requireAdminAccess(requestWithKey())
    expect(result).toBeNull()
  })

  it('rejects authenticated user outside email allowlist when no key is provided', async () => {
    mutableEnv.ADMIN_EMAIL_ALLOWLIST = 'owner@example.com'
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u_1', email: 'other@example.com' } }, error: null }),
      },
    })
    const status = await statusOf(requireAdminAccess(requestWithKey()))
    expect(status).toBe(403)
  })

  it('returns 403 when ADMIN_API_KEY exists and no allowlist/key is provided', async () => {
    mutableEnv.ADMIN_API_KEY = 'super-secret-key'
    const status = await statusOf(requireAdminAccess(requestWithKey()))
    expect(status).toBe(403)
  })

  it('returns 500 when no ADMIN_API_KEY and no allowlist are configured', async () => {
    const status = await statusOf(requireAdminAccess(requestWithKey()))
    expect(status).toBe(500)
  })
})
