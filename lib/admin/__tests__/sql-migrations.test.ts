import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/admin-db', () => ({
  executeAdminSql: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'node:fs/promises'
import { executeAdminSql } from '@/lib/supabase/admin-db'
import {
  ADMIN_SQL_MIGRATIONS,
  listAdminSqlMigrations,
  runAdminSqlMigration,
} from '../sql-migrations'

const mockReadFile = readFile as ReturnType<typeof vi.fn>
const mockExecuteAdminSql = executeAdminSql as ReturnType<typeof vi.fn>

describe('runAdminSqlMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unknown migration names with status 400', async () => {
    const result = await runAdminSqlMigration('not_a_real_migration.sql')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toContain('Unknown migration')
    }
    expect(mockExecuteAdminSql).not.toHaveBeenCalled()
  })

  it('returns status 500 when readFile throws', async () => {
    mockReadFile.mockRejectedValue(new Error('disk on fire'))

    const result = await runAdminSqlMigration('002_create_team_tables.sql')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).toContain('Failed to load migration')
    }
    expect(mockExecuteAdminSql).not.toHaveBeenCalled()
  })

  it('propagates executeAdminSql failure status and error', async () => {
    mockReadFile.mockResolvedValue('-- sql body')
    mockExecuteAdminSql.mockResolvedValue({ ok: false, status: 502, error: 'upstream boom' })

    const result = await runAdminSqlMigration('002_create_team_tables.sql')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(502)
      expect(result.error).toBe('upstream boom')
    }
  })

  it('returns ok with name and data on success', async () => {
    mockReadFile.mockResolvedValue('-- sql body')
    mockExecuteAdminSql.mockResolvedValue({ ok: true, data: { rows: 1 } })

    const result = await runAdminSqlMigration('002_create_team_tables.sql')

    expect(result).toEqual({
      ok: true,
      name: '002_create_team_tables.sql',
      data: { rows: 1 },
    })
    expect(mockExecuteAdminSql).toHaveBeenCalledTimes(1)
    expect(mockExecuteAdminSql).toHaveBeenCalledWith('-- sql body')
  })
})

describe('listAdminSqlMigrations', () => {
  it('returns one entry per registry key with non-empty label and description', () => {
    const entries = listAdminSqlMigrations()
    const keys = Object.keys(ADMIN_SQL_MIGRATIONS)

    expect(entries).toHaveLength(keys.length)
    for (const key of keys) {
      const entry = entries.find((e) => e.name === key)
      expect(entry).toBeDefined()
      expect(entry!.label.length).toBeGreaterThan(0)
      expect(entry!.description.length).toBeGreaterThan(0)
    }
  })
})
