import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePlan } from '@/lib/plan/access'
import { hasSubscribedAccess } from '@/lib/plan/subscription-gate'
import OnboardingSubscribeClient from './subscribe-client'
import type { PlanType } from '@/lib/plan-limits'

export default async function OnboardingSubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/onboarding/subscribe')

  const active = await getActivePlan(user.id)
  if (hasSubscribedAccess(active.status)) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const initialPlan: PlanType = params.plan === 'pro' || params.plan === 'team' ? params.plan : 'solo'

  return <OnboardingSubscribeClient initialPlan={initialPlan} />
}
