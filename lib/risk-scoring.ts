export const RISK_SEVERITY_WEIGHTS: Record<string, number> = {
  high: 100,
  medium: 55,
  low: 20,
}

export function computeRiskScoreFromRisks(risks: Array<{ severity: string }>): number {
  if (risks.length === 0) return 0
  const total = risks.reduce((sum, risk) => sum + (RISK_SEVERITY_WEIGHTS[risk.severity] ?? 20), 0)
  return Math.min(100, Math.round(total / risks.length))
}
