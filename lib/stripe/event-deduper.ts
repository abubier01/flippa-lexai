import 'server-only'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Attempt to claim a Stripe event for processing.
 *
 * Why: Stripe retries webhooks on non-2xx and on its own schedule. We must
 * make every handler idempotent. INSERT with a primary key on event_id is
 * the cheapest mutual-exclusion primitive — the second INSERT fails with
 * 23505 (unique violation), which we treat as "already processed."
 *
 * Returns true if this caller owns the event; false if it was already claimed.
 */
export async function tryClaimEvent(
  eventId: string,
  type: string,
  userId: string | null,
  payload: unknown,
): Promise<boolean> {
  const supabase = service()
  const { error } = await supabase.from('billing_events').insert({
    event_id: eventId,
    type,
    user_id: userId,
    payload,
  })
  if (!error) return true
  // 23505 = unique_violation in Postgres.
  if (error.code === '23505') return false
  throw new Error(`Failed to claim event ${eventId}: ${error.message}`)
}

export async function markEventProcessed(eventId: string): Promise<void> {
  const supabase = service()
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
  const supabase = service()
  const { error } = await supabase
    .from('billing_events')
    .delete()
    .eq('event_id', eventId)
  if (error) {
    console.error('[event-deduper] releaseClaim failed:', eventId, error.message)
    // Do not re-throw: the caller is already in a catch block and re-throwing
    // would mask the original handler error.
  }
}
