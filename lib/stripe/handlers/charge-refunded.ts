import 'server-only'
import type Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { log } from '@/lib/logger'

function service() {
  // Service role is required: webhook refund/dispute events must queue backend review rows.
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type RefundOrDisputeEvent =
  | Stripe.ChargeRefundedEvent
  | Stripe.ChargeDisputeCreatedEvent

type ReviewType = 'refund' | 'dispute'

function getChargeId(event: RefundOrDisputeEvent): string | null {
  if (event.type === 'charge.refunded') {
    return event.data.object.id
  }
  const dispute = event.data.object
  if (!dispute.charge) return null
  return typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
}

function getCustomerId(event: RefundOrDisputeEvent): string | null {
  if (event.type === 'charge.refunded') {
    const charge = event.data.object
    if (!charge.customer) return null
    return typeof charge.customer === 'string' ? charge.customer : charge.customer.id
  }
  return null
}

function getAmount(event: RefundOrDisputeEvent): number {
  if (event.type === 'charge.refunded') {
    return event.data.object.amount_refunded ?? 0
  }
  return event.data.object.amount ?? 0
}

function getReason(event: RefundOrDisputeEvent): string {
  if (event.type === 'charge.refunded') {
    return 'refund'
  }
  return event.data.object.reason ?? 'dispute'
}

async function lookupUserIdByCustomerId(
  supabase: { from: (table: string) => any },
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`profile lookup failed for customer ${customerId}: ${error.message}`)
  }
  return profile.id
}

export async function handleChargeRefunded(
  event: RefundOrDisputeEvent,
): Promise<{ userId: string | null }> {
  const reviewType: ReviewType = event.type === 'charge.refunded' ? 'refund' : 'dispute'
  const chargeId = getChargeId(event)
  const amount = getAmount(event)
  const reason = getReason(event)
  const customerId = getCustomerId(event)

  const supabase = service()
  const userId = await lookupUserIdByCustomerId(supabase, customerId)

  const { error: insertError } = await supabase
    .from('refund_reviews')
    .insert({
      event_id: event.id,
      user_id: userId,
      stripe_charge_id: chargeId,
      amount_refunded: amount,
      reason,
      review_type: reviewType,
    })
  if (insertError) throw new Error(`refund_reviews insert failed: ${insertError.message}`)

  if (reviewType === 'refund') {
    log.warn('stripe-webhook', 'refund received - manual review required', {
      eventId: event.id,
      userId,
      chargeId,
      amount,
    })
  } else {
    log.warn('stripe-webhook', 'dispute received - manual review required', {
      eventId: event.id,
      userId,
      chargeId,
      amount,
    })
  }

  return { userId }
}
