import { describe, it, expect } from 'vitest'
import { AnalysisSchema, RiskSeverity } from '../schemas'

describe('AnalysisSchema', () => {
  const validAnalysis = {
    summary: 'This is a service agreement.',
    risk_score: 42,
    key_points: ['Point one', 'Point two'],
    risks: [
      { title: 'Liability Risk', description: 'Uncapped liability exposure.', severity: 'high' as const },
      { title: 'IP Risk', description: 'Broad IP assignment clause.', severity: 'medium' as const },
    ],
    clauses: {
      payment_terms: 'Net 30',
      termination: '30 days notice',
    },
    suggestions: ['Negotiate cap on liability.'],
  }

  it('parses a valid analysis object', () => {
    const result = AnalysisSchema.safeParse(validAnalysis)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBe('This is a service agreement.')
      expect(result.data.risk_score).toBe(42)
      expect(result.data.risks).toHaveLength(2)
      expect(result.data.risks[0].severity).toBe('high')
    }
  })

  it('applies defaults for missing arrays and clauses', () => {
    const minimal = {
      summary: 'Minimal contract.',
      risk_score: 0,
    }
    const result = AnalysisSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.key_points).toEqual([])
      expect(result.data.risks).toEqual([])
      expect(result.data.clauses).toEqual({})
      expect(result.data.suggestions).toEqual([])
    }
  })

  it('fails when summary is missing', () => {
    const result = AnalysisSchema.safeParse({ risk_score: 50 })
    expect(result.success).toBe(false)
  })

  it('fails when risk_score is missing', () => {
    const result = AnalysisSchema.safeParse({ summary: 'Something.' })
    expect(result.success).toBe(false)
  })

  it('fails when risk_score is out of range (negative)', () => {
    const result = AnalysisSchema.safeParse({ ...validAnalysis, risk_score: -1 })
    expect(result.success).toBe(false)
  })

  it('fails when risk_score is out of range (over 100)', () => {
    const result = AnalysisSchema.safeParse({ ...validAnalysis, risk_score: 101 })
    expect(result.success).toBe(false)
  })

  it('fails when risk_score is not an integer', () => {
    const result = AnalysisSchema.safeParse({ ...validAnalysis, risk_score: 42.5 })
    expect(result.success).toBe(false)
  })

  it('fails when severity is not one of high/medium/low', () => {
    const bad = {
      ...validAnalysis,
      risks: [{ title: 'X', description: 'Y', severity: 'critical' }],
    }
    const result = AnalysisSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('fails when summary exceeds max length', () => {
    const result = AnalysisSchema.safeParse({ ...validAnalysis, summary: 'x'.repeat(4001) })
    expect(result.success).toBe(false)
  })

  it('fails when a key_point exceeds max length', () => {
    const result = AnalysisSchema.safeParse({
      ...validAnalysis,
      key_points: ['x'.repeat(501)],
    })
    expect(result.success).toBe(false)
  })

  it('fails when risks array exceeds max length of 50', () => {
    const manyRisks = Array.from({ length: 51 }, (_, i) => ({
      title: `Risk ${i}`,
      description: 'Desc',
      severity: 'low' as const,
    }))
    const result = AnalysisSchema.safeParse({ ...validAnalysis, risks: manyRisks })
    expect(result.success).toBe(false)
  })

  it('accepts clauses as a record of arbitrary string keys', () => {
    const result = AnalysisSchema.safeParse({
      ...validAnalysis,
      clauses: { custom_field: 'some value', another_field: 'another value' },
    })
    expect(result.success).toBe(true)
  })
})

describe('RiskSeverity', () => {
  it('accepts high, medium, low', () => {
    expect(RiskSeverity.safeParse('high').success).toBe(true)
    expect(RiskSeverity.safeParse('medium').success).toBe(true)
    expect(RiskSeverity.safeParse('low').success).toBe(true)
  })

  it('rejects other strings', () => {
    expect(RiskSeverity.safeParse('critical').success).toBe(false)
    expect(RiskSeverity.safeParse('HIGH').success).toBe(false)
    expect(RiskSeverity.safeParse('').success).toBe(false)
  })
})
