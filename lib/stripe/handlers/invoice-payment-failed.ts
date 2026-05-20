import 'server-only'
import type Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
): Promise<{ userId: string | null }> {
  const invoice = event.data.object
  if (!invoice.subscription) return { userId: null }
  const subId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id

  const supabase = service()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('id', subId)
    .single()

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('id', subId)
  if (error) throw new Error(`subscriptions past_due update failed: ${error.message}`)

  return { userId: sub?.user_id ?? null }
}
