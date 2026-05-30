// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import KeyClausesPanel from '../key-clauses-panel'
import type { Persona } from '@/lib/prompt/persona-types'
import type { AnalysisOutput } from '@/lib/prompt/output-schema'

afterEach(cleanup)

const persona: Persona = {
  id: 'procurement',
  description: 'test',
  keyClauses: [
    { id: 'termination', label: 'Termination' },
    { id: 'auto_renewal', label: 'Auto-Renewal' },
    { id: 'data_and_ip', label: 'Data & IP Rights' },
    { id: 'sla', label: 'Service Levels' },
  ],
  riskAreas: [{ id: 'x', label: 'X' }],
}

const clauses: AnalysisOutput['clauses'] = [
  {
    key_clause_id: 'termination',
    presence: {
      status: 'present',
      quoted_text: 'Either party may terminate for convenience with thirty days written notice.',
      concern: 'Notice period is asymmetric — buyer should match vendor terms.',
    },
  },
  {
    key_clause_id: 'data_and_ip',
    presence: { status: 'absent' },
  },
  // auto_renewal and sla deliberately omitted to exercise "Not reviewed" branch.
]

describe('KeyClausesPanel — three distinct presence states', () => {
  it('iterates in persona order', () => {
    render(<KeyClausesPanel persona={persona} clauses={clauses} />)
    const rows = screen.getAllByTestId(/^key-clause-/)
    expect(rows.map(r => r.dataset.testid)).toEqual([
      'key-clause-termination',
      'key-clause-auto_renewal',
      'key-clause-data_and_ip',
      'key-clause-sla',
    ])
  })

  it('renders present with blockquote + concern', () => {
    render(<KeyClausesPanel persona={persona} clauses={clauses} />)
    const row = screen.getByTestId('key-clause-termination')
    expect(within(row).getByText(/Either party may terminate/)).toBeTruthy()
    expect(within(row).getByText(/Notice period is asymmetric/)).toBeTruthy()
  })

  it('renders absent with "Not addressed in this contract."', () => {
    render(<KeyClausesPanel persona={persona} clauses={clauses} />)
    const row = screen.getByTestId('key-clause-data_and_ip')
    expect(within(row).getByText('Not addressed in this contract.')).toBeTruthy()
  })

  it('renders missing match (model never reported) with "Not reviewed."', () => {
    render(<KeyClausesPanel persona={persona} clauses={clauses} />)
    const row = screen.getByTestId('key-clause-auto_renewal')
    expect(within(row).getByText('Not reviewed.')).toBeTruthy()
    // sla also has no match
    const sla = screen.getByTestId('key-clause-sla')
    expect(within(sla).getByText('Not reviewed.')).toBeTruthy()
  })

  it('distinguishes "Not reviewed" from "Not addressed" with different styling', () => {
    render(<KeyClausesPanel persona={persona} clauses={clauses} />)
    const notReviewed = screen.getByTestId('key-clause-auto_renewal').querySelector('p')!
    const notAddressed = screen.getByTestId('key-clause-data_and_ip').querySelector('p')!
    // "Not reviewed" uses lighter muted (-foreground/60) + italic; "Not addressed" uses regular muted.
    // Assert by class fragment so tests survive Tailwind reformatting.
    expect(notReviewed.className).toContain('italic')
    expect(notReviewed.className).toContain('/60')
    expect(notAddressed.className).not.toContain('/60')
  })
})
