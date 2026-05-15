import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { PRODUCTS } from '@/lib/products'

// Prices come from PRODUCTS which reads PRICE_PRO_CENTS / PRICE_TEAM_CENTS env vars
function buildPlans() {
  const pro = PRODUCTS.find(p => p.plan === 'pro')!
  const team = PRODUCTS.find(p => p.plan === 'team')!
  return [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'Perfect for individuals getting started.',
      features: ['5 contract analyses / month', 'AI chat (20 messages/contract)', 'PDF & DOCX support', 'Risk scoring', 'Email support'],
      cta: 'Get started',
      href: '/auth/sign-up',
      highlighted: false,
    },
    {
      name: pro.name,
      price: `$${(pro.priceInCents / 100).toFixed(0)}`,
      period: pro.billing,
      description: 'For professionals who review contracts regularly.',
      features: ['Unlimited contract analyses', 'Unlimited AI chat', 'All file formats', 'Advanced risk breakdown', 'Clause extraction', 'Priority support', 'Export reports (PDF)'],
      cta: 'Start Pro trial',
      href: '/auth/sign-up',
      highlighted: true,
    },
    {
      name: team.name,
      price: `$${(team.priceInCents / 100).toFixed(0)}`,
      period: team.billing,
      description: 'For legal teams and growing businesses.',
      features: ['Everything in Pro', 'Up to 10 team members', 'Shared contract library', 'Team analytics dashboard', 'SSO & SAML', 'Dedicated account manager', 'Custom integrations'],
      cta: 'Get started',
      href: '/auth/sign-up',
      highlighted: false,
    },
  ]
}

export default function LandingPricing() {
  const plans = buildPlans()
  return (
    <section id="pricing" className="py-20 md:py-28 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-primary font-medium text-sm tracking-wide uppercase mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground text-balance">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-muted-foreground text-balance">No hidden fees. Cancel any time.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-7 flex flex-col ${
                plan.highlighted
                  ? 'border-primary bg-primary text-primary-foreground shadow-xl shadow-primary/20'
                  : 'border-border bg-card'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-foreground text-background text-xs font-semibold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className={`font-semibold text-lg mb-1 ${plan.highlighted ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-4 ${plan.highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>
                <div className="flex items-end gap-1">
                  <span className={`text-4xl font-bold ${plan.highlighted ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm mb-1 ${plan.highlighted ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    /{plan.period}
                  </span>
                </div>
              </div>

              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlighted ? 'text-primary-foreground' : 'text-primary'}`} />
                    <span className={plan.highlighted ? 'text-primary-foreground/90' : 'text-muted-foreground'}>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? 'secondary' : 'default'}
                className="w-full"
                asChild
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
