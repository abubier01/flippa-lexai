// components/contracts/key-clauses-panel.tsx
//
// Spec § Part 4 — Key Clauses panel.
//   1. Iterate persona.keyClauses[] in persona order.
//   2. Match output.clauses[] by key_clause_id.
//   3. THREE distinct states (styling must distinguish):
//      - present: blockquote of quoted_text + optional ⚠ concern
//      - absent:  "Not addressed in this contract." muted
//      - missing match entirely: "Not reviewed." LIGHTER muted (quality signal)

import type { Persona } from '@/lib/prompt/persona-types'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'

interface Props {
  persona: Persona
  clauses: AnalysisOutput['clauses']
}

export default function KeyClausesPanel({ persona, clauses }: Props) {
  return (
    <section
      aria-labelledby="key-clauses-heading"
      className="bg-card rounded-xl border border-border overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-border">
        <h3 id="key-clauses-heading" className="font-semibold text-foreground">
          Key Clauses Reviewed
        </h3>
      </div>
      <div className="divide-y divide-border">
        {persona.keyClauses.map(kc => {
          const matches = clauses.filter(c => c.key_clause_id === kc.id)
          return (
            <div
              key={kc.id}
              className="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-2 sm:gap-6 px-6 py-4"
              data-testid={`key-clause-${kc.id}`}
            >
              <div className="text-sm font-semibold text-foreground">{kc.label}</div>
              <div className="space-y-3 text-sm">
                {matches.length === 0 ? (
                  // "Not reviewed" is LIGHTER than "Not addressed" — distinguishable
                  // because it signals the model did not engage at all.
                  <p className="text-muted-foreground/60 italic">Not reviewed.</p>
                ) : (
                  matches.map((c, idx) => (
                    <div key={idx} className="space-y-2">
                      {idx > 0 && <hr className="border-border" aria-hidden="true" />}
                      {c.presence.status === 'present' ? (
                        <>
                          <blockquote className="border-l-2 border-border pl-3 text-foreground italic">
                            {c.presence.quoted_text}
                          </blockquote>
                          {c.presence.concern && (
                            <p className="text-foreground">
                              <span aria-hidden="true">⚠</span>{' '}
                              <span className="sr-only">Concern:</span>
                              {c.presence.concern}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground">Not addressed in this contract.</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
