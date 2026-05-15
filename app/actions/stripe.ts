'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { getProductById } from '@/lib/products'

export async function startCheckoutSession(
  productId: string,
): Promise<{ clientSecret: string; sessionId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in to upgrade.')

  const product = getProductById(productId)
  if (!product) throw new Error(`Invalid product: ${productId}`)

  // Embed the userId and plan in metadata — verified server-side on completion
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    redirect_on_completion: 'never',
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: product.description,
          },
          unit_amount: product.priceInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: user.id,
      productId: product.id,
      plan: product.plan,
    },
  })

  if (!session.client_secret) throw new Error('Failed to create checkout session.')
  return { clientSecret: session.client_secret, sessionId: session.id }
}
