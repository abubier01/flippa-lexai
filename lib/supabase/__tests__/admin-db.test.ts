// lib/supabase/__tests__/admin-db.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { executeAdminSql } from '../admin-db'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdef.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
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

  it('sends Bearer token from SUPABASE_SERVICE_ROLE_KEY', async () => {
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
