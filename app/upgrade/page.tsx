import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PRODUCTS } from '@/lib/products'
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

  const currentPlan = profile?.plan || 'free'
  const params = await searchParams
  const requestedPlan = params.plan === 'team' ? 'team' : 'pro'

  // Already on this plan or higher
  if (
    (requestedPlan === 'pro' && (currentPlan === 'pro' || currentPlan === 'team')) ||
    (requestedPlan === 'team' && currentPlan === 'team')
  ) {
    redirect('/settings')
  }

  const product = PRODUCTS.find(p => p.plan === requestedPlan)!

  return (
    <Suspense>
      <UpgradePageClient product={product} currentPlan={currentPlan} />
    </Suspense>
  )
}
