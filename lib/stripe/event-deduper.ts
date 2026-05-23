import 'server-only'
import { log } from '@/lib/log'
import { getServiceClient } from '@/lib/supabase/service-role'

export type ClaimOutcome =
  | { kind: 'fresh' }
  | { kind: 'already-processed'; processedAt: string }
  | { kind: 'in-flight' }

/**
 * Attempt to claim a Stripe event for processing.
 *
 * Why: Stripe retries webhooks on non-2xx and on its own schedule. We must
 * make every handler idempotent. INSERT with a primary key on event_id is
 * the cheapest mutual-exclusion primitive.
 */
export async function tryClaimEvent(
  eventId: string,
  type: string,
  userId: string | null,
  payload: unknown,
): Promise<ClaimOutcome> {
  const supabase = getServiceClient()
  const { error } = await supabase.from('billing_events').insert({
    event_id: eventId,
    type,
    user_id: userId,
    payload,
  })
  if (!error) return { kind: 'fresh' }
  if (error.code === '23505') {
    const { data, error: readError } = await supabase
      .from('billing_events')
      .select('processed_at')
      .eq('event_id', eventId)
      .maybeSingle()
    if (readError) {
      throw new Error(`Failed to read existing event ${eventId}: ${readError.message}`)
    }
    const existing = data as { processed_at: string | null } | null
    if (existing?.processed_at) {
      return { kind: 'already-processed', processedAt: existing.processed_at }
    }
    return { kind: 'in-flight' }
  }
  throw new Error(`Failed to claim event ${eventId}: ${error.message}`)
}

export async function markEventProcessed(eventId: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('billing_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', eventId)
  if (error) throw new Error(`Failed to mark event ${eventId} processed: ${error.message}`)
}

/**
 * Delete a claimed billing_events row to release the dedup lock.
 *
 * Use when a handler fails: deleting the row lets Stripe's webhook retry
 * re-claim the event for re-processing. Without this, the retry would see
 * processed_at=NULL but claim=false and silently drop the event.
 */
export async function releaseClaim(eventId: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase.from('billing_events').delete().eq('event_id', eventId)
  if (error) {
    log.error('event-deduper.release-claim.failed', {
      route: 'stripe.webhook',
      eventId,
      err: new Error(error.message),
    })
    // Do not re-throw: the caller is already in a catch block and re-throwing
    // would mask the original handler error.
  }
}
