// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { EnumerationEditor, type EditableRow } from '../enumeration-editor'

afterEach(cleanup)

function rows(): EditableRow[] {
  return [
    { id: 'termination', label: 'Termination', hint: '', published: true, removed: false, isNew: false },
    { id: 'auto_renewal', label: 'Auto-Renewal', hint: 'Opt-out windows', published: true, removed: false, isNew: false },
    { id: 'new_clause', label: 'New Clause', hint: '', published: false, removed: false, isNew: true },
  ]
}

describe('EnumerationEditor', () => {
  it('slug-locks rows that have been published (ID input is readOnly)', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const lockedRow = screen.getByTestId('row-termination')
    const idInput = within(lockedRow).getAllByRole('textbox')[0] as HTMLInputElement
    expect(idInput.hasAttribute('readonly')).toBe(true)
    expect(idInput.getAttribute('data-locked')).toBe('true')
  })

  it('allows editing the ID on never-published (new) rows', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const labelInput = screen.getByDisplayValue('New Clause')
    const row = labelInput.closest('tr')!
    const idInput = within(row).getAllByRole('textbox')[0] as HTMLInputElement
    expect(idInput.hasAttribute('readonly')).toBe(false)
    fireEvent.change(idInput, { target: { value: 'updated_id' } })
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0] as EditableRow[]
    expect(next[2].id).toBe('updated_id')
  })

  it('"remove" on a never-published row hard-deletes it from state', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const labelInput = screen.getByDisplayValue('New Clause')
    const row = labelInput.closest('tr')!
    const removeBtn = within(row).getByRole('button', { name: 'Remove' })
    fireEvent.click(removeBtn)
    const next = onChange.mock.calls.at(-1)![0] as EditableRow[]
    expect(next).toHaveLength(2)
    expect(next.find((r) => r.id === 'new_clause')).toBeUndefined()
  })

  it('"remove" on a previously-published row tags it for removal (does NOT delete)', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const lockedRow = screen.getByTestId('row-termination')
    const removeBtn = within(lockedRow).getByRole('button', { name: 'Remove' })
    fireEvent.click(removeBtn)
    const next = onChange.mock.calls.at(-1)![0] as EditableRow[]
    expect(next).toHaveLength(3)
    const flagged = next.find((r) => r.id === 'termination')!
    expect(flagged.removed).toBe(true)
  })

  it('"+ Add" appends an empty row', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const addBtn = screen.getByRole('button', { name: /Add clause/i })
    fireEvent.click(addBtn)
    const next = onChange.mock.calls.at(-1)![0] as EditableRow[]
    expect(next).toHaveLength(4)
    const last = next[next.length - 1]
    expect(last).toMatchObject({ id: '', label: '', published: false, isNew: true, removed: false })
  })

  it('move-down swaps a row with its successor', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const firstRow = screen.getByTestId('row-termination')
    const moveDown = within(firstRow).getByRole('button', { name: 'Move down' })
    fireEvent.click(moveDown)
    const next = onChange.mock.calls.at(-1)![0] as EditableRow[]
    expect(next.map((r) => r.id)).toEqual(['auto_renewal', 'termination', 'new_clause'])
  })

  it('move-up is disabled on the first row', () => {
    const onChange = vi.fn()
    render(<EnumerationEditor kind="keyClause" rows={rows()} onChange={onChange} />)
    const firstRow = screen.getByTestId('row-termination')
    const moveUp = within(firstRow).getByRole('button', { name: 'Move up' }) as HTMLButtonElement
    expect(moveUp.disabled).toBe(true)
  })

  it('renders riskArea kind with risk-area noun', () => {
    render(<EnumerationEditor kind="riskArea" rows={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/Risk Areas \(0\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add risk area/i })).toBeTruthy()
  })

  it('surfaces a per-row error message when provided', () => {
    render(
      <EnumerationEditor
        kind="keyClause"
        rows={rows()}
        onChange={vi.fn()}
        errors={{ termination: 'Label too long' }}
      />,
    )
    expect(screen.getByText('Label too long')).toBeTruthy()
  })
})
