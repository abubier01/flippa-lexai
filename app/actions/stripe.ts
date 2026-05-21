'use server'

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { getProductById } from '@/lib/products'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customers'
import { planToPriceId } from '@/lib/stripe/price-to-plan'
import { buildSessionIdempotencyKey } from '@/lib/stripe/idempotency-key'

export async function startCheckoutSession(
  productId: string,
): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in to upgrade.')

  const product = getProductById(productId)
  if (!product) throw new Error(`Invalid product: ${productId}`)

  const customerId = await getOrCreateStripeCustomer(user.id, user.email)
  const priceId = planToPriceId(product.plan)

  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: 'embedded',
      redirect_on_completion: 'never',
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
        productId: product.id,
        plan: product.plan,
      },
    },
    { idempotencyKey: buildSessionIdempotencyKey(user.id, priceId) },
  )

  if (!session.client_secret) throw new Error('Failed to create checkout session.')
  return { clientSecret: session.client_secret, sessionId: session.id }
}
