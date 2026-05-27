import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/security/admin-guard'
import { listAdminSqlMigrations, runAdminSqlMigration } from '@/lib/admin/sql-migrations'

export async function GET(request: Request) {
  const denied = await requireAdminAccess(request)
  if (denied) return denied

  return NextResponse.json({ migrations: listAdminSqlMigrations() })
}

export async function POST(request: Request) {
  const denied = await requireAdminAccess(request)
  if (denied) return denied

  let body: { name?: string } = {}
  try {
    body = (await request.json()) as { name?: string }
  } catch {
    // Treat empty/invalid JSON as missing name.
  }

  if (!body.name) {
    return NextResponse.json(
      { error: 'Migration name is required.', migrations: listAdminSqlMigrations() },
      { status: 400 },
    )
  }

  const result = await runAdminSqlMigration(body.name)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, migrations: listAdminSqlMigrations() },
      { status: result.status },
    )
  }

  return NextResponse.json({ success: true, migration: result.name, result: result.data })
}
