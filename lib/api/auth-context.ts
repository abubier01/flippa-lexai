import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getActivePlan, type ActivePlan } from '@/lib/plan/access'
import type { PlanType } from '@/lib/plan-limits'
import { logger } from '@/lib/log/request'

export type AuthedContext = {
  user: User
  supabase: SupabaseClient
  tier: PlanType
  plan: ActivePlan
  log: ReturnType<typeof logger>
}

/**
 * Resolve the per-request auth + tier context.
 *
 * Returns either:
 *   - a `NextResponse` (401) if no user is logged in — caller should `return` it directly, OR
 *   - an `AuthedContext` with user, supabase client, resolved tier, the full
 *     ActivePlan record (status etc.), and a request-scoped logger.
 *
 * The tier resolution falls back to 'solo' on getActivePlan throw so transient
 * DB errors do not 500 the user — they get baseline access and we log a warning.
 * This matches the existing pattern in every route that called getActivePlan
 * with a try/catch.
 */
export async function requireUserContext(
  req: NextRequest,
  opts: { action: string },
): Promise<AuthedContext | NextResponse> {
  const rlog = logger(req, opts.action)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ulog = rlog.child({ userId: user.id })

  let plan: ActivePlan = { tier: 'solo', status: 'fallback' } as ActivePlan
  try {
    plan = await getActivePlan(user.id)
  } catch (err) {
    ulog.warn('plan_lookup_failed_fallback_solo', { err, action: opts.action })
  }
  const tier = (plan.tier ?? 'solo') as PlanType

  return { user, supabase, tier, plan, log: ulog }
}

/**
 * Type-guard: was `requireUserContext`'s return value the auth context (vs. a 401 response)?
 * Lets callers branch with a narrower predicate than checking `'json' in res`.
 */
export function isAuthedContext(
  result: AuthedContext | NextResponse,
): result is AuthedContext {
  return !(result instanceof NextResponse)
}
