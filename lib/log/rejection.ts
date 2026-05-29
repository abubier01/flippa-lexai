// lib/log/rejection.ts
//
// Structured-log helper for every rejection branch in the analyze route.
// Single shape so log queries can grep on `event=analysis.rejected` and
// downstream consumers (Sentry, Looker, ad-hoc) get consistent fields.

import type { log } from '@/lib/log'

type Logger = ReturnType<typeof log.child>

export interface RejectionLogParams {
  code: string
  userId: string
  contractId?: string | null
  tenantId?: string | null
  scope?: string
  retryAfterSeconds?: number
  tokens?: number
  rawLength?: number
}

export function logRejection(rlog: Logger, params: RejectionLogParams): void {
  rlog.warn('analysis.rejected', {
    event: 'analysis.rejected',
    subsystem: 'analyze',
    ...params,
  })
}
