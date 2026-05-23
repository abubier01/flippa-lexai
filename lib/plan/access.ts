import 'server-only'
import { PLAN_LIMITS, type PlanType } from '@/lib/plan-limits'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { decideActivePlan, type ActivePlan } from './access-logic'

export { decideActivePlan, GRACE_PERIOD_DAYS } from './access-logic'
export type { ActivePlan, SubscriptionRow } from './access-logic'

export type Feature =
  | 'exportPdf'
  | 'sharedLibrary'
  | 'sso'
  | 'clauseExtraction'
  | 'advancedRiskBreakdown'

const FEATURE_LABELS: Record<Feature, string> = {
  exportPdf: 'Export PDF',
  sharedLibrary: 'Shared library',
  sso: 'SSO',
  clauseExtraction: 'Clause extraction',
  advancedRiskBreakdown: 'Advanced risk breakdown',
}

export class PlanGateError extends Error {
  constructor(public feature: Feature, public tier: PlanType) {
    super(`${FEATURE_LABELS[feature]} is not available on the ${tier} plan.`)
    this.name = 'PlanGateError'
  }
}

function service() {
  // Service role is required: entitlement checks resolve subscription/team state across arbitrary users (owner + members).
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
  const order: Record<PlanType, number> = { solo: 0, pro: 1, team: 2 }
  if (order[active.tier] < order[minTier]) {
    throw new Error(`Requires ${minTier} plan; user is on ${active.tier} (${active.status})`)
  }
  return active
}

export async function assertHasFeature(
  userId: string,
  feature: Feature,
): Promise<ActivePlan> {
  const active = await getActivePlan(userId)
  if (!PLAN_LIMITS[active.tier].features[feature]) {
    throw new PlanGateError(feature, active.tier)
  }
  return active
}

export async function hasTeamAccess(userId: string): Promise<{
  ok: boolean
  via: 'own' | 'membership' | null
  teamId: string | null
}> {
  const own = await getActivePlan(userId)
  if (own.tier === 'team') {
    // Find their team_id from profiles if any.
    const supabase = service()
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', userId)
      .single()
    return { ok: true, via: 'own', teamId: profile?.team_id ?? null }
  }

  const supabase = service()
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
