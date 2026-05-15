export type PlanType = 'free' | 'pro' | 'team'

export interface PlanLimits {
  name: string
  contractsPerMonth: number // -1 means unlimited
  messagesPerContract: number // -1 means unlimited
  features: {
    advancedRiskBreakdown: boolean
    clauseExtraction: boolean
    exportPdf: boolean
    teamMembers: number // 1 for solo plans
    sharedLibrary: boolean
    sso: boolean
  }
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    name: 'Free',
    contractsPerMonth: 5,
    messagesPerContract: 20,
    features: {
      advancedRiskBreakdown: false,
      clauseExtraction: false,
      exportPdf: false,
      teamMembers: 1,
      sharedLibrary: false,
      sso: false,
    },
  },
  pro: {
    name: 'Pro',
    contractsPerMonth: -1,
    messagesPerContract: -1,
    features: {
      advancedRiskBreakdown: true,
      clauseExtraction: true,
      exportPdf: true,
      teamMembers: 1,
      sharedLibrary: false,
      sso: false,
    },
  },
  team: {
    name: 'Team',
    contractsPerMonth: -1,
    messagesPerContract: -1,
    features: {
      advancedRiskBreakdown: true,
      clauseExtraction: true,
      exportPdf: true,
      teamMembers: 10,
      sharedLibrary: true,
      sso: true,
    },
  },
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  const normalizedPlan = (plan || 'free').toLowerCase() as PlanType
  return PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.free
}

export function isUnlimited(value: number): boolean {
  return value === -1
}

export function formatLimit(value: number): string {
  return value === -1 ? 'Unlimited' : String(value)
}
