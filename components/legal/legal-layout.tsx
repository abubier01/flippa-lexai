import Link from 'next/link'
import { FileText } from 'lucide-react'

interface Section {
  title: string
  content: string
}

interface Props {
  title: string
  description: string
  lastUpdated: string
  sections: Section[]
  relatedLinks?: { label: string; href: string }[]
}

function renderContent(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { key++; continue }

    if (trimmed.startsWith('| ')) {
      // Table row
      const cells = trimmed.split('|').filter(c => c.trim() && c.trim() !== '---')
      if (cells.every(c => /^-+$/.test(c.trim()))) { key++; continue }
      const isHeader = cells[0]?.trim().match(/^[A-Z]/)
      elements.push(
        <tr key={key++} className={isHeader ? 'bg-secondary/50' : 'border-t border-border'}>
          {cells.map((cell, ci) => (
            <td key={ci} className="px-4 py-2 text-sm text-foreground"
              dangerouslySetInnerHTML={{ __html: cell.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          ))}
        </tr>
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={key++} className="ml-5 list-disc text-foreground/80 leading-relaxed text-[15px]"
          dangerouslySetInnerHTML={{ __html: trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
      )
    } else {
      elements.push(
        <p key={key++} className="text-foreground/80 leading-relaxed text-[15px]"
          dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>') }} />
      )
    }
  }
  return elements
}

function hasTable(text: string) {
  return text.includes('| ')
}

/** Prefix with 'sec-' so generated IDs are always valid CSS selectors (digits can't start an ID). */
function makeId(str: string) {
  return 'sec-' + str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function LegalLayout({ title, description, lastUpdated, sections, relatedLinks }: Props) {

  const toc = sections.map(s => ({
    id: makeId(s.title),
    label: s.title,
  }))

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="border-b border-border bg-secondary/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Legal</p>
              <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3 text-balance">{title}</h1>
          <p className="text-muted-foreground text-base max-w-xl text-pretty">{description}</p>
        </div>
      </div>

      {/* Content grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col lg:flex-row gap-12">

          {/* Sidebar: TOC + related */}
          <aside className="lg:w-56 shrink-0">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">On this page</p>
                <nav className="flex flex-col gap-1">
                  {toc.map(item => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors py-1 leading-snug"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>

              {relatedLinks && relatedLinks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Related</p>
                  <nav className="flex flex-col gap-1">
                    {relatedLinks.map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Questions?</p>
                <a href="mailto:legal@lexai.app" className="text-sm text-primary hover:underline">legal@lexai.app</a>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="space-y-12">
              {sections.map(section => {
                const id = makeId(section.title)
                const isTable = hasTable(section.content)
                const rendered = renderContent(section.content)

                return (
                  <section key={id} id={id} className="scroll-mt-24">
                    <h2 className="text-xl font-semibold text-foreground mb-4 pb-3 border-b border-border">
                      {section.title}
                    </h2>
                    {isTable ? (
                      <div className="space-y-3">
                        {rendered.filter((el: React.ReactNode) => {
                          const e = el as React.ReactElement
                          return e?.type !== 'tr'
                        })}
                        <div className="overflow-x-auto">
                          <table className="w-full border border-border rounded-lg overflow-hidden text-sm">
                            <tbody>
                              {rendered.filter((el: React.ReactNode) => {
                                const e = el as React.ReactElement
                                return e?.type === 'tr'
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {rendered}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>

            <div className="mt-14 pt-8 border-t border-border text-xs text-muted-foreground">
              Last updated: {lastUpdated} · LexAI, Inc. · 548 Market St, PMB 91776, San Francisco, CA 94104
            </div>
          </main>

        </div>
      </div>
    </div>
  )
}
