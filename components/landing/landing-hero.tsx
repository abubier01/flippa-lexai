import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ShieldCheck, Zap, FileText } from 'lucide-react'

export default function LandingHero() {
  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden">
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(oklch(0.91 0 0) 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        }}
      />
      {/* Blue glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 text-primary border-primary/20 bg-accent">
            <Zap className="w-3 h-3" />
            Ultra-fast contract analysis
          </Badge>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground text-balance max-w-4xl">
            Understand every contract
            <span className="text-primary"> in seconds</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl text-balance leading-relaxed">
            LexAI reads, summarizes, and flags risks in your legal contracts using advanced AI. Upload any document and get instant plain-English insights — no law degree required.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/auth/sign-up">
                Start for free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <Link href="/demo">
                <FileText className="mr-2 w-4 h-4" />
                Try live demo
              </Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-col sm:flex-row items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>SOC 2 compliant</span>
            </div>
            <div className="hidden sm:block w-1 h-1 rounded-full bg-border" />
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span>Supports PDF, DOCX, TXT</span>
            </div>
            <div className="hidden sm:block w-1 h-1 rounded-full bg-border" />
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span>Results in under 10 seconds</span>
            </div>
          </div>

          {/* Hero image / mock UI */}
          <div className="mt-16 w-full max-w-5xl">
            <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/50">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="flex-1 mx-4">
                  <div className="h-6 bg-muted rounded-md w-64 mx-auto" />
                </div>
              </div>

              {/* Mock dashboard */}
              <div className="flex h-72 md:h-96">
                {/* Sidebar */}
                <div className="w-48 md:w-56 border-r border-border bg-secondary/30 p-4 hidden sm:flex flex-col gap-2">
                  {['Dashboard', 'Contracts', 'Upload', 'Reports', 'Settings'].map((item, i) => (
                    <div key={item} className={`h-8 rounded-md px-3 flex items-center text-xs font-medium ${i === 1 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {item}
                    </div>
                  ))}
                </div>

                {/* Content */}
                <div className="flex-1 p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="h-5 bg-muted rounded w-40" />
                    <div className="h-8 bg-primary/10 border border-primary/20 rounded-md w-28" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {['12 Contracts', 'Avg Risk 34', '8 Analyzed'].map(label => (
                      <div key={label} className="rounded-lg border border-border bg-card p-3">
                        <div className="h-4 bg-muted rounded w-16 mb-2" />
                        <div className="h-6 bg-muted/60 rounded w-12" />
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
                    {[90, 60, 45, 75].map((w, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="h-3 bg-muted rounded flex-1" style={{ maxWidth: `${w}%` }} />
                        <div className={`h-5 rounded text-xs px-2 flex items-center font-medium ${i === 0 ? 'bg-red-100 text-red-600' : i === 2 ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'}`}>
                          {i === 0 ? 'High' : i === 2 ? 'Med' : 'Low'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
