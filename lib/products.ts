import type { PlanType } from '@/lib/plan-limits'

export interface Product {
  id: string
  plan: PlanType
  name: string
  description: string
  priceInCents: number
  billing: string
}

// Server-side source of truth — prices come from env vars so they can be changed without code changes.
// PRICE_PRO_CENTS  — e.g. 2900  ($29/month)
// PRICE_TEAM_CENTS — e.g. 9900  ($99/month)
export const PRODUCTS: Product[] = [
  {
    id: 'lexai-pro',
    plan: 'pro',
    name: 'LexAI Pro',
    description: 'Unlimited contract analyses, unlimited AI chat, advanced risk breakdown, clause extraction, and PDF export.',
    priceInCents: parseInt(process.env.PRICE_PRO_CENTS ?? '2900', 10),
    billing: 'per month',
  },
  {
    id: 'lexai-team',
    plan: 'team',
    name: 'LexAI Team',
    description: 'Everything in Pro plus up to 10 team members, shared contract library, team analytics, SSO & SAML, and a dedicated account manager.',
    priceInCents: parseInt(process.env.PRICE_TEAM_CENTS ?? '9900', 10),
    billing: 'per month',
  },
]

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find(p => p.id === id)
}

export function getProductByPlan(plan: PlanType): Product | undefined {
  return PRODUCTS.find(p => p.plan === plan)
}
