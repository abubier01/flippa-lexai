import 'server-only'
import { getServiceClient } from '@/lib/supabase/service-role'
import { decideActivePlan, type ActivePlan } from './access-logic'
import { log } from '@/lib/log'

export { decideActivePlan, GRACE_PERIOD_DAYS } from './access-logic'
export type { ActivePlan, SubscriptionRow } from './access-logic'

// Short-TTL in-process cache to avoid hitting `subscriptions` on every request.
// 60s is conservative — webhook handlers call invalidatePlanCache(userId) on
// every plan mutation so users perceive plan changes immediately. The TTL is
// the bound on staleness when the webhook is missed entirely (which we treat
// as a backstop, not a primary code path).
const PLAN_CACHE_TTL_MS = 60_000
type CacheEntry = { plan: ActivePlan; expiresAt: number }
const planCache = new Map<string, CacheEntry>()

export function invalidatePlanCache(userId: string): void {
  planCache.delete(userId)
}

// Test-only: clear the entire cache between tests to prevent cross-test
// pollution. Production code must use invalidatePlanCache(userId).
export function __resetPlanCacheForTest(): void {
  planCache.clear()
}

export async function getActivePlan(userId: string): Promise<ActivePlan> {
  const now = Date.now()
  const hit = planCache.get(userId)
  if (hit && hit.expiresAt > now) return hit.plan

  const supabase = getServiceClient()
  // Most-recent non-canceled sub per user. There is one in practice; this is
  // defensive ordering in case multiple sub rows exist.
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    log.error('subscription query failed', { err: error, userId, subsystem: 'supabase', op: 'plan.getActive' })
    throw new Error(`getActivePlan failed: ${error.message}`)
  }

  const plan = decideActivePlan(subs?.[0] ?? null)
  planCache.set(userId, { plan, expiresAt: now + PLAN_CACHE_TTL_MS })
  return plan
}

export async function hasTeamAccess(userId: string): Promise<{
  ok: boolean
  via: 'own' | 'membership' | null
  teamId: string | null
}> {
  const own = await getActivePlan(userId)
  if (own.tier === 'team') {
    // Find their team_id from profiles if any.
    const supabase = getServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', userId)
      .single()
    return { ok: true, via: 'own', teamId: profile?.team_id ?? null }
  }

  const supabase = getServiceClient()
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, teams:team_id(owner_id)')
    .eq('user_id', userId)
    .single()
  if (!membership?.team_id) return { ok: false, via: null, teamId: null }

  const ownerId = (membership.teams as unknown as { owner_id: string } | null)?.owner_id
  if (!ownerId) return { ok: false, via: null, teamId: membership.team_id }

  const owner = await getActivePlan(ownerId)
  if (owner.tier === 'team') {
    return { ok: true, via: 'membership', teamId: membership.team_id }
  }
  return { ok: false, via: null, teamId: membership.team_id }
}
