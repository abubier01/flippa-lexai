import { describe, it, expect } from 'vitest'
import {
  bandForScore,
  SCORE_BANDS,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  maxSeverity,
  BAND_COLOR_CLASSES,
  SEVERITY_COLOR_CLASSES,
} from '../severity'

describe('bandForScore', () => {
  it.each([
    [0, 'Boilerplate-safe'],
    [20, 'Boilerplate-safe'],
    [21, 'Minor concerns'],
    [50, 'Minor concerns'],
    [51, 'Material Buyer Risks'],
    [80, 'Material Buyer Risks'],
    [81, 'Deal-breakers'],
    [100, 'Deal-breakers'],
  ])('score %i maps to %s band', (score, label) => {
    expect(bandForScore(score).label).toBe(label)
  })

  it('clamps out-of-range scores', () => {
    expect(bandForScore(-10).label).toBe('Boilerplate-safe')
    expect(bandForScore(200).label).toBe('Deal-breakers')
  })

  it('covers 0-100 with no gaps', () => {
    for (let s = 0; s <= 100; s++) {
      expect(bandForScore(s)).toBeDefined()
    }
  })
})

describe('severity tokens', () => {
  it('maps severities to spec colors (low=grey, med=yellow, high=orange, crit=red)', () => {
    expect(SEVERITY_COLOR.low).toBe('grey')
    expect(SEVERITY_COLOR.medium).toBe('yellow')
    expect(SEVERITY_COLOR.high).toBe('orange')
    expect(SEVERITY_COLOR.critical).toBe('red')
  })

  it('emits accessible text labels', () => {
    expect(SEVERITY_LABEL).toEqual({
      low: 'LOW',
      medium: 'MED',
      high: 'HIGH',
      critical: 'CRIT',
    })
  })

  it('maxSeverity returns null on empty input', () => {
    expect(maxSeverity([])).toBeNull()
  })

  it('maxSeverity picks the highest rank', () => {
    expect(maxSeverity(['low', 'high', 'medium'])).toBe('high')
    expect(maxSeverity(['critical', 'low'])).toBe('critical')
    expect(maxSeverity(['low'])).toBe('low')
  })
})

describe('class tables stay in sync with vocab', () => {
  it('every band color has a class entry', () => {
    for (const band of SCORE_BANDS) {
      expect(BAND_COLOR_CLASSES[band.color]).toBeDefined()
    }
  })

  it('every severity color has a class entry', () => {
    for (const c of Object.values(SEVERITY_COLOR)) {
      expect(SEVERITY_COLOR_CLASSES[c]).toBeDefined()
    }
  })
})
