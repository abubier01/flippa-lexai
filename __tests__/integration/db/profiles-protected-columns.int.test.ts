// Integration tests for profiles column-protection trigger.
//
// Covers fix for codex CRITICAL self-escalation via is_platform_admin.
// Also acts as a regression guard for plan + stripe_customer_id (set up in 005).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from '../helpers/supabase-int'

describe('profiles protected columns (codex CRITICAL fix #1)', () => {
  const cleanup: string[] = []
  let user: Awaited<ReturnType<typeof createTestUser>>

  beforeAll(async () => {
    user = await createTestUser()
    cleanup.push(user.id)
  })

  afterAll(async () => {
    while (cleanup.length) {
      const id = cleanup.pop()!
      await deleteTestUser(id).catch(() => {})
    }
  })

  it('blocks authenticated self-escalation on is_platform_admin', async () => {
    const { error } = await user.userScopedClient
      .from('profiles')
      .update({ is_platform_admin: true })
      .eq('id', user.id)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/is_platform_admin/i)

    // Confirm the row was NOT mutated.
    const svc = makeServiceRoleClient()
    const { data } = await svc
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single()
    expect(data?.is_platform_admin).toBe(false)
  })

  it('blocks authenticated self-mutation of plan (regression guard)', async () => {
    const { error } = await user.userScopedClient
      .from('profiles')
      .update({ plan: 'pro' })
      .eq('id', user.id)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/plan/i)
  })

  it('blocks authenticated self-mutation of stripe_customer_id (regression guard)', async () => {
    const { error } = await user.userScopedClient
      .from('profiles')
      .update({ stripe_customer_id: 'cus_evil' })
      .eq('id', user.id)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/stripe_customer_id/i)
  })

  it('service-role can update is_platform_admin', async () => {
    const svc = makeServiceRoleClient()
    const { error } = await svc
      .from('profiles')
      .update({ is_platform_admin: true })
      .eq('id', user.id)
    expect(error).toBeNull()

    const { data } = await svc
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single()
    expect(data?.is_platform_admin).toBe(true)

    // Cleanup: flip back so afterAll user-delete is clean.
    await svc.from('profiles').update({ is_platform_admin: false }).eq('id', user.id)
  })
})
