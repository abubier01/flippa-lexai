'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { getProductById } from '@/lib/products'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customers'
import { planToPriceId } from '@/lib/stripe/price-to-plan'
import { buildSessionIdempotencyKey } from '@/lib/stripe/idempotency-key'
import { getActivePlan } from '@/lib/plan/access'

async function buildCheckoutContext(productId: string) {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in to upgrade.')

  // Block double-subscription: if user already has an active or trialing subscription,
  // they should use the billing portal to change plans instead.
  const active = await getActivePlan(user.id)
  if (active.status === 'active' || active.status === 'trialing') {
    throw new Error('You already have an active subscription. Use the billing portal to change plans.')
  }

  const product = getProductById(productId)
  if (!product) throw new Error(`Invalid product: ${productId}`)

  const customerId = await getOrCreateStripeCustomer(user.id, user.email)
  const priceId = planToPriceId(product.plan)
  const idempotencyKey = buildSessionIdempotencyKey(user.id, priceId)

  return { stripe, user, product, customerId, priceId, idempotencyKey }
}

async function getRequestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? 'https'
    return `${proto}://${host}`
  }
  return 'http://localhost:3000'
}

export async function startCheckoutSession(
  productId: string,
): Promise<{ clientSecret: string; sessionId: string }> {
  const { stripe, user, product, customerId, priceId, idempotencyKey } = await buildCheckoutContext(productId)

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
    { idempotencyKey },
  )

  if (!session.client_secret) throw new Error('Failed to create checkout session.')
  return { clientSecret: session.client_secret, sessionId: session.id }
}

export async function startHostedCheckoutSession(
  productId: string,
): Promise<{ url: string }> {
  const { stripe, user, product, customerId, priceId, idempotencyKey } = await buildCheckoutContext(productId)
  const origin = await getRequestOrigin()

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
        productId: product.id,
        plan: product.plan,
      },
      success_url: `${origin}/upgrade/success?plan=${product.plan}`,
      cancel_url: `${origin}/upgrade?plan=${product.plan}`,
    },
    { idempotencyKey },
  )

  if (!session.url) throw new Error('Failed to create hosted checkout session.')
  return { url: session.url }
}
