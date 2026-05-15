import LandingNav from '@/components/landing/landing-nav'
import LandingFooter from '@/components/landing/landing-footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-background pt-16">
        {children}
      </main>
      <LandingFooter />
    </>
  )
}
