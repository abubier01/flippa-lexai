import 'server-only'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { priceIdToPlan } from '@/lib/stripe/price-to-plan'
import { getServiceClient } from '@/lib/supabase/service-role'
import { log } from '@/lib/log'
import { invalidatePlanCache } from '@/lib/plan/access'

export async function handleCheckoutSessionCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<{ userId: string | null }> {
  try {
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

    const supabase = getServiceClient()
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

    // Bust the in-process plan cache so the next API request reflects this
    // mutation immediately (cache TTL backstop ≤60s; webhook is primary signal).
    invalidatePlanCache(userId)

    return { userId }
  } catch (err) {
    // Explicit capture with subsystem/event_type tags so Sentry can filter
    // Stripe handler failures. The error re-throws so the webhook orchestrator
    // releases the dedup claim and returns 500 to Stripe (triggering retry).
    log.error('stripe.checkout-session-completed.failed', {
      err,
      subsystem: 'stripe',
      event_type: 'checkout.session.completed',
    })
    throw err
  }
}
