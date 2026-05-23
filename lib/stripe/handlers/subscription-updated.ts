import 'server-only'
import type Stripe from 'stripe'
import { priceIdToPlan } from '@/lib/stripe/price-to-plan'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  // Service role is required: webhook subscription sync writes cross-user billing state from Stripe events.
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Handles customer.subscription.created and customer.subscription.updated.
// The two events carry the same shape; we treat created as a backstop in case
// checkout.session.completed was missed.
export async function handleSubscriptionUpserted(
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<{ userId: string | null }> {
  const sub = event.data.object
  const item = sub.items.data[0]
  if (!item) throw new Error(`Subscription ${sub.id}: no items`)
  const plan = priceIdToPlan(item.price.id)
  if (!plan) throw new Error(`Subscription ${sub.id}: unrecognized price ${item.price.id}`)

  const supabase = service()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve user_id via the stripe_customer_id we stored at checkout time.
  const { data: profile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  if (profileLookupError) {
    throw new Error(`No profile found for customer ${customerId}: ${profileLookupError.message}`)
  }
  const userId = profile.id

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

  // Sync the denormalized profiles.plan based on subscription health.
  const planForProfile = (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')
    ? plan
    : 'solo'
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan: planForProfile })
    .eq('id', userId)
  if (profileError) throw new Error(`profiles update failed: ${profileError.message}`)

  return { userId }
}
