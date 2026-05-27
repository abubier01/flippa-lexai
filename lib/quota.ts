import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '@/lib/log'

type QuotaClaimSuccess = {
  allowed: boolean
  currentCount: number
  periodToken: string | null
}

type QuotaClaimFailure = { error: string }

export async function withQuotaClaim<T>(
  supabase: SupabaseClient,
  limit: number,
  fn: () => Promise<{ ok: true; value: T } | { ok: false; value: T }>,
): Promise<
  | { kind: 'denied'; plan_reason: 'limit_reached'; currentCount: number }
  | { kind: 'claim_error'; error: string }
  | { kind: 'ran'; result: T }
> {
  const claim = await claimQuota(supabase, limit)

  if ('error' in claim) return { kind: 'claim_error', error: claim.error }
  if (!claim.allowed) {
    return {
      kind: 'denied',
      plan_reason: 'limit_reached',
      currentCount: claim.currentCount,
    }
  }

  let released = false
  const releaseOnce = async () => {
    if (released) return
    released = true
    await releaseQuota(supabase, claim.periodToken)
  }

  try {
    const out = await fn()
    if (!out.ok) {
      await releaseOnce()
    }
    return { kind: 'ran', result: out.value }
  } catch (err) {
    await releaseOnce()
    throw err
  }
}

async function claimQuota(
  supabase: SupabaseClient,
  limit: number,
): Promise<QuotaClaimSuccess | QuotaClaimFailure> {
  const { data, error } = await supabase
    .rpc('claim_monthly_contract', { p_limit: limit })
    .single<{ allowed: boolean; current_count: number; period_token: string | null }>()

  if (error) return { error: error.message }

  return {
    allowed: Boolean(data?.allowed),
    currentCount: data?.current_count ?? 0,
    periodToken: data?.period_token ?? null,
  }
}

async function releaseQuota(
  supabase: SupabaseClient,
  periodToken: string | null,
): Promise<void> {
  if (!periodToken) {
    log.error('quota release skipped: no period token', { subsystem: 'quota', op: 'release' })
    return
  }
  const result = (await supabase.rpc('release_monthly_contract', {
    p_expected_period: periodToken,
  })) as { error?: { message?: string; code?: string } | null } | undefined
  const err = result?.error
  if (err?.message) {
    log.error('quota release failed', { err, subsystem: 'quota', op: 'release' })
  }
}
