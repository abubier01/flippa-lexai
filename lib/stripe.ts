import 'server-only'
import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }

  // Require sk_live_* only on actual production deploys.
  // Vercel sets VERCEL_ENV='production' for prod and VERCEL_ENV='preview' for branch
  // deploys; preview deploys and local dev are allowed to use sk_test_*.
  if (process.env.VERCEL_ENV === 'production' && !stripeKey.startsWith('sk_live_')) {
    throw new Error('Production requires a Stripe live secret key (sk_live_*)')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeKey, {
      apiVersion: '2025-02-24.acacia',
    })
  }

  return stripeClient
}
