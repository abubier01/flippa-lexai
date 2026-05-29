// app/api/cron/invariants/route.ts
//
// Tier 1 modular analysis — P7.3 weekly invariant cron.
//
// Calls the SECURITY DEFINER RPC `check_current_run_invariants()` (migration
// scripts/019_invariants_rpc.sql) which encapsulates the drift query from
// scripts/_checks/current_run_invariants.sql. Each returned row is one
// invariant violation (kind = pointer_not_current | pointer_missing_or_mismatch
// | multiple_current). Zero rows = healthy.
//
// QStash signature verification + Healthchecks heartbeat follow the existing
// reaper pattern (app/api/cron/reap/route.ts, commit 9bb4aad).
//
// On drift > 0: emits Sentry message `cron.invariants.drift` (warning) with
// the first 50 violation rows in `extra.rows`. Still returns 200 — the cron
// itself succeeded; the *data* is unhealthy. Sentry alert handles paging.
//
// QStash schedule (configure via QStash dashboard, see docs/ops/tier1-kpis.md):
//   Cron: `0 12 * * 1`   (Mondays 12:00 UTC)
//   Destination: https://<host>/api/cron/invariants
//
// Env:
//   QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY  — required
//   HEALTHCHECKS_INVARIANTS_PING_URL                     — optional heartbeat

import { Receiver } from '@upstash/qstash'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { log } from '@/lib/log'

const CURR = process.env.QSTASH_CURRENT_SIGNING_KEY
const NEXT = process.env.QSTASH_NEXT_SIGNING_KEY
if (!CURR || !NEXT) {
  log.error('cron.misconfigured', {
    subsystem: 'cron',
    op: 'invariants',
    hint: 'QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY must be set',
  })
}

interface InvariantRow {
  kind: string
  contract_id: string
  run_id: string | null
}

export async function POST(req: Request): Promise<Response> {
  const curr = process.env.QSTASH_CURRENT_SIGNING_KEY
  const next = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!curr || !next) {
    log.error('cron.misconfigured', { subsystem: 'cron', op: 'invariants' })
    return NextResponse.json({ error: 'misconfigured' }, { status: 503 })
  }

  const signature = req.headers.get('Upstash-Signature') ?? ''
  const body = await req.text()
  const receiver = new Receiver({ currentSigningKey: curr, nextSigningKey: next })
  try {
    await receiver.verify({ signature, body })
  } catch (err) {
    log.error('cron.signature_rejected', {
      subsystem: 'cron',
      op: 'invariants',
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('check_current_run_invariants')
  if (error) {
    log.error('cron.invariants.failed', {
      subsystem: 'cron',
      op: 'invariants',
      err: error.message,
    })
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 })
  }

  const rows: InvariantRow[] = Array.isArray(data) ? (data as InvariantRow[]) : []
  const drift_count = rows.length

  if (drift_count > 0) {
    log.error('cron.invariants.drift', {
      subsystem: 'cron',
      op: 'invariants',
      event: 'invariants_drift',
      drift_count,
    })
    Sentry.captureMessage('cron.invariants.drift', {
      level: 'warning',
      tags: { event: 'invariants_drift' },
      extra: { drift_count, rows: rows.slice(0, 50) },
    })
  } else {
    log.info('cron.invariants.ok', {
      subsystem: 'cron',
      op: 'invariants',
      drift_count: 0,
    })
  }

  const hc = process.env.HEALTHCHECKS_INVARIANTS_PING_URL
  if (hc) {
    fetch(hc, { method: 'POST' }).catch(() => {
      // fire-and-forget; Healthchecks outage must not break the cron
    })
  }

  return NextResponse.json({
    drift_count,
    rows: drift_count > 0 ? rows : null,
  })
}
