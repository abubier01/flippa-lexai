import 'server-only'
import type { PlanType } from '@/lib/plan-limits'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { decideActivePlan, type ActivePlan } from './access-logic'

export { decideActivePlan, GRACE_PERIOD_DAYS } from './access-logic'
export type { ActivePlan, SubscriptionRow } from './access-logic'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getActivePlan(userId: string): Promise<ActivePlan> {
  const supabase = service()
  // Most-recent non-canceled sub per user. There is one in practice; this is
  // defensive ordering in case multiple sub rows exist.
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[getActivePlan] subscription query failed:', userId, error.message)
    throw new Error(`getActivePlan failed: ${error.message}`)
  }

  return decideActivePlan(subs?.[0] ?? null)
}

export async function assertPaidPlan(
  userId: string,
  minTier: PlanType,
): Promise<ActivePlan> {
  const active = await getActivePlan(userId)
  const order: Record<PlanType, number> = { free: 0, pro: 1, team: 2 }
  if (order[active.tier] < order[minTier]) {
    throw new Error(`Requires ${minTier} plan; user is on ${active.tier} (${active.status})`)
  }
  return active
}
