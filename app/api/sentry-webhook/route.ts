// app/api/sentry-webhook/route.ts
//
// Sentry → Slack bridge for the free Sentry Developer plan (no native Slack
// integration). Sentry posts here via an Internal Integration; we verify the
// HMAC-SHA256 signature, then forward a concise summary to a Slack Incoming
// Webhook URL.
//
// Signature: req.text() (not req.json()) — verification needs the raw body.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { logger } from '@/lib/log/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rlog = logger(req, 'sentry.webhook')

  const secret = process.env.SENTRY_WEBHOOK_SECRET
  const slackUrl = process.env.SLACK_WEBHOOK_URL
  if (!secret || !slackUrl) {
    rlog.error('sentry-webhook.misconfigured', {
      subsystem: 'sentry-bridge',
      hasSecret: !!secret,
      hasSlackUrl: !!slackUrl,
    })
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const sig = req.headers.get('sentry-hook-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const body = await req.text()
  if (!verifySentrySignature(body, sig, secret)) {
    rlog.warn('sentry-webhook.signature.failed', { subsystem: 'sentry-bridge' })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const resource = req.headers.get('sentry-hook-resource')
  if (resource !== 'event_alert') {
    return NextResponse.json({ received: true, ignored: resource ?? 'unknown' })
  }

  let payload: SentryEventAlertPayload
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload?.data?.event
  if (!event) {
    return NextResponse.json({ received: true, ignored: 'no-event' })
  }

  // Defense in depth — alert rules should already filter environment:production,
  // but a future rule misconfig shouldn't page Slack from preview.
  if (event.environment && event.environment !== 'production') {
    return NextResponse.json({ received: true, ignored: `env:${event.environment}` })
  }

  try {
    await postToSlack(slackUrl, buildSlackMessage(payload, event))
  } catch (err) {
    rlog.error('sentry-webhook.slack.failed', {
      err,
      subsystem: 'sentry-bridge',
      op: 'slack.post',
    })
    // Return 500 so Sentry retries (Sentry retries 5xx, drops 4xx).
    return NextResponse.json({ error: 'Slack post failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

function verifySentrySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

type SentryEventAlertPayload = {
  action?: string
  data?: {
    event?: {
      title?: string
      message?: string
      level?: string
      environment?: string
      web_url?: string
      project?: string
      project_slug?: string
      release?: string
      tags?: Array<[string, string]>
    }
    triggered_rule?: string
  }
}

function buildSlackMessage(payload: SentryEventAlertPayload, event: NonNullable<NonNullable<SentryEventAlertPayload['data']>['event']>) {
  const title = event.title || event.message || 'Sentry event'
  const level = (event.level || 'error').toUpperCase()
  const env = event.environment || 'unknown'
  const project = event.project_slug || event.project || 'unknown'
  const release = event.release ? event.release.slice(0, 12) : null
  const url = event.web_url || 'https://sentry.io/'
  const rule = payload.data?.triggered_rule || 'alert'

  const fields: Array<{ type: 'mrkdwn'; text: string }> = [
    { type: 'mrkdwn', text: `*Level*\n${level}` },
    { type: 'mrkdwn', text: `*Environment*\n${env}` },
    { type: 'mrkdwn', text: `*Project*\n${project}` },
    { type: 'mrkdwn', text: `*Rule*\n${rule}` },
  ]
  if (release) fields.push({ type: 'mrkdwn', text: `*Release*\n\`${release}\`` })

  return {
    text: `[${level}] ${title}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: truncate(title, 140), emoji: false },
      },
      { type: 'section', fields },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open in Sentry', emoji: false },
            url,
            style: 'primary',
          },
        ],
      },
    ],
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

async function postToSlack(url: string, message: object): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Slack ${res.status}: ${text.slice(0, 200)}`)
  }
}
