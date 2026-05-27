import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PRODUCTS } from '@/lib/products'
import { comparePlans, normalizePlanType, type PlanType } from '@/lib/plan-limits'
import UpgradePageClient from './upgrade-client'

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  const currentPlan = normalizePlanType(profile?.plan)
  const params = await searchParams
  const requestedPlan: PlanType = params.plan === 'team' ? 'team' : 'pro'

  if (comparePlans(currentPlan, requestedPlan) >= 0) {
    redirect('/settings')
  }

  const product = PRODUCTS.find(p => p.plan === requestedPlan)!

  return (
    <Suspense>
      <UpgradePageClient product={product} currentPlan={currentPlan} />
    </Suspense>
  )
}
