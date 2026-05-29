// lib/risk/severity.ts
//
// Single source of truth for risk-score band labels + severity color mappings.
// Imported by the score card, Risk Areas panel, and Key Clauses panel. Do not
// scatter band thresholds or severity color tables across components.
//
// Spec § Severity and Risk Rubric (Canonical) + § Part 4 (band card colors).

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type BandColor = 'green' | 'yellow' | 'orange' | 'red'

export interface ScoreBand {
  min: number
  max: number
  label: string
  color: BandColor
}

export const SCORE_BANDS: readonly ScoreBand[] = [
  { min: 0, max: 20, label: 'Boilerplate-safe', color: 'green' },
  { min: 21, max: 50, label: 'Minor concerns', color: 'yellow' },
  { min: 51, max: 80, label: 'Material Buyer Risks', color: 'orange' },
  { min: 81, max: 100, label: 'Deal-breakers', color: 'red' },
] as const

export function bandForScore(score: number): ScoreBand {
  for (const band of SCORE_BANDS) {
    if (score >= band.min && score <= band.max) return band
  }
  // Defensive: schema guarantees 0-100 ints, but clamp anyway.
  if (score < 0) return SCORE_BANDS[0]
  return SCORE_BANDS[SCORE_BANDS.length - 1]
}

// Map a severity enum to the SAME color vocabulary as ScoreBand, except low
// is grey (not green) per spec § Severity and Risk Rubric: "low=grey,
// medium=yellow, high=orange, critical=red".
export type SeverityColor = 'grey' | 'yellow' | 'orange' | 'red'

export const SEVERITY_COLOR: Record<Severity, SeverityColor> = {
  low: 'grey',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
  critical: 'CRIT',
}

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

export function maxSeverity(severities: readonly Severity[]): Severity | null {
  if (severities.length === 0) return null
  let best: Severity = severities[0]
  for (const s of severities) {
    if (SEVERITY_RANK[s] > SEVERITY_RANK[best]) best = s
  }
  return best
}

// Tailwind class lookups so components don't repeat the palette. Keep the band
// + severity color vocabularies aligned and centralized — accessibility checks
// run against this one table.
export const BAND_COLOR_CLASSES: Record<
  BandColor,
  { bg: string; border: string; text: string; fill: string }
> = {
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    fill: 'bg-green-500',
  },
  yellow: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    fill: 'bg-yellow-500',
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    fill: 'bg-orange-500',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    fill: 'bg-red-500',
  },
}

export const SEVERITY_COLOR_CLASSES: Record<
  SeverityColor,
  { bg: string; border: string; text: string; dot: string; borderLeft: string }
> = {
  grey: {
    bg: 'bg-muted',
    border: 'border-border',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    borderLeft: 'border-l-muted-foreground',
  },
  yellow: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500',
    borderLeft: 'border-l-yellow-500',
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    borderLeft: 'border-l-orange-500',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
    borderLeft: 'border-l-red-500',
  },
}
