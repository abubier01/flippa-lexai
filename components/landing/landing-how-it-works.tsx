import { Upload, Cpu, MessageSquare } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload your contract',
    description: 'Drag and drop a PDF, DOCX, or paste plain text. We accept all standard contract formats.',
  },
  {
    number: '02',
    icon: Cpu,
    title: 'AI analyzes instantly',
    description: 'Our Groq-powered AI reads the entire document, extracts key clauses, detects risks, and scores the contract — in under 10 seconds.',
  },
  {
    number: '03',
    icon: MessageSquare,
    title: 'Review & ask questions',
    description: 'Explore the summary, risk report, and clause breakdown. Chat with the AI to clarify anything in plain English.',
  },
]

export default function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-primary font-medium text-sm tracking-wide uppercase mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground text-balance">
            From upload to insight in 3 steps
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px bg-border" />

          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 w-20 h-20 rounded-2xl bg-card border-2 border-primary/20 flex items-center justify-center mb-6 shadow-sm">
                  <Icon className="w-8 h-8 text-primary" />
                  <span className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm max-w-xs">{step.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
