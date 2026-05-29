// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import RiskAreasPanel from '../risk-areas-panel'
import type { Persona } from '@/lib/prompt/persona-types'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'

afterEach(cleanup)

const persona: Persona = {
  id: 'procurement',
  description: 'test',
  keyClauses: [{ id: 'termination', label: 'Termination' }],
  riskAreas: [
    { id: 'auto_renewal_trap', label: 'Auto-Renewal Trap' },
    { id: 'vendor_favorable_liability', label: 'Vendor-Favorable Liability Cap' },
    { id: 'weak_sla', label: 'Weak or Unenforceable SLA' },
  ],
}

const risks: AnalysisOutput['risks'] = [
  // Intentionally scrambled vs persona order, and second area gets multiple findings
  // with mixed severity so maxSeverity has to pick critical.
  {
    risk_area_id: 'vendor_favorable_liability',
    severity: 'medium',
    title: 'Cap at 6 months fees',
    description: 'Vendor-favorable cap.',
    evidence: { type: 'quoted', clause_reference: '§ 14.2', quoted_text: 'Vendor liability is capped at six months of fees.' },
  },
  {
    risk_area_id: 'vendor_favorable_liability',
    severity: 'critical',
    title: 'No mutual carve-out',
    description: 'Asymmetric.',
    evidence: { type: 'absence', missing_concept: 'no mutual liability carve-out' },
  },
  {
    risk_area_id: 'auto_renewal_trap',
    severity: 'high',
    title: '90-day opt-out',
    description: 'Short window.',
    evidence: { type: 'quoted', clause_reference: '§ 12.3', quoted_text: 'Term auto-renews unless 90 days notice is given prior to renewal.' },
  },
]

describe('RiskAreasPanel', () => {
  it('iterates persona.riskAreas in persona order, not output order', () => {
    render(<RiskAreasPanel persona={persona} risks={risks} />)
    const items = screen.getAllByTestId(/^risk-area-/)
    expect(items.map(el => el.dataset.testid)).toEqual([
      'risk-area-auto_renewal_trap',
      'risk-area-vendor_favorable_liability',
      'risk-area-weak_sla',
    ])
  })

  it('renders empty buckets visibly with "No findings"', () => {
    render(<RiskAreasPanel persona={persona} risks={risks} />)
    const slaRow = screen.getByTestId('risk-area-weak_sla')
    expect(within(slaRow).getByText('No findings')).toBeTruthy()
    expect(slaRow.getAttribute('aria-label')).toBe(
      'Weak or Unenforceable SLA: No findings',
    )
  })

  it('shows max severity badge across multiple findings (critical wins)', () => {
    render(<RiskAreasPanel persona={persona} risks={risks} />)
    const vendorRow = screen.getByTestId('risk-area-vendor_favorable_liability')
    expect(within(vendorRow).getByText('CRIT')).toBeTruthy()
    expect(within(vendorRow).getByText('2 findings')).toBeTruthy()
  })

  it('expands on click and reveals quoted evidence with clause_reference badge', () => {
    render(<RiskAreasPanel persona={persona} risks={risks} />)
    const trigger = within(screen.getByTestId('risk-area-auto_renewal_trap')).getByRole('button')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('§ 12.3')).toBeTruthy()
    expect(screen.getByText(/Term auto-renews unless 90 days notice/)).toBeTruthy()
  })

  it('renders absence-based findings with "Missing:" prefix in italic', () => {
    render(<RiskAreasPanel persona={persona} risks={risks} />)
    fireEvent.click(within(screen.getByTestId('risk-area-vendor_favorable_liability')).getByRole('button'))
    expect(screen.getByText('Missing:')).toBeTruthy()
    expect(screen.getByText(/no mutual liability carve-out/)).toBeTruthy()
  })
})
