import { Receiver } from '@upstash/qstash'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-role-core'
import { log } from '@/lib/log'

// Module-load misconfig check — surfaces missing keys in logs before the
// first scheduled hit. The route still loads and returns 503 from POST below.
const CURR = process.env.QSTASH_CURRENT_SIGNING_KEY
const NEXT = process.env.QSTASH_NEXT_SIGNING_KEY
if (!CURR || !NEXT) {
  log.error('cron.misconfigured', {
    subsystem: 'cron',
    op: 'reap',
    hint: 'QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY must be set',
  })
}

export async function POST(req: Request): Promise<Response> {
  const curr = process.env.QSTASH_CURRENT_SIGNING_KEY
  const next = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!curr || !next) {
    log.error('cron.misconfigured', { subsystem: 'cron', op: 'reap' })
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
      op: 'reap',
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const { data: reapedCount, error } = await supabase.rpc('reap_stuck_processing')
  if (error) {
    log.error('cron.reap.failed', { subsystem: 'cron', op: 'reap', err: error.message })
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 })
  }

  const reaped = typeof reapedCount === 'number' ? reapedCount : 0
  log.info('cron.reap.ok', { subsystem: 'cron', op: 'reap', reaped })

  const hc = process.env.HEALTHCHECK_REAP_URL
  if (hc) {
    fetch(hc, { method: 'POST' }).catch(() => {
      // fire-and-forget; Healthchecks outage must not break reaping
    })
  }

  return NextResponse.json({ reaped })
}
