import type { PlanType } from '@/lib/plan-limits'

export type RateLimitAction = 'chat' | 'analyze' | 'upload'

export type Policy = {
  limit: number
  windowMs: number
}

const MIN = 60_000
const HOUR = 60 * MIN

export const POLICIES = {
  chat: {
    free: { limit: 60, windowMs: 15 * MIN },
    pro: { limit: 120, windowMs: 15 * MIN },
    team: { limit: 240, windowMs: 15 * MIN },
  },
  analyze: {
    free: { limit: 12, windowMs: HOUR },
    pro: { limit: 24, windowMs: HOUR },
    team: { limit: 48, windowMs: HOUR },
  },
  upload: {
    free: { limit: 10, windowMs: HOUR },
    pro: { limit: 20, windowMs: HOUR },
    team: { limit: 40, windowMs: HOUR },
  },
} as const satisfies Record<RateLimitAction, Record<PlanType, Policy>>

export function getPolicy(action: RateLimitAction, tier: PlanType): Policy {
  return POLICIES[action][tier]
}
