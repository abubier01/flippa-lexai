'use client'

import { useMemo, useState } from 'react'
import { Check, Shield, Zap } from 'lucide-react'
import { PRODUCTS } from '@/lib/products'
import type { PlanType } from '@/lib/plan-limits'
import StripeEmbeddedCheckout from '@/components/stripe/embedded-checkout'

const FEATURE_MAP: Record<PlanType, string[]> = {
  solo: [
    '5 contract analyses per month',
    '20 AI chat messages per contract',
    'Risk scoring and clause extraction',
    'Email support',
  ],
  pro: [
    'Unlimited contract analyses',
    'Unlimited AI chat',
    'Advanced risk breakdown',
    'Export reports (PDF)',
  ],
  team: [
    'Everything in Pro',
    'Up to 10 team members',
    'Shared contract library',
    'SSO & SAML',
  ],
}

const PLAN_ORDER: PlanType[] = ['solo', 'pro', 'team']

export default function OnboardingSubscribeClient({ initialPlan }: { initialPlan: PlanType }) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(initialPlan)
  const selectedProduct = useMemo(
    () => PRODUCTS.find((product) => product.plan === selectedPlan) ?? PRODUCTS[0],
    [selectedPlan],
  )
  const price = (selectedProduct.priceInCents / 100).toFixed(0)

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Complete your subscription</p>
            <p className="text-xs text-muted-foreground">You need an active plan to continue into LexAI.</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-primary border border-primary/20 mb-4">
                <Zap className="w-3 h-3" />
                Starting plan
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                ${price}<span className="text-base font-normal text-muted-foreground">/month</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{selectedProduct.name}</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Included
              </p>
              <ul className="space-y-2.5">
                {FEATURE_MAP[selectedPlan].map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Choose Pro or Team instead</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PLAN_ORDER.map((plan) => {
                  const product = PRODUCTS.find((p) => p.plan === plan)
                  if (!product) return null
                  const selected = plan === selectedPlan
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        selected ? 'border-primary/40 bg-accent/40' : 'border-border bg-card hover:bg-accent/20'
                      }`}
                    >
                      <p className="text-sm font-semibold text-foreground">{plan.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ${(product.priceInCents / 100).toFixed(0)}/mo
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 bg-card rounded-xl border border-border overflow-hidden">
            <StripeEmbeddedCheckout productId={selectedProduct.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
