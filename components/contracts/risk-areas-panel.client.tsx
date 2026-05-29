'use client'

// Client island for expand/collapse interactivity in the Risk Areas panel.
// Keeping this separate keeps the parent panel a server component.

import { useState } from 'react'
import type { RiskArea } from '@/lib/prompt/persona-types'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'
import {
  SEVERITY_LABEL,
  SEVERITY_COLOR_CLASSES,
  type Severity,
  type SeverityColor,
} from '@/lib/risk/severity'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ItemProps {
  area: RiskArea
  matches: AnalysisOutput['risks']
  maxSeverity: Severity
  severityClasses: (typeof SEVERITY_COLOR_CLASSES)[SeverityColor]
}

export function RiskAreaItem({ area, matches, maxSeverity, severityClasses }: ItemProps) {
  const [open, setOpen] = useState(false)
  const panelId = `risk-area-panel-${area.id}`
  const triggerId = `risk-area-trigger-${area.id}`
  const count = matches.length
  const sevLabel = SEVERITY_LABEL[maxSeverity]

  return (
    <li
      className={`${open ? `border-l-4 ${severityClasses.borderLeft}` : ''}`}
      data-testid={`risk-area-${area.id}`}
    >
      <button
        id={triggerId}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${area.label}: ${count} finding${count === 1 ? '' : 's'}, max severity ${sevLabel}`}
        className="w-full px-6 py-3 flex items-center justify-between hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
      >
        <span className="flex items-center gap-2 text-foreground">
          <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-full ${severityClasses.dot}`} />
          <span className="font-medium">{area.label}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {count} finding{count === 1 ? '' : 's'}
          </span>
          <span
            className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${severityClasses.bg} ${severityClasses.border} ${severityClasses.text}`}
          >
            {sevLabel}
          </span>
          {open ? (
            <ChevronDown aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          )}
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          className="px-6 pb-4 space-y-4"
        >
          {matches.map((risk, idx) => (
            <div key={idx} className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">{risk.title}</h4>
              <p className="text-sm text-muted-foreground">{risk.description}</p>
              {risk.evidence.type === 'quoted' ? (
                <div className="space-y-1">
                  <span className="inline-block font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-foreground border border-border">
                    {risk.evidence.clause_reference}
                  </span>
                  <blockquote className="border-l-2 border-border pl-3 text-sm text-foreground italic">
                    {risk.evidence.quoted_text}
                  </blockquote>
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  <span className="font-semibold not-italic">Missing:</span>{' '}
                  {risk.evidence.missing_concept}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  )
}
