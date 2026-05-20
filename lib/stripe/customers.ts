import 'server-only'
import { getStripe } from '@/lib/stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string | null | undefined,
): Promise<string> {
  const supabase = service()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`Profile lookup failed: ${error.message}`)

  if (profile?.stripe_customer_id) return profile.stripe_customer_id

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId },
  })

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
  if (updateError) {
    // We've already created the Stripe customer. Log and surface so the
    // caller can decide; do not silently swallow.
    throw new Error(
      `Stripe customer ${customer.id} created but profile update failed: ${updateError.message}`,
    )
  }

  return customer.id
}
