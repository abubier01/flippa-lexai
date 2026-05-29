// components/contracts/risk-areas-panel.tsx
//
// Spec § Part 4 — Risk Areas panel ("load-bearing visualization"):
//   1. Iterate persona.riskAreas[] in persona-defined order.
//   2. Match output.risks[] by risk_area_id.
//   3. Empty buckets ARE rendered (○ No findings) — the visibility is the
//      value proposition of a structured persona.
//   4. Expanded view shows title, description, and grounded evidence
//      (quoted blockquote or "Missing:" absence).

import type { Persona } from '@/lib/prompt/persona-types'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'
import {
  SEVERITY_COLOR,
  SEVERITY_COLOR_CLASSES,
  SEVERITY_LABEL,
  maxSeverity,
  type Severity,
} from '@/lib/risk/severity'
import { RiskAreaItem } from './risk-areas-panel.client'

interface Props {
  persona: Persona
  risks: AnalysisOutput['risks']
}

export default function RiskAreasPanel({ persona, risks }: Props) {
  return (
    <section
      aria-labelledby="risk-areas-heading"
      className="bg-card rounded-xl border border-border overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-border">
        <h3 id="risk-areas-heading" className="font-semibold text-foreground">
          Risk Areas
        </h3>
      </div>
      <ul className="divide-y divide-border" role="list">
        {persona.riskAreas.map(area => {
          const matches = risks.filter(r => r.risk_area_id === area.id)
          const severities = matches.map(m => m.severity as Severity)
          const max = maxSeverity(severities)
          const color = max ? SEVERITY_COLOR[max] : null
          const sev = color ? SEVERITY_COLOR_CLASSES[color] : null

          if (matches.length === 0) {
            return (
              <li
                key={area.id}
                className="px-6 py-3 flex items-center justify-between"
                aria-label={`${area.label}: No findings`}
                data-testid={`risk-area-${area.id}`}
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="inline-block w-3 h-3 rounded-full border border-muted-foreground"
                  />
                  <span className="font-medium">{area.label}</span>
                </span>
                <span className="text-xs text-muted-foreground">No findings</span>
              </li>
            )
          }

          return (
            <RiskAreaItem
              key={area.id}
              area={area}
              matches={matches}
              maxSeverity={max!}
              severityClasses={sev!}
            />
          )
        })}
      </ul>
    </section>
  )
}

export { SEVERITY_LABEL }
