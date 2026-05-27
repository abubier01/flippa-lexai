import { describe, it, expect, afterEach } from 'vitest'
import { createTestUser, deleteTestUser, makeServiceRoleClient } from './helpers/supabase-int'

/**
 * Compute the UTC-month-truncated DATE string for `now`, matching what the
 * `claim_monthly_contract` RPC returns as its period_token.
 */
function currentUtcMonthToken(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

describe('P0-4 cross-month release race', () => {
  const cleanup: string[] = []
  afterEach(async () => {
    while (cleanup.length) await deleteTestUser(cleanup.pop()!).catch(() => {})
  })

  it('stale release with old period token is a no-op against a fresh month', async () => {
    const u = await createTestUser()
    cleanup.push(u.id)
    const admin = makeServiceRoleClient()

    // Seed: claim landed in January 2026
    await admin
      .from('profiles')
      .update({
        contracts_this_month: 1,
        usage_reset_at: '2026-01-15T12:00:00Z',
      })
      .eq('id', u.id)

    // Simulate "the next claim already rolled the period over to February"
    await admin
      .from('profiles')
      .update({
        contracts_this_month: 1,
        usage_reset_at: '2026-02-01T00:00:00Z',
      })
      .eq('id', u.id)

    // Stale release using the January period token
    const { data: released, error } = await u.userScopedClient.rpc('release_monthly_contract', {
      p_expected_period: '2026-01-01',
    })
    expect(error).toBeNull()
    expect(released).toBe(0)

    const { data: profile } = await admin
      .from('profiles')
      .select('contracts_this_month')
      .eq('id', u.id)
      .single()
    expect(profile?.contracts_this_month).toBe(1)
  })

  it('release with current-period token decrements normally', async () => {
    const u = await createTestUser()
    cleanup.push(u.id)
    const admin = makeServiceRoleClient()

    // Seed in the CURRENT UTC month so the claim does not trip the reset path
    // and we can assert deterministic counter math against `now`.
    const now = new Date()
    await admin
      .from('profiles')
      .update({
        contracts_this_month: 5,
        usage_reset_at: now.toISOString(),
      })
      .eq('id', u.id)

    const expectedToken = currentUtcMonthToken(now)

    const { data: claim } = await u.userScopedClient.rpc('claim_monthly_contract', { p_limit: 100 })
    expect(claim).toBeTruthy()
    const claimRow = Array.isArray(claim) ? claim[0] : claim
    expect(claimRow.allowed).toBe(true)
    expect(claimRow.period_token).toBe(expectedToken)

    const { data: released } = await u.userScopedClient.rpc('release_monthly_contract', {
      p_expected_period: claimRow.period_token,
    })
    expect(released).toBe(1)

    const { data: profile } = await admin
      .from('profiles')
      .select('contracts_this_month')
      .eq('id', u.id)
      .single()
    // started at 5, claim pushed to 6, release brought back to 5
    expect(profile?.contracts_this_month).toBe(5)
  })
})
