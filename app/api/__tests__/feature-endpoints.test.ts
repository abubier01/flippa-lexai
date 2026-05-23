import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as exportReport } from '../reports/export/route'
import { GET as getClauses } from '../contracts/[id]/clauses/route'
import { GET as getRiskBreakdown } from '../contracts/[id]/risk-breakdown/route'
import { GET as getSsoConfig } from '../sso/config/route'

const mocks = vi.hoisted(() => {
  class MockPlanGateError extends Error {
    feature: string
    tier: string
    constructor(feature: string, tier: string) {
      super(`${feature} denied on ${tier}`)
      this.name = 'PlanGateError'
      this.feature = feature
      this.tier = tier
    }
  }

  return {
    createClient: vi.fn(),
    assertHasFeature: vi.fn(),
    PlanGateError: MockPlanGateError,
    state: {
      user: { id: 'user_1' } as null | { id: string },
      contractId: 'contract_1',
      hasOwnedContract: true,
      exportContracts: [
        {
          id: 'contract_1',
          title: 'MSA',
          status: 'completed',
          risk_score: 55,
          created_at: '2026-05-23T00:00:00.000Z',
        },
      ],
      clauses: { payment_terms: 'Net 30', liability: 'Capped at fees paid' } as Record<string, string> | null,
      risks: [
        { severity: 'high' },
        { severity: 'medium' },
        { severity: 'low' },
      ] as Array<{ severity?: string }>,
    },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/plan/access', () => ({
  assertHasFeature: mocks.assertHasFeature,
  PlanGateError: mocks.PlanGateError,
}))

function buildSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: mocks.state.user } }),
    },
    from: (table: string) => ({
      select: (columns: string) => {
        const filters: Record<string, unknown> = {}
        const query = {
          eq: (column: string, value: unknown) => {
            filters[column] = value
            return query
          },
          order: async () => {
            if (table !== 'contracts') return { data: [], error: null }
            return { data: mocks.state.exportContracts, error: null }
          },
          single: async () => {
            if (table !== 'contracts') return { data: null }
            const owned = mocks.state.hasOwnedContract
              && filters.id === mocks.state.contractId
              && filters.user_id === mocks.state.user?.id
            return { data: owned ? { id: mocks.state.contractId } : null }
          },
          maybeSingle: async () => {
            if (table !== 'contract_analyses') return { data: null, error: null }
            if (columns === 'clauses') {
              return { data: mocks.state.clauses ? { clauses: mocks.state.clauses } : null, error: null }
            }
            if (columns === 'risks') {
              return { data: { risks: mocks.state.risks }, error: null }
            }
            return { data: null, error: null }
          },
        }
        return query
      },
    }),
  }
}

describe('feature-gated endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.user = { id: 'user_1' }
    mocks.state.contractId = 'contract_1'
    mocks.state.hasOwnedContract = true
    mocks.state.clauses = { payment_terms: 'Net 30', liability: 'Capped at fees paid' }
    mocks.state.risks = [{ severity: 'high' }, { severity: 'medium' }, { severity: 'low' }]
    mocks.assertHasFeature.mockResolvedValue({ tier: 'pro', status: 'active' })
    mocks.createClient.mockResolvedValue(buildSupabaseClient())
  })

  it('returns CSV export for users with exportPdf feature', async () => {
    const res = await exportReport()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const body = await res.text()
    expect(body).toContain('id,title,status,risk_score,created_at')
    expect(body).toContain('contract_1,MSA,completed,55')
    expect(mocks.assertHasFeature).toHaveBeenCalledWith('user_1', 'exportPdf')
  })

  it('returns extracted clauses for users with clauseExtraction feature', async () => {
    const res = await getClauses(new Request('http://localhost/api/contracts/contract_1/clauses'), {
      params: Promise.resolve({ id: 'contract_1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { contractId: string; clauses: Record<string, string> }
    expect(body.contractId).toBe('contract_1')
    expect(body.clauses.payment_terms).toBe('Net 30')
    expect(mocks.assertHasFeature).toHaveBeenCalledWith('user_1', 'clauseExtraction')
  })

  it('returns advanced risk breakdown for users with advancedRiskBreakdown feature', async () => {
    const res = await getRiskBreakdown(new Request('http://localhost/api/contracts/contract_1/risk-breakdown'), {
      params: Promise.resolve({ id: 'contract_1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      counts: { high: number; medium: number; low: number }
      totalRisks: number
      averageRiskScore: number
    }
    expect(body.counts).toEqual({ high: 1, medium: 1, low: 1 })
    expect(body.totalRisks).toBe(3)
    expect(body.averageRiskScore).toBe(58)
    expect(mocks.assertHasFeature).toHaveBeenCalledWith('user_1', 'advancedRiskBreakdown')
  })

  it('returns 501 for team users on placeholder sso config endpoint', async () => {
    mocks.assertHasFeature.mockResolvedValueOnce({ tier: 'team', status: 'active' })
    const res = await getSsoConfig()
    expect(res.status).toBe(501)
    expect(mocks.assertHasFeature).toHaveBeenCalledWith('user_1', 'sso')
  })

  it('returns 403 with feature metadata when a gate fails', async () => {
    mocks.assertHasFeature.mockRejectedValueOnce(new mocks.PlanGateError('exportPdf', 'solo'))
    const res = await exportReport()
    expect(res.status).toBe(403)
    const body = await res.json() as { feature?: string }
    expect(body.feature).toBe('exportPdf')
  })
})
