import type { PlanType } from '@/lib/plan-limits'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export function priceIdToPlan(priceId: string): PlanType | null {
  const solo = requireEnv('STRIPE_PRICE_SOLO_MONTHLY')
  const pro = requireEnv('STRIPE_PRICE_PRO_MONTHLY')
  const team = requireEnv('STRIPE_PRICE_TEAM_MONTHLY')
  if (priceId === solo) return 'solo'
  if (priceId === pro) return 'pro'
  if (priceId === team) return 'team'
  return null
}

export function planToPriceId(plan: PlanType): string {
  if (plan === 'solo') return requireEnv('STRIPE_PRICE_SOLO_MONTHLY')
  if (plan === 'pro') return requireEnv('STRIPE_PRICE_PRO_MONTHLY')
  if (plan === 'team') return requireEnv('STRIPE_PRICE_TEAM_MONTHLY')
  throw new Error(`No Stripe price configured for plan: ${plan}`)
}
