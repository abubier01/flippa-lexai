const testimonials = [
  {
    quote: "LexAI saved us from a very one-sided vendor contract. It flagged an auto-renewal clause with a 90-day cancellation window that our team completely missed.",
    name: "Sarah Chen",
    role: "Head of Legal, TechFlow Inc.",
    initials: "SC",
  },
  {
    quote: "We process 40+ contracts per month. LexAI cut our review time from 3 days to under an hour. The risk scoring alone is worth every dollar.",
    name: "Marcus Williams",
    role: "COO, Meridian Partners",
    initials: "MW",
  },
  {
    quote: "As a solo founder I can't afford a lawyer for every agreement. LexAI gives me the confidence to understand what I'm signing before I sign it.",
    name: "Priya Nair",
    role: "Founder, Loopback Studio",
    initials: "PN",
  },
]

export default function LandingTestimonials() {
  return (
    <section id="testimonials" className="py-20 md:py-28 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-primary font-medium text-sm tracking-wide uppercase mb-3">Testimonials</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Trusted by teams who move fast
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-card rounded-xl border border-border p-6 flex flex-col gap-4"
            >
              {/* Stars */}
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-foreground leading-relaxed flex-1">&quot;{t.quote}&quot;</p>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
