// scripts/backfill_legacy_paid_users.ts
// Run with: tsx scripts/backfill_legacy_paid_users.ts --dry-run
//          tsx scripts/backfill_legacy_paid_users.ts --apply
//
// Requires: STRIPE_SECRET_KEY (live or test), NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_TEAM_MONTHLY.

import 'dotenv/config'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PRICE_BY_PLAN: Record<'pro' | 'team', string> = {
  pro: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY!,
}

const FAR_FUTURE_UNIX = Math.floor(new Date('2125-01-01T00:00:00Z').getTime() / 1000)

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, plan, stripe_customer_id')
    .in('plan', ['pro', 'team'])
    .is('stripe_customer_id', null)
  if (error) throw error
  console.log(`[backfill] found ${users.length} legacy paid users`)

  for (const u of users) {
    const plan = u.plan as 'pro' | 'team'
    const priceId = PRICE_BY_PLAN[plan]
    if (!priceId) {
      console.warn(`[backfill] skip ${u.id}: no price configured for plan ${plan}`)
      continue
    }

    // Look up the auth email via the auth admin API.
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(u.id)
    if (authError || !authUser?.user?.email) {
      console.warn(`[backfill] skip ${u.id}: no email`)
      continue
    }
    const email = authUser.user.email

    console.log(`[backfill] ${apply ? 'APPLY' : 'DRY'} ${u.id} (${plan}) -> grandfather subscription`)
    if (!apply) continue

    let customerId: string | null = null
    try {
      const customer = await stripe.customers.create({ email, metadata: { userId: u.id, backfill: 'legacy' } })
      customerId = customer.id

      // Write stripe_customer_id immediately so the upcoming subscription.created
      // webhook can resolve this user via the FK lookup.
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', u.id)
      if (profileUpdateError) {
        throw new Error(`profile update failed: ${profileUpdateError.message}`)
      }

      await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        trial_end: FAR_FUTURE_UNIX,
        proration_behavior: 'none',
        metadata: { userId: u.id, backfill: 'legacy' },
      })
      // The webhook will populate the subscriptions row when
      // customer.subscription.created fires (stripe_customer_id is already set).
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      if (customerId) {
        console.error(`[backfill] ORPHAN customer ${customerId} for user ${u.id}: subscription creation failed: ${message}`)
        console.error(`[backfill] reconcile: delete the Stripe customer or retry subscription creation manually.`)
      } else {
        console.error(`[backfill] FAILED for user ${u.id}: customer creation failed: ${message}`)
      }
    }
  }
  console.log('[backfill] done')
}

main().catch(err => { console.error(err); process.exit(1) })
