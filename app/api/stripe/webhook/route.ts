// app/api/stripe/webhook/route.ts
//
// CRITICAL: Stripe signature verification REQUIRES the unparsed request body.
// Do NOT use req.json() in this file; use req.text() and parse manually.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { tryClaimEvent, markEventProcessed, markEventFailed } from '@/lib/stripe/event-deduper'
import { handleCheckoutSessionCompleted } from '@/lib/stripe/handlers/checkout-session-completed'
import { handleSubscriptionUpserted } from '@/lib/stripe/handlers/subscription-updated'
import { handleSubscriptionDeleted } from '@/lib/stripe/handlers/subscription-deleted'
import { handleInvoicePaymentFailed } from '@/lib/stripe/handlers/invoice-payment-failed'
import { handleInvoicePaymentSucceeded } from '@/lib/stripe/handlers/invoice-payment-succeeded'
import { handleChargeRefunded } from '@/lib/stripe/handlers/charge-refunded'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    log.error('stripe-webhook', 'STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const body = await req.text()
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature'
    log.warn('stripe-webhook', 'signature verification failed', { err, message })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const userId = extractUserId(event)
  let claimState: Awaited<ReturnType<typeof tryClaimEvent>>['state']
  try {
    const claim = await tryClaimEvent(event.id, event.type, userId, event as unknown)
    claimState = claim.state
  } catch (err) {
    log.error('stripe-webhook', 'claim failed', { err, eventId: event.id, eventType: event.type })
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 })
  }
  if (claimState === 'already_processed') {
    // Safe dedup success.
    return NextResponse.json({ received: true, deduped: true })
  }
  if (claimState === 'in_flight') {
    // Another worker still holds the lease. Return retryable status so Stripe retries.
    return NextResponse.json({ error: 'Event is already in-flight' }, { status: 500 })
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
      case 'charge.refunded':
      case 'charge.dispute.created':
        await handleChargeRefunded(event)
        break
      default:
        // Ignored by design — still mark processed so we never retry it.
        break
    }
    await markEventProcessed(event.id)
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler failed'
    log.error('stripe-webhook', 'handler error', {
      err,
      eventId: event.id,
      eventType: event.type,
      message,
    })
    await markEventFailed(event.id, message)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}

function extractUserId(event: Stripe.Event): string | null {
  // Best-effort. The handlers resolve user_id authoritatively via
  // stripe_customer_id. This is just for the billing_events.user_id column.
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session
    return s.client_reference_id ?? s.metadata?.userId ?? null
  }
  return null
}
