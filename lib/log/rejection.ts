// lib/log/rejection.ts
//
// Structured-log helper for every rejection branch in the analyze route.
// Single shape so log queries can grep on `event=analysis.rejected` and
// downstream consumers (Sentry, Looker, ad-hoc) get consistent fields.
//
// Field naming is snake_case per spec § "What you log per run" — matches
// the persisted-row column convention used elsewhere in analytics queries.

import type { log } from '@/lib/log'

type Logger = ReturnType<typeof log.child>

export type RejectionCode =
  | 'CONTRACT_TOO_LONG'
  | 'CONTRACT_EMPTY'
  | 'TOO_LONG'
  | 'EMPTY_AFTER_SCRUB'
  | 'SENTINEL_VIOLATION'
  | 'RATE_LIMITED'
  | 'PERSONA_INVALID'

export interface RejectionLogParams {
  code: RejectionCode | string
  userId: string
  contractId?: string | null
  tenantId?: string | null
  // RATE_LIMITED-only
  scope?: 'user' | 'tenant' | 'tenant_daily' | string
  retryAfterSeconds?: number
  // CONTRACT_TOO_LONG-only
  tokens?: number
  // TOO_LONG-only
  rawLength?: number
}

export function logRejection(rlog: Logger, params: RejectionLogParams): void {
  const entry: Record<string, unknown> = {
    event: 'analysis.rejected',
    subsystem: 'analyze',
    code: params.code,
    user_id: params.userId,
    contract_id: params.contractId ?? null,
    tenant_id: params.tenantId ?? null,
  }
  if (params.scope !== undefined) entry.scope = params.scope
  if (params.retryAfterSeconds !== undefined) {
    entry.retry_after_seconds = params.retryAfterSeconds
  }
  if (params.tokens !== undefined) entry.tokens = params.tokens
  if (params.rawLength !== undefined) entry.raw_length = params.rawLength

  rlog.warn('analysis.rejected', entry)
}
