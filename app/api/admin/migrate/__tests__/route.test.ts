import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/security/admin-guard', () => ({
  requireAdminAccess: vi.fn(),
}))

vi.mock('@/lib/admin/sql-migrations', () => ({
  listAdminSqlMigrations: vi.fn(),
  runAdminSqlMigration: vi.fn(),
}))

import { requireAdminAccess } from '@/lib/security/admin-guard'
import { listAdminSqlMigrations, runAdminSqlMigration } from '@/lib/admin/sql-migrations'
import { GET, POST } from '../route'

const mockRequireAdminAccess = requireAdminAccess as ReturnType<typeof vi.fn>
const mockListAdminSqlMigrations = listAdminSqlMigrations as ReturnType<typeof vi.fn>
const mockRunAdminSqlMigration = runAdminSqlMigration as ReturnType<typeof vi.fn>

describe('GET/POST /api/admin/migrate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAdminSqlMigrations.mockReturnValue([
      {
        name: '002_create_team_tables.sql',
        label: 'Create Team Tables',
        description: 'Creates team tables.',
      },
    ])
  })

  it('GET returns 403 when admin access is denied', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    mockRequireAdminAccess.mockResolvedValue(forbidden)

    const response = await GET(new Request('http://localhost/api/admin/migrate'))

    expect(response.status).toBe(403)
  })

  it('GET returns migration list', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/admin/migrate'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.migrations).toHaveLength(1)
  })

  it('POST validates migration name', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)

    const response = await POST(
      new Request('http://localhost/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/required/i)
  })

  it('POST runs a migration successfully', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)
    mockRunAdminSqlMigration.mockResolvedValue({
      ok: true,
      name: '002_create_team_tables.sql',
      data: { ok: true },
    })

    const response = await POST(
      new Request('http://localhost/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '002_create_team_tables.sql' }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.migration).toBe('002_create_team_tables.sql')
  })

  it('POST surfaces migration failure', async () => {
    mockRequireAdminAccess.mockResolvedValue(null)
    mockRunAdminSqlMigration.mockResolvedValue({ ok: false, status: 500, error: 'boom' })

    const response = await POST(
      new Request('http://localhost/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '002_create_team_tables.sql' }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('boom')
  })
})
