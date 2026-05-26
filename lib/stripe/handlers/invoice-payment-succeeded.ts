import 'server-only'
import type Stripe from 'stripe'
import { getServiceClient } from '@/lib/supabase/service-role'
import { log } from '@/lib/log'

export async function handleInvoicePaymentSucceeded(
  event: Stripe.InvoicePaymentSucceededEvent,
): Promise<{ userId: string | null }> {
  try {
    const invoice = event.data.object
    if (!invoice.subscription) return { userId: null }
    const subId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id
    if (!invoice.period_end) return { userId: null }

    const supabase = getServiceClient()
    const { data: sub, error: subLookupError } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('id', subId)
      .single()
    if (subLookupError) {
      throw new Error(`subscription ${subId} lookup failed: ${subLookupError.message}`)
    }

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_end: new Date(invoice.period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subId)
    if (error) throw new Error(`subscriptions renewal update failed: ${error.message}`)

    return { userId: sub?.user_id ?? null }
  } catch (err) {
    log.error('stripe.invoice-payment-succeeded.failed', {
      err,
      subsystem: 'stripe',
      event_type: 'invoice.payment_succeeded',
    })
    throw err
  }
}
