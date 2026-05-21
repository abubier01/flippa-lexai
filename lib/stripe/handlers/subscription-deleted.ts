import 'server-only'
import type Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<{ userId: string | null }> {
  const sub = event.data.object
  const supabase = service()

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const { data: profile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  if (profileLookupError) {
    if (profileLookupError.code === 'PGRST116') {
      // Profile already deleted (e.g., GDPR deletion); nothing to downgrade.
      // Acknowledge to stop Stripe retries.
      console.warn(`[subscription-deleted] no profile for customer ${customerId} (already deleted?)`)
      return { userId: null }
    }
    throw new Error(`No profile found for customer ${customerId}: ${profileLookupError.message}`)
  }
  const userId = profile.id

  const { error: subError } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', sub.id)
  if (subError) throw new Error(`subscriptions update failed: ${subError.message}`)

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan: 'free' })
    .eq('id', userId)
  if (profileError) throw new Error(`profiles downgrade failed: ${profileError.message}`)

  return { userId }
}
