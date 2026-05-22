import 'server-only'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { priceIdToPlan } from '@/lib/stripe/price-to-plan'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleCheckoutSessionCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<{ userId: string | null }> {
  const session = event.data.object
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null
  if (!userId) {
    throw new Error(`checkout.session.completed ${event.id}: no userId in client_reference_id or metadata`)
  }
  if (session.mode !== 'subscription' || !session.subscription) {
    // Ignore non-subscription sessions defensively — legacy one-time charges
    // should no longer be created after Task 10.
    return { userId }
  }

  const stripe = getStripe()
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id
  const sub = await stripe.subscriptions.retrieve(subscriptionId)

  const item = sub.items.data[0]
  if (!item) throw new Error(`Subscription ${sub.id}: no items`)
  const plan = priceIdToPlan(item.price.id)
  if (!plan) throw new Error(`Subscription ${sub.id}: unrecognized price ${item.price.id}`)

  const supabase = service()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  const { error: upsertError } = await supabase.from('subscriptions').upsert({
    id: sub.id,
    user_id: userId,
    stripe_customer_id: customerId,
    status: sub.status,
    plan,
    price_id: item.price.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  })
  if (upsertError) throw new Error(`subscriptions upsert failed: ${upsertError.message}`)

  // Mirror the plan onto profiles.plan as a denormalized cache.
  // getActivePlan() will still consult subscriptions.status to decide gating.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan, stripe_customer_id: customerId })
    .eq('id', userId)
  if (profileError) throw new Error(`profiles update failed: ${profileError.message}`)

  return { userId }
}
