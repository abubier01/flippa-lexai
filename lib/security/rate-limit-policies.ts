import type { PlanType } from '@/lib/plan-limits'

// Anti-abuse actions (contract-delete, account-delete) intentionally use flat
// limits across all tiers. Tier-sized limits make sense for cost-control;
// abuse defense is the same across plans.

export type RateLimitAction =
  | 'chat'
  | 'analyze'
  | 'upload'
  | 'contract-delete'
  | 'account-delete'
  // Tier 1 modular-analysis sliding-window scopes (spec § Rate Limiting).
  // perUser / perTenant fail open (cost-control, match 'analyze'); perTenantDaily
  // fails closed because the daily budget is the cost-protection ceiling.
  | 'analyze:perUser'
  | 'analyze:perTenant'
  | 'analyze:perTenantDaily'

export type Policy = {
  limit: number
  windowMs: number
  // 'open' (default): if the Upstash backend is unreachable, allow the request through
  // and mark the result degraded. Right for cost-control actions where availability beats
  // perfect quota accounting. 'closed': deny the request on backend outage. Right for
  // anti-abuse actions on destructive endpoints where unprotected access is worse than
  // a brief 503.
  failMode?: 'open' | 'closed'
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const POLICIES = {
  chat: {
    solo: { limit: 60, windowMs: 15 * MIN },
    pro: { limit: 120, windowMs: 15 * MIN },
    team: { limit: 240, windowMs: 15 * MIN },
  },
  analyze: {
    solo: { limit: 12, windowMs: HOUR },
    pro: { limit: 24, windowMs: HOUR },
    team: { limit: 48, windowMs: HOUR },
  },
  upload: {
    solo: { limit: 10, windowMs: HOUR },
    pro: { limit: 20, windowMs: HOUR },
    team: { limit: 40, windowMs: HOUR },
  },
  'contract-delete': {
    solo: { limit: 60, windowMs: 15 * MIN, failMode: 'closed' },
    pro:  { limit: 60, windowMs: 15 * MIN, failMode: 'closed' },
    team: { limit: 60, windowMs: 15 * MIN, failMode: 'closed' },
  },
  'account-delete': {
    solo: { limit: 5, windowMs: 15 * MIN, failMode: 'closed' },
    pro:  { limit: 5, windowMs: 15 * MIN, failMode: 'closed' },
    team: { limit: 5, windowMs: 15 * MIN, failMode: 'closed' },
  },
  // Tier 1 modular-analysis limits — flat across tiers (spec § Rate Limiting
  // defines a single set; per-tier tuning is a Tier 2 concern).
  'analyze:perUser': {
    solo: { limit: 10, windowMs: MIN },
    pro:  { limit: 10, windowMs: MIN },
    team: { limit: 10, windowMs: MIN },
  },
  'analyze:perTenant': {
    solo: { limit: 60, windowMs: MIN },
    pro:  { limit: 60, windowMs: MIN },
    team: { limit: 60, windowMs: MIN },
  },
  'analyze:perTenantDaily': {
    solo: { limit: 2000, windowMs: DAY, failMode: 'closed' },
    pro:  { limit: 2000, windowMs: DAY, failMode: 'closed' },
    team: { limit: 2000, windowMs: DAY, failMode: 'closed' },
  },
} as const satisfies Record<RateLimitAction, Record<PlanType, Policy>>

export function getPolicy(action: RateLimitAction, tier: PlanType): Policy {
  return POLICIES[action][tier]
}
