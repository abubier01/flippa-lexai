import { Scale, Users, Zap, Shield, Globe, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'About — LexAI',
  description: 'Learn about LexAI — the AI-powered contract intelligence platform built for modern legal teams.',
}

const values = [
  {
    icon: Zap,
    title: 'Clarity over complexity',
    description: 'Legal language is opaque by design. We believe everyone deserves to understand what they are signing.',
  },
  {
    icon: Shield,
    title: 'Security first',
    description: 'Contracts contain sensitive business information. We treat your data with the highest security standards.',
  },
  {
    icon: Users,
    title: 'Built for teams',
    description: 'The best contract workflows happen collaboratively. LexAI is designed to scale from one person to entire legal departments.',
  },
  {
    icon: Globe,
    title: 'Accessible to all',
    description: 'Not every company can afford a full legal team. AI should level the playing field for startups and SMBs.',
  },
]

const team = [
  {
    name: 'Alex Mercer',
    role: 'Co-founder & CEO',
    bio: 'Former M&A attorney at a top-10 law firm. Spent years reviewing contracts before deciding to automate the tedious parts.',
  },
  {
    name: 'Priya Sharma',
    role: 'Co-founder & CTO',
    bio: 'Built NLP systems at a leading AI research lab. Passionate about making language models actually useful in legal workflows.',
  },
  {
    name: 'Jordan Ellis',
    role: 'Head of Product',
    bio: 'Previously led product at two legaltech unicorns. Deeply focused on building tools lawyers actually want to use.',
  },
  {
    name: 'Sam Chen',
    role: 'Head of Engineering',
    bio: 'Full-stack engineer with a decade of experience building enterprise SaaS. Cares obsessively about reliability and performance.',
  },
]

export default function AboutPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-primary text-xs font-medium border border-primary/10 mb-8">
          <Scale className="w-3.5 h-3.5" />
          Our story
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight text-balance mb-6">
          We make contracts <span className="text-primary">understandable</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto text-pretty">
          LexAI was founded in 2023 by a lawyer and an AI researcher who were tired of watching businesses sign contracts they didn&apos;t fully understand. We built the tool we wished existed.
        </p>
      </section>

      {/* Mission section */}
      <section className="border-y border-border bg-secondary/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">Our mission</p>
            <h2 className="text-3xl font-bold text-foreground mb-6 text-balance">
              Democratize legal intelligence for every business
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Every year, businesses lose billions of dollars to unfavorable contract terms they simply didn&apos;t notice — buried in dense legalese on page 14, or hidden in a 30-day auto-renewal clause.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              LexAI uses state-of-the-art AI to read contracts the way a senior attorney would — spotting risk, surfacing key terms, and explaining everything in plain English. In seconds, not hours.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Contracts analyzed', value: '50,000+' },
              { label: 'Hours saved', value: '120,000+' },
              { label: 'Teams using LexAI', value: '1,200+' },
              { label: 'Average time to insight', value: '< 30s' },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-xl p-6">
                <p className="text-3xl font-bold text-foreground mb-1">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What we believe</p>
          <h2 className="text-3xl font-bold text-foreground text-balance">Our values</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map(v => (
            <div key={v.title} className="bg-card border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                <v.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{v.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{v.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section className="border-t border-border bg-secondary/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">The people behind it</p>
            <h2 className="text-3xl font-bold text-foreground text-balance">Meet the team</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map(member => (
              <div key={member.name} className="bg-card border border-border rounded-xl p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg mb-4">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <p className="font-semibold text-foreground">{member.name}</p>
                <p className="text-xs text-primary font-medium mb-3">{member.role}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h2 className="text-3xl font-bold text-foreground mb-4 text-balance">Ready to try it?</h2>
        <p className="text-muted-foreground mb-8">Analyze your first contract free — no credit card required.</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Button asChild size="lg">
            <Link href="/auth/sign-up">
              Get started free <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/blog">Read our blog</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
