// lib/security/__tests__/admin-guard.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stubAdminEnv, restoreAdminEnv } from '@/__tests__/helpers/admin-env'

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser } }),
}))

vi.mock('server-only', () => ({}))

import { requireAdminAccess } from '../admin-guard'

afterEach(() => restoreAdminEnv())
beforeEach(() => getUser.mockReset())

function req(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/test', { method: 'POST', headers })
}

describe('requireAdminAccess', () => {
  it('production + ENABLE_ADMIN_ROUTES != "true" → 404 (admin routes disabled)', async () => {
    stubAdminEnv({ NODE_ENV: 'production', ENABLE_ADMIN_ROUTES: 'false', ADMIN_API_KEY: 'k' })
    const r = await requireAdminAccess(req())
    expect(r?.status).toBe(404)
  })

  it('production + ENABLE_ADMIN_ROUTES === "true" still validates further (does not short-circuit)', async () => {
    stubAdminEnv({
      NODE_ENV: 'production',
      ENABLE_ADMIN_ROUTES: 'true',
      ADMIN_API_KEY: 'secret',
    })
    const r = await requireAdminAccess(req({ 'x-admin-key': 'secret' }))
    expect(r).toBeNull()
  })

  it('valid x-admin-key → null (access granted)', async () => {
    stubAdminEnv({ ADMIN_API_KEY: 'secret' })
    const r = await requireAdminAccess(req({ 'x-admin-key': 'secret' }))
    expect(r).toBeNull()
  })

  it('invalid x-admin-key → 403', async () => {
    stubAdminEnv({ ADMIN_API_KEY: 'secret' })
    const r = await requireAdminAccess(req({ 'x-admin-key': 'wrong' }))
    expect(r?.status).toBe(403)
  })

  it('missing key + ADMIN_API_KEY set + no allowlist configured → 403', async () => {
    // ADMIN_API_KEY configured, key absent in request, allowlist empty → 403
    stubAdminEnv({ ADMIN_API_KEY: 'secret' })
    const r = await requireAdminAccess(req())
    expect(r?.status).toBe(403)
  })

  it('no ADMIN_API_KEY and no allowlist → 500 ("not configured")', async () => {
    // Neither env var set → defensive 500
    const r = await requireAdminAccess(req())
    expect(r?.status).toBe(500)
  })

  it('allowlisted email (case-insensitive, trimmed) → null', async () => {
    stubAdminEnv({ ADMIN_EMAIL_ALLOWLIST: ' Admin@LexAI.com, other@x.com ' })
    getUser.mockResolvedValue({ data: { user: { email: 'admin@lexai.com' } }, error: null })
    const r = await requireAdminAccess(req())
    expect(r).toBeNull()
  })

  it('email not in allowlist → 403', async () => {
    stubAdminEnv({ ADMIN_EMAIL_ALLOWLIST: 'admin@lexai.com' })
    getUser.mockResolvedValue({ data: { user: { email: 'attacker@evil.com' } }, error: null })
    const r = await requireAdminAccess(req())
    expect(r?.status).toBe(403)
  })

  it('no authenticated user when only allowlist configured → 401', async () => {
    stubAdminEnv({ ADMIN_EMAIL_ALLOWLIST: 'admin@lexai.com' })
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const r = await requireAdminAccess(req())
    expect(r?.status).toBe(401)
  })

  it('Supabase auth error when only allowlist configured → 401', async () => {
    stubAdminEnv({ ADMIN_EMAIL_ALLOWLIST: 'admin@lexai.com' })
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'auth down' } })
    const r = await requireAdminAccess(req())
    expect(r?.status).toBe(401)
  })

  it('x-admin-key with mismatched length still 403 (timingSafeEqual length guard)', async () => {
    stubAdminEnv({ ADMIN_API_KEY: 'longsecret' })
    const r = await requireAdminAccess(req({ 'x-admin-key': 'short' }))
    expect(r?.status).toBe(403)
  })
})
