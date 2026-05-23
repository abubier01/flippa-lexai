// app/api/stripe/webhook/route.ts
//
// CRITICAL: Stripe signature verification REQUIRES the unparsed request body.
// Do NOT use req.json() in this file; use req.text() and parse manually.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { tryClaimEvent, markEventProcessed, releaseClaim } from '@/lib/stripe/event-deduper'
import { handleCheckoutSessionCompleted } from '@/lib/stripe/handlers/checkout-session-completed'
import { handleSubscriptionUpserted } from '@/lib/stripe/handlers/subscription-updated'
import { handleSubscriptionDeleted } from '@/lib/stripe/handlers/subscription-deleted'
import { handleInvoicePaymentFailed } from '@/lib/stripe/handlers/invoice-payment-failed'
import { handleInvoicePaymentSucceeded } from '@/lib/stripe/handlers/invoice-payment-succeeded'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const body = await req.text()
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature'
    console.warn('[stripe-webhook] signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const userId = extractUserId(event)
  let claimed: boolean
  try {
    claimed = await tryClaimEvent(event.id, event.type, userId, event as unknown)
  } catch (err) {
    console.error('[stripe-webhook] claim failed:', event.id, err)
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 })
  }
  if (!claimed) {
    // Already processed (or in-flight). 200 so Stripe stops retrying.
    return NextResponse.json({ received: true, deduped: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpserted(event)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event)
        break
      default:
        // Ignored by design — still mark processed so we never retry it.
        break
    }
    await markEventProcessed(event.id)
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler failed'
    console.error('[stripe-webhook] handler error:', event.id, event.type, message)
    // Returning 500 makes Stripe retry. The dedup row remains with
    // processed_at = NULL; the retry will see claim=false but the event still
    // needs to run. Adjust strategy: delete the dedup row on handler failure
    // so the retry can re-claim. See cleanup below.
    // If releaseClaim itself fails, the event is silently lost on Stripe's retry
    // (claim returns false, route returns 200 deduped). DB-down + handler-fail is
    // a chain-of-failures; surface via the deduper's internal logging.
    await releaseClaim(event.id)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}

function extractUserId(event: Stripe.Event): string | null {
  // Best-effort hint only. Handlers resolve the authoritative user through
  // stripe_customer_id lookups. This value is stored for observability in
  // billing_events.user_id and is never trusted for authorization.
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session
    return s.client_reference_id ?? s.metadata?.userId ?? null
  }
  return null
}
