import { NextResponse } from 'next/server'
import { getActivePlan } from '@/lib/plan/access'
import { hasSubscribedAccess, isSubscriptionEnforcementEnabled } from '@/lib/plan/subscription-gate'

export function subscriptionRequiredResponse(plan: string = 'solo', entitlementStatus: string = 'none') {
  return NextResponse.json(
    {
      error: 'Subscription required',
      code: 'subscription_required',
      subscriptionRequired: true,
      onboardingUrl: '/onboarding/subscribe',
      plan,
      entitlementStatus,
    },
    { status: 402 },
  )
}

export function entitlementCheckFailedResponse() {
  return NextResponse.json(
    {
      error: 'Entitlement check failed',
      code: 'entitlement_check_failed',
      subscriptionRequired: true,
      onboardingUrl: '/onboarding/subscribe',
    },
    { status: 403 },
  )
}

export async function requireActiveSubscriptionForApi(userId: string) {
  if (!isSubscriptionEnforcementEnabled()) return null

  try {
    const active = await getActivePlan(userId)
    if (hasSubscribedAccess(active.status)) return null
    return subscriptionRequiredResponse(active.tier, active.status)
  } catch (err) {
    console.error('[entitlement] api check failed:', userId, err)
    return entitlementCheckFailedResponse()
  }
}
