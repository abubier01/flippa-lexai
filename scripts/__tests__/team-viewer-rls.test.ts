// Policy-shape guard for scripts/008_team_analyses_messages_rls.sql.
// We can't enforce RLS in unit tests (the supabase mock doesn't simulate
// Postgres), so this test pins the migration's *shape* — policy names, target
// tables, key predicate references, and idempotency — to prevent silent
// regressions when the file is later edited. A true Postgres-enforced RLS
// test requires a live database and is out of scope here.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.resolve(
  __dirname,
  '..',
  '008_team_analyses_messages_rls.sql',
)
const sql = readFileSync(migrationPath, 'utf8')

describe('008_team_analyses_messages_rls.sql', () => {
  it('creates the analyses_select_team policy', () => {
    expect(sql).toMatch(/CREATE POLICY\s+"analyses_select_team"\s+ON\s+public\.contract_analyses/i)
  })

  it('creates the messages_select_team policy', () => {
    expect(sql).toMatch(/CREATE POLICY\s+"messages_select_team"\s+ON\s+public\.chat_messages/i)
  })

  it('scopes both policies to FOR SELECT only', () => {
    const analysesBlock = sql.match(
      /CREATE POLICY\s+"analyses_select_team"[\s\S]*?;/i,
    )?.[0]
    const messagesBlock = sql.match(
      /CREATE POLICY\s+"messages_select_team"[\s\S]*?;/i,
    )?.[0]

    expect(analysesBlock).toBeDefined()
    expect(messagesBlock).toBeDefined()
    expect(analysesBlock).toMatch(/FOR\s+SELECT/i)
    expect(messagesBlock).toMatch(/FOR\s+SELECT/i)

    // Belt-and-suspenders: ensure no other policy verbs slipped in.
    for (const block of [analysesBlock!, messagesBlock!]) {
      expect(block).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i)
    }
  })

  it('references shared_with_team and the is_team_member helper in both policies', () => {
    const analysesBlock = sql.match(
      /CREATE POLICY\s+"analyses_select_team"[\s\S]*?;/i,
    )?.[0]
    const messagesBlock = sql.match(
      /CREATE POLICY\s+"messages_select_team"[\s\S]*?;/i,
    )?.[0]

    for (const block of [analysesBlock!, messagesBlock!]) {
      expect(block).toMatch(/shared_with_team\s*=\s*TRUE/i)
      expect(block).toMatch(/is_team_member\s*\(/i)
    }
  })

  it('is idempotent: DROP POLICY IF EXISTS for both team policies', () => {
    expect(sql).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"analyses_select_team"\s+ON\s+public\.contract_analyses/i,
    )
    expect(sql).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"messages_select_team"\s+ON\s+public\.chat_messages/i,
    )
  })
})
