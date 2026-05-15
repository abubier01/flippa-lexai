import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default function LandingCTA() {
  return (
    <section className="py-20 md:py-28 bg-primary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary-foreground text-balance">
          Start reviewing smarter today
        </h2>
        <p className="mt-4 text-lg text-primary-foreground/80 max-w-xl mx-auto text-balance">
          Join thousands of founders, lawyers, and teams who trust LexAI to protect them from bad contracts.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" variant="secondary" className="h-12 px-8 text-base" asChild>
            <Link href="/auth/sign-up">
              Get started for free
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-8 text-base border-primary-foreground/30 text-dark-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" asChild>
            <Link href="/auth/login">Sign in to your account</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-primary-foreground/60">No credit card required. Free plan includes 5 analyses/month.</p>
      </div>
    </section>
  )
}
