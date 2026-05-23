import { z } from 'zod'

export const RiskSeverity = z.enum(['high', 'medium', 'low'])

export const AnalysisSchema = z.object({
  summary: z.string().max(4000),
  risk_score: z.number().int().min(0).max(100),
  key_points: z.array(z.string().max(500)).max(20).default([]),
  risks: z.array(z.object({
    title: z.string().max(200),
    description: z.string().max(2000),
    severity: RiskSeverity,
  })).max(50).default([]),
  clauses: z.record(z.string(), z.string().max(2000)).default({}),
  suggestions: z.array(z.string().max(500)).max(20).default([]),
})

export type Analysis = z.infer<typeof AnalysisSchema>
