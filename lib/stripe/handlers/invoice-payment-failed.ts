import 'server-only'
import type Stripe from 'stripe'
import { getServiceClient } from '@/lib/supabase/service-role'

export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
): Promise<{ userId: string | null }> {
  const invoice = event.data.object
  if (!invoice.subscription) return { userId: null }
  const subId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id

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
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('id', subId)
  if (error) throw new Error(`subscriptions past_due update failed: ${error.message}`)

  return { userId: sub?.user_id ?? null }
}
