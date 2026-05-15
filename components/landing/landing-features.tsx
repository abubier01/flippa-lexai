import { FileSearch, ShieldAlert, MessageSquare, BarChart3, Clock, Lock } from 'lucide-react'

const features = [
  {
    icon: FileSearch,
    title: 'Instant Summarization',
    description: 'Get a plain-English summary of any contract in seconds. Understand obligations, terms, and key provisions without reading every word.',
  },
  {
    icon: ShieldAlert,
    title: 'Risk Detection',
    description: 'AI automatically flags high-risk clauses — unfair penalties, one-sided terms, missing protections — before you sign.',
  },
  {
    icon: MessageSquare,
    title: 'AI Chat Assistant',
    description: 'Ask any question about your contract in plain language. "What happens if I terminate early?" — answered instantly.',
  },
  {
    icon: BarChart3,
    title: 'Risk Scoring',
    description: 'Every contract receives a 0–100 risk score with a detailed breakdown so you can prioritize legal review efficiently.',
  },
  {
    icon: Clock,
    title: 'Ultra-Fast Processing',
    description: 'Powered by Groq\'s high-speed inference. Analysis completes in under 10 seconds, not hours or days.',
  },
  {
    icon: Lock,
    title: 'Enterprise Security',
    description: 'Your documents are encrypted at rest and in transit. We never train on your data. SOC 2 Type II compliant.',
  },
]

export default function LandingFeatures() {
  return (
    <section id="features" className="py-20 md:py-28 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-primary font-medium text-sm tracking-wide uppercase mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground text-balance">
            Everything you need to review contracts
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
            LexAI handles the heavy lifting so your team can focus on decisions, not documents.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="bg-card rounded-xl border border-border p-6 hover:shadow-md hover:border-primary/30 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
