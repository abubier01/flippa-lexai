'use client'

import Link from 'next/link'
import { ArrowLeft, Check, Shield, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StripeEmbeddedCheckout from '@/components/stripe/embedded-checkout'
import type { Product } from '@/lib/products'

const PRO_FEATURES = [
  'Unlimited contract analyses',
  'Unlimited AI chat',
  'All file formats',
  'Advanced risk breakdown',
  'Clause extraction',
  'Priority support',
  'Export reports (PDF)',
]

const TEAM_FEATURES = [
  'Everything in Pro',
  'Up to 10 team members',
  'Shared contract library',
  'Team analytics dashboard',
  'SSO & SAML',
  'Dedicated account manager',
  'Custom integrations',
]

interface Props {
  product: Product
  currentPlan: string
}

export default function UpgradePageClient({ product, currentPlan }: Props) {
  const features = product.plan === 'team' ? TEAM_FEATURES : PRO_FEATURES
  const price = (product.priceInCents / 100).toFixed(0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">LexAI</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* Left: Plan summary */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-primary border border-primary/20 mb-4">
                <Zap className="w-3 h-3" />
                Upgrading to {product.name}
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                ${price}<span className="text-base font-normal text-muted-foreground">/month</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">One-time payment for one month of access.</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                What&apos;s included
              </p>
              <ul className="space-y-2.5">
                {features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>Secured by Stripe. Your payment info is never stored on our servers.</span>
            </div>
          </div>

          {/* Right: Stripe embedded checkout */}
          <div className="lg:col-span-3 bg-card rounded-xl border border-border overflow-hidden">
            <StripeEmbeddedCheckout productId={product.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
