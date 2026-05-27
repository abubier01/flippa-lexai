import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { executeAdminSql } from '@/lib/supabase/admin-db'

export const ADMIN_SQL_MIGRATIONS = {
  '002_create_team_tables.sql': {
    label: 'Create Team Tables',
    description: 'Creates team tables, team-sharing columns, and baseline RLS policies.',
  },
  '008_team_analyses_messages_rls.sql': {
    label: 'Team Child-Table RLS',
    description: 'Adds team-shared SELECT policies for contract_analyses and chat_messages.',
  },
  '010_fix_team_rls_recursion.sql': {
    label: 'Fix Team RLS Recursion',
    description: 'Rebuilds team policies with is_team_member() to prevent recursive RLS failures.',
  },
} as const

export type AdminSqlMigrationName = keyof typeof ADMIN_SQL_MIGRATIONS

function isMigrationName(name: string): name is AdminSqlMigrationName {
  return name in ADMIN_SQL_MIGRATIONS
}

function migrationPath(name: AdminSqlMigrationName): string {
  return path.join(process.cwd(), 'scripts', name)
}

export function listAdminSqlMigrations(): Array<{
  name: AdminSqlMigrationName
  label: string
  description: string
}> {
  return (Object.keys(ADMIN_SQL_MIGRATIONS) as AdminSqlMigrationName[]).map((name) => ({
    name,
    label: ADMIN_SQL_MIGRATIONS[name].label,
    description: ADMIN_SQL_MIGRATIONS[name].description,
  }))
}

export async function runAdminSqlMigration(name: string): Promise<
  | { ok: true; name: AdminSqlMigrationName; data: unknown }
  | { ok: false; status: number; error: string }
> {
  if (!isMigrationName(name)) {
    return { ok: false, status: 400, error: `Unknown migration: ${name}` }
  }

  let sql: string
  try {
    sql = await readFile(migrationPath(name), 'utf8')
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: `Failed to load migration ${name}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const result = await executeAdminSql(sql)
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error }
  }

  return { ok: true, name, data: result.data }
}
