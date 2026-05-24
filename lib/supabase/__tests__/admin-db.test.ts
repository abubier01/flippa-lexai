// lib/supabase/__tests__/admin-db.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { executeAdminSql } from '../admin-db'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdef.supabase.co')
  // Default: exercise the preferred (ACCESS_TOKEN) path so the bulk of
  // tests cover the happy bearer source. Fallback path is exercised in
  // its own dedicated tests below.
  vi.stubEnv('SUPABASE_ACCESS_TOKEN', 'pat-token')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('executeAdminSql', () => {
  it('calls the management API with project ref extracted from NEXT_PUBLIC_SUPABASE_URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ rows: [] })),
    })

    await executeAdminSql('SELECT 1', fetchMock)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.supabase.com/v1/projects/abcdef/database/query')
  })

  it('prefers SUPABASE_ACCESS_TOKEN as the Bearer token when set', async () => {
    vi.stubEnv('SUPABASE_ACCESS_TOKEN', 'pat-token')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    })

    await executeAdminSql('SELECT 1', fetchMock)

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer pat-token')
    // No fallback warning when ACCESS_TOKEN is present
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('falls back to SUPABASE_SERVICE_ROLE_KEY when only that is set', async () => {
    vi.stubEnv('SUPABASE_ACCESS_TOKEN', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    })

    await executeAdminSql('SELECT 1', fetchMock)

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer srv-key')
    expect(JSON.parse(init.body)).toEqual({ query: 'SELECT 1' })
  })

  it('emits a warn-level log when falling back to SUPABASE_SERVICE_ROLE_KEY', async () => {
    vi.stubEnv('SUPABASE_ACCESS_TOKEN', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    })

    await executeAdminSql('SELECT 1', fetchMock)

    expect(warnSpy).toHaveBeenCalledOnce()
    const line = warnSpy.mock.calls[0][0] as string
    const payload = JSON.parse(line)
    expect(payload.level).toBe('warn')
    expect(payload.msg).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(payload.msg).toContain('SUPABASE_ACCESS_TOKEN')
  })

  it('returns {ok: false} when neither SUPABASE_ACCESS_TOKEN nor SUPABASE_SERVICE_ROLE_KEY is set', async () => {
    vi.stubEnv('SUPABASE_ACCESS_TOKEN', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const fetchMock = vi.fn()

    const result = await executeAdminSql('SELECT 1', fetchMock)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).toMatch(/missing bearer token/)
      expect(result.error).toMatch(/SUPABASE_ACCESS_TOKEN/)
      expect(result.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns {ok: true, data} on 2xx response with JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ rows: [{ id: 1 }] })),
    })

    const result = await executeAdminSql('SELECT 1', fetchMock)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ rows: [{ id: 1 }] })
    }
  })

  it('returns {ok: true, data} with raw text when body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    })

    const result = await executeAdminSql('SELECT 1', fetchMock)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toBe('OK')
    }
  })

  it('returns {ok: false, error, status} on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({ message: 'forbidden' })),
    })

    const result = await executeAdminSql('SELECT 1', fetchMock)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toContain('forbidden')
    }
  })

  it('returns {ok: false, error, status: 500} when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await executeAdminSql('SELECT 1', fetchMock)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).toContain('network down')
    }
  })

  it('returns {ok: false} with descriptive error when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    const fetchMock = vi.fn()

    const result = await executeAdminSql('SELECT 1', fetchMock)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/NEXT_PUBLIC_SUPABASE_URL/)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
