import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '@/lib/log'

type QuotaClaimSuccess = {
  allowed: boolean
  currentCount: number
  via: 'rpc' | 'legacy'
}

type QuotaClaimFailure = { error: string }

type ProfileQuotaRow = {
  id: string
  contracts_this_month: number | null
  usage_reset_at: string | null
}

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
    await releaseQuota(supabase, claim.via === 'legacy')
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
    .single<{ allowed: boolean; current_count: number }>()

  if (!error) {
    return {
      allowed: Boolean(data?.allowed),
      currentCount: data?.current_count ?? 0,
      via: 'rpc',
    }
  }

  if (!shouldUseLegacyFallback(error.message, error.code)) {
    return { error: error.message }
  }

  const fallback = await claimQuotaLegacy(supabase, limit)
  if ('error' in fallback) {
    return {
      error: `${error.message}; legacy fallback failed: ${fallback.error}`,
    }
  }
  return fallback
}

function shouldUseLegacyFallback(message?: string, code?: string): boolean {
  const msg = (message || '').toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    code === '42501' ||
    msg.includes('claim_monthly_contract') ||
    msg.includes('schema cache') ||
    msg.includes('function') && msg.includes('not found') ||
    msg.includes('permission denied')
  )
}

async function claimQuotaLegacy(
  supabase: SupabaseClient,
  limit: number,
): Promise<QuotaClaimSuccess | QuotaClaimFailure> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, contracts_this_month, usage_reset_at')
    .maybeSingle<ProfileQuotaRow>()
  if (profileError) return { error: profileError.message }
  if (!profile?.id) return { error: 'Profile row missing for quota check' }

  const now = new Date()
  const currentCount = profile.contracts_this_month ?? 0
  const needsReset = isDifferentUtcMonth(profile.usage_reset_at, now)

  if (limit !== -1 && !needsReset && currentCount >= limit) {
    return { allowed: false, currentCount, via: 'legacy' }
  }

  const nextCount = needsReset ? 1 : currentCount + 1
  const payload: Partial<ProfileQuotaRow> = { contracts_this_month: nextCount }
  if (needsReset || !profile.usage_reset_at) {
    payload.usage_reset_at = now.toISOString()
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', profile.id)
  if (updateError) return { error: updateError.message }

  return { allowed: true, currentCount: nextCount, via: 'legacy' }
}

async function releaseQuota(
  supabase: SupabaseClient,
  preferLegacy = false,
): Promise<void> {
  if (!preferLegacy) {
    const result = await supabase.rpc('release_monthly_contract') as
      | { error?: { message?: string; code?: string } | null }
      | undefined
    const rpcErr = result?.error
    if (!rpcErr?.message) return
    if (!shouldUseLegacyFallback(rpcErr.message, rpcErr.code)) {
      log.error('quota release failed', { err: rpcErr, subsystem: 'quota', op: 'release', via: 'rpc' })
      return
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, contracts_this_month')
    .maybeSingle<{ id: string; contracts_this_month: number | null }>()
  if (profileError) {
    log.error('quota release failed', { err: profileError, subsystem: 'quota', op: 'release', via: 'legacy', phase: 'profile_lookup' })
    return
  }
  if (!profile?.id) return

  const nextCount = Math.max(0, (profile.contracts_this_month ?? 0) - 1)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ contracts_this_month: nextCount })
    .eq('id', profile.id)
  if (updateError?.message) {
    log.error('quota release failed', { err: updateError, subsystem: 'quota', op: 'release', via: 'legacy', phase: 'profile_update' })
  }
}

function isDifferentUtcMonth(value: string | null, now: Date): boolean {
  if (!value) return true
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return true
  return (
    parsed.getUTCFullYear() !== now.getUTCFullYear() ||
    parsed.getUTCMonth() !== now.getUTCMonth()
  )
}
