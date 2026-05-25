import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '@/lib/log'

export async function withQuotaClaim<T>(
  supabase: SupabaseClient,
  limit: number,
  fn: () => Promise<{ ok: true; value: T } | { ok: false; value: T }>,
): Promise<
  | { kind: 'denied'; plan_reason: 'limit_reached'; currentCount: number }
  | { kind: 'claim_error'; error: string }
  | { kind: 'ran'; result: T }
> {
  const { data: claim, error: claimError } = await supabase
    .rpc('claim_monthly_contract', { p_limit: limit })
    .single<{ allowed: boolean; current_count: number }>()

  if (claimError) return { kind: 'claim_error', error: claimError.message }
  if (!claim?.allowed) {
    return {
      kind: 'denied',
      plan_reason: 'limit_reached',
      currentCount: claim?.current_count ?? 0,
    }
  }

  let released = false
  const releaseOnce = async () => {
    if (released) return
    released = true
    await releaseQuota(supabase)
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

async function releaseQuota(supabase: SupabaseClient): Promise<void> {
  const result = await supabase.rpc('release_monthly_contract') as
    | { error?: { message?: string } | null }
    | undefined
  const err = result?.error
  if (err?.message) {
    log.error('quota release failed', { err, subsystem: 'quota', op: 'release' })
  }
}
