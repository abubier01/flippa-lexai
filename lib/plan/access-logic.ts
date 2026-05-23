import type { PlanType } from '@/lib/plan-limits'

export const GRACE_PERIOD_DAYS = 3

export interface SubscriptionRow {
  status: string
  plan: PlanType
  current_period_end: string  // ISO timestamp
}

export interface ActivePlan {
  tier: PlanType
  status: string  // 'none' | 'active' | 'trialing' | 'past_due' | 'past_due_expired' | 'canceled' | ...
}

export function decideActivePlan(
  sub: SubscriptionRow | null,
  now: Date = new Date(),
): ActivePlan {
  if (!sub) return { tier: 'solo', status: 'none' }

  if (sub.status === 'active' || sub.status === 'trialing') {
    return { tier: sub.plan, status: sub.status }
  }

  if (sub.status === 'past_due') {
    const end = new Date(sub.current_period_end).getTime()
    const ageMs = now.getTime() - end
    const ageDays = ageMs / (24 * 60 * 60 * 1000)
    if (ageDays <= GRACE_PERIOD_DAYS) {
      return { tier: sub.plan, status: 'past_due' }
    }
    return { tier: 'solo', status: 'past_due_expired' }
  }

  return { tier: 'solo', status: sub.status }
}
