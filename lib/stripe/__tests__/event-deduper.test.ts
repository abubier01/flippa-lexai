import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import {
  markEventFailed,
  markEventProcessed,
  tryClaimEvent,
} from '../event-deduper'

type BillingEventRow = {
  event_id: string
  type: string
  user_id: string | null
  payload: unknown
  status: 'processing' | 'processed' | 'failed'
  processing_started_at: string | null
  processing_expires_at: string | null
  attempt_count: number
  last_error: string | null
  processed_at: string | null
}

const testState = vi.hoisted(() => ({
  rows: new Map<string, BillingEventRow>(),
}))

function matchesFilters(
  row: BillingEventRow,
  filters: Array<{ op: 'eq' | 'lte'; column: string; value: unknown }>,
): boolean {
  return filters.every((filter) => {
    const value = row[filter.column as keyof BillingEventRow]
    if (filter.op === 'eq') return value === filter.value
    if (value == null) return false
    return String(value) <= String(filter.value)
  })
}

function pickColumns(row: BillingEventRow, columns: string | null): Record<string, unknown> {
  if (!columns) return { ...row }
  const selected: Record<string, unknown> = {}
  for (const column of columns.split(',').map((c) => c.trim())) {
    selected[column] = row[column as keyof BillingEventRow]
  }
  return selected
}

class BillingEventsQuery {
  private filters: Array<{ op: 'eq' | 'lte'; column: string; value: unknown }> = []
  private patch: Partial<BillingEventRow> | null = null
  private selectedColumns: string | null = null

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: 'lte', column, value })
    return this
  }

  async insert(input: Record<string, unknown>) {
    const eventId = String(input.event_id)
    if (testState.rows.has(eventId)) {
      return { error: { code: '23505', message: 'duplicate key value' } }
    }
    testState.rows.set(eventId, {
      event_id: eventId,
      type: String(input.type),
      user_id: (input.user_id as string | null) ?? null,
      payload: input.payload,
      status: (input.status as BillingEventRow['status']) ?? 'processing',
      processing_started_at: (input.processing_started_at as string | null) ?? null,
      processing_expires_at: (input.processing_expires_at as string | null) ?? null,
      attempt_count: Number(input.attempt_count ?? 0),
      last_error: (input.last_error as string | null) ?? null,
      processed_at: (input.processed_at as string | null) ?? null,
    })
    return { error: null }
  }

  update(patch: Partial<BillingEventRow>) {
    this.patch = patch
    return this
  }

  select(columns: string) {
    this.selectedColumns = columns
    if (!this.patch) return this
    return this.executeUpdate()
  }

  private executeUpdate() {
    const updated: Array<Record<string, unknown>> = []
    for (const [eventId, row] of testState.rows.entries()) {
      if (!matchesFilters(row, this.filters)) continue
      const next = { ...row, ...this.patch }
      testState.rows.set(eventId, next)
      if (this.selectedColumns) {
        updated.push(pickColumns(next, this.selectedColumns))
      }
    }
    return { data: this.selectedColumns ? updated : null, error: null }
  }

  async maybeSingle() {
    for (const row of testState.rows.values()) {
      if (matchesFilters(row, this.filters)) {
        return { data: pickColumns(row, this.selectedColumns), error: null }
      }
    }
    return { data: null, error: null }
  }

  then(resolve: (value: { data: Record<string, unknown>[] | null; error: null }) => unknown) {
    if (!this.patch) {
      throw new Error('Awaited query without terminal method in test double')
    }
    return Promise.resolve(resolve(this.executeUpdate()))
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'billing_events') throw new Error(`Unexpected table: ${table}`)
      return new BillingEventsQuery()
    },
  })),
}))

describe('event deduper', () => {
  beforeEach(() => {
    testState.rows.clear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('claims a new event on first delivery', async () => {
    const claim = await tryClaimEvent('evt_1', 'invoice.payment_succeeded', null, { ok: true })
    expect(claim.state).toBe('claimed')
    const row = testState.rows.get('evt_1')
    expect(row?.status).toBe('processing')
    expect(row?.attempt_count).toBe(1)
    expect(row?.processing_expires_at).toBeTruthy()
  })

  it('treats processed duplicates as already_processed', async () => {
    testState.rows.set('evt_dup', {
      event_id: 'evt_dup',
      type: 'invoice.payment_succeeded',
      user_id: null,
      payload: {},
      status: 'processed',
      processing_started_at: null,
      processing_expires_at: null,
      attempt_count: 1,
      last_error: null,
      processed_at: new Date().toISOString(),
    })

    const claim = await tryClaimEvent('evt_dup', 'invoice.payment_succeeded', null, {})
    expect(claim.state).toBe('already_processed')
  })

  it('reclaims a stale in-flight lease (crash-before-mark)', async () => {
    testState.rows.set('evt_stale', {
      event_id: 'evt_stale',
      type: 'invoice.payment_succeeded',
      user_id: null,
      payload: {},
      status: 'processing',
      processing_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      processing_expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      attempt_count: 2,
      last_error: 'worker crashed',
      processed_at: null,
    })

    const claim = await tryClaimEvent('evt_stale', 'invoice.payment_succeeded', null, {
      retry: true,
    })
    expect(claim.state).toBe('reclaimed')
    const row = testState.rows.get('evt_stale')
    expect(row?.status).toBe('processing')
    expect(row?.attempt_count).toBe(3)
    expect(row?.last_error).toBeNull()
  })

  it('returns in_flight for concurrent duplicate claims with an active lease', async () => {
    const first = await tryClaimEvent('evt_race', 'invoice.payment_succeeded', null, {})
    const second = await tryClaimEvent('evt_race', 'invoice.payment_succeeded', null, {})
    expect(first.state).toBe('claimed')
    expect(second.state).toBe('in_flight')
  })

  it('marks events processed and failed without deleting them', async () => {
    await tryClaimEvent('evt_state', 'invoice.payment_succeeded', null, {})
    await markEventFailed('evt_state', 'handler exploded')
    const failed = testState.rows.get('evt_state')
    expect(failed?.status).toBe('failed')
    expect(failed?.last_error).toContain('handler exploded')

    await markEventProcessed('evt_state')
    const processed = testState.rows.get('evt_state')
    expect(processed?.status).toBe('processed')
    expect(processed?.processed_at).toBeTruthy()
  })
})
