import LandingNav from '@/components/landing/landing-nav'
import LandingHero from '@/components/landing/landing-hero'
import LandingFeatures from '@/components/landing/landing-features'
import LandingHowItWorks from '@/components/landing/landing-how-it-works'
import LandingPricing from '@/components/landing/landing-pricing'
import LandingTestimonials from '@/components/landing/landing-testimonials'
import LandingCTA from '@/components/landing/landing-cta'
import LandingFooter from '@/components/landing/landing-footer'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <LandingNav />
      <LandingHero />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingTestimonials />
      <LandingPricing />
      <LandingCTA />
      <LandingFooter />
    </main>
  )
}
