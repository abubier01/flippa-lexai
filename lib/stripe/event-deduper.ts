import 'server-only'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const CLAIM_LEASE_MS = 5 * 60 * 1000

type BillingEventStatus = 'processing' | 'processed' | 'failed'

interface BillingEventRow {
  status: BillingEventStatus
  processed_at: string | null
  processing_expires_at: string | null
  attempt_count: number
}

export type ClaimState = 'claimed' | 'already_processed' | 'in_flight' | 'reclaimed'

export interface ClaimResult {
  state: ClaimState
}

function service() {
  // Service role is required: webhook idempotency claims update shared billing_events rows outside any end-user session.
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function withLease(now: Date) {
  return {
    processing_started_at: now.toISOString(),
    processing_expires_at: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
  }
}

async function getEventRow(eventId: string): Promise<BillingEventRow | null> {
  const supabase = service()
  const { data, error } = await supabase
    .from('billing_events')
    .select('status, processed_at, processing_expires_at, attempt_count')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load event ${eventId}: ${error.message}`)
  }
  return (data as BillingEventRow | null) ?? null
}

async function reclaimFailedEvent(
  eventId: string,
  nextAttempt: number,
  now: Date,
  type: string,
  userId: string | null,
  payload: unknown,
): Promise<boolean> {
  const supabase = service()
  const { data, error } = await supabase
    .from('billing_events')
    .update({
      status: 'processing',
      ...withLease(now),
      attempt_count: nextAttempt,
      last_error: null,
      type,
      user_id: userId,
      payload,
    })
    .eq('event_id', eventId)
    .eq('status', 'failed')
    .select('event_id')
  if (error) {
    throw new Error(`Failed to reclaim failed event ${eventId}: ${error.message}`)
  }
  return (data?.length ?? 0) > 0
}

async function reclaimExpiredEvent(
  eventId: string,
  nextAttempt: number,
  now: Date,
  type: string,
  userId: string | null,
  payload: unknown,
): Promise<boolean> {
  const supabase = service()
  const nowIso = now.toISOString()
  const { data, error } = await supabase
    .from('billing_events')
    .update({
      status: 'processing',
      ...withLease(now),
      attempt_count: nextAttempt,
      last_error: null,
      type,
      user_id: userId,
      payload,
    })
    .eq('event_id', eventId)
    .eq('status', 'processing')
    .lte('processing_expires_at', nowIso)
    .select('event_id')
  if (error) {
    throw new Error(`Failed to reclaim expired event ${eventId}: ${error.message}`)
  }
  return (data?.length ?? 0) > 0
}

/**
 * Attempt to claim a Stripe event for processing.
 *
 * `claimed` means this worker inserted the row first.
 * `already_processed` means another worker fully completed it.
 * `in_flight` means another worker still owns an active lease.
 * `reclaimed` means a stale/failed lease was recovered for this attempt.
 */
export async function tryClaimEvent(
  eventId: string,
  type: string,
  userId: string | null,
  payload: unknown,
): Promise<ClaimResult> {
  const supabase = service()
  const now = new Date()

  const { error } = await supabase.from('billing_events').insert({
    event_id: eventId,
    type,
    user_id: userId,
    payload,
    status: 'processing',
    ...withLease(now),
    attempt_count: 1,
    last_error: null,
  })
  if (!error) return { state: 'claimed' }
  if (error.code !== '23505') {
    throw new Error(`Failed to claim event ${eventId}: ${error.message}`)
  }

  const current = await getEventRow(eventId)
  if (!current) {
    throw new Error(`Failed to resolve duplicate claim for ${eventId}: row missing`)
  }
  if (current.status === 'processed' || current.processed_at) {
    return { state: 'already_processed' }
  }

  const nextAttempt = Math.max(1, (current.attempt_count ?? 0) + 1)
  if (current.status === 'failed') {
    const reclaimed = await reclaimFailedEvent(eventId, nextAttempt, now, type, userId, payload)
    if (reclaimed) return { state: 'reclaimed' }
  } else {
    const expiresAt = current.processing_expires_at
      ? new Date(current.processing_expires_at).getTime()
      : Number.NEGATIVE_INFINITY
    if (expiresAt <= now.getTime()) {
      const reclaimed = await reclaimExpiredEvent(eventId, nextAttempt, now, type, userId, payload)
      if (reclaimed) return { state: 'reclaimed' }
    }
  }

  const latest = await getEventRow(eventId)
  if (latest?.status === 'processed' || latest?.processed_at) {
    return { state: 'already_processed' }
  }
  return { state: 'in_flight' }
}

export async function markEventProcessed(eventId: string): Promise<void> {
  const supabase = service()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('billing_events')
    .update({
      status: 'processed',
      processed_at: now,
      processing_started_at: null,
      processing_expires_at: null,
      last_error: null,
    })
    .eq('event_id', eventId)
  if (error) throw new Error(`Failed to mark event ${eventId} processed: ${error.message}`)
}

export async function markEventFailed(eventId: string, reason: string): Promise<void> {
  const supabase = service()
  const { error } = await supabase
    .from('billing_events')
    .update({
      status: 'failed',
      processing_expires_at: new Date().toISOString(),
      last_error: reason.slice(0, 2000),
    })
    .eq('event_id', eventId)
  if (error) {
    console.error('[event-deduper] markEventFailed failed:', eventId, error.message)
  }
}
