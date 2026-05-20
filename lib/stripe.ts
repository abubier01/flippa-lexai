import 'server-only'
import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }

  if (process.env.NODE_ENV === 'production' && !stripeKey.startsWith('sk_live_')) {
    throw new Error('Production requires a Stripe live secret key (sk_live_*)')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeKey, {
      apiVersion: '2025-02-24.acacia',
    })
  }

  return stripeClient
}
