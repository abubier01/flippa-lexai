import 'server-only'
import type Stripe from 'stripe'
import { priceIdToPlan } from '@/lib/stripe/price-to-plan'
import { getServiceClient } from '@/lib/supabase/service-role'
import { log } from '@/lib/log'
import { invalidatePlanCache } from '@/lib/plan/access'

// Handles customer.subscription.created and customer.subscription.updated.
// The two events carry the same shape; we treat created as a backstop in case
// checkout.session.completed was missed.
export async function handleSubscriptionUpserted(
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<{ userId: string | null }> {
  try {
    const sub = event.data.object
    const item = sub.items.data[0]
    if (!item) throw new Error(`Subscription ${sub.id}: no items`)
    const plan = priceIdToPlan(item.price.id)
    if (!plan) throw new Error(`Subscription ${sub.id}: unrecognized price ${item.price.id}`)

    const supabase = getServiceClient()
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

    invalidatePlanCache(userId)
    return { userId }
  } catch (err) {
    // Tag failure with the actual Stripe event type so Sentry can distinguish
    // created vs updated. Re-throw to preserve orchestrator retry semantics.
    log.error('stripe.subscription-upserted.failed', {
      err,
      subsystem: 'stripe',
      event_type: event.type,
    })
    throw err
  }
}
