import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decideActivePlan, GRACE_PERIOD_DAYS, type SubscriptionRow } from '@/lib/plan/access-logic'

const DAY_MS = 24 * 60 * 60 * 1000

export type BillingStatusResponse = {
  status: 'active' | 'past_due' | 'grace_period' | 'canceled'
  daysRemaining?: number
  portalUrl?: string
}

function toBillingStatus(sub: SubscriptionRow | null, now: Date): BillingStatusResponse {
  if (!sub) {
    // Keep existing UX stable in environments where subscription gating is disabled.
    return { status: 'active' }
  }

  const active = decideActivePlan(sub, now)
  if (active.status === 'active' || active.status === 'trialing') {
    return { status: 'active' }
  }

  if (sub.status === 'past_due') {
    const endMs = new Date(sub.current_period_end).getTime()
    if (!Number.isFinite(endMs)) return { status: 'past_due' }

    if (now.getTime() <= endMs) {
      return { status: 'past_due' }
    }

    if (active.status === 'past_due') {
      const graceEndMs = endMs + (GRACE_PERIOD_DAYS * DAY_MS)
      const daysRemaining = Math.max(0, Math.ceil((graceEndMs - now.getTime()) / DAY_MS))
      return { status: 'grace_period', daysRemaining }
    }
  }

  return { status: 'canceled' }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) {
      return NextResponse.json({ error: 'Failed to load billing status' }, { status: 500 })
    }

    const sub = (subs?.[0] ?? null) as SubscriptionRow | null
    return NextResponse.json(toBillingStatus(sub, new Date()))
  } catch {
    return NextResponse.json({ error: 'Failed to load billing status' }, { status: 500 })
  }
}
