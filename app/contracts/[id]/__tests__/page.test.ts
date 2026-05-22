import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContractPage from '../page'

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
  hasTeamAccess: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  state: {
    userId: 'user_1',
    profile: { plan: 'team', team_id: 'team_1' },
    contract: {
      id: 'contract_1',
      user_id: 'user_1',
      shared_with_team: true,
      team_id: 'team_1',
      status: 'complete',
      title: 'NDA',
      created_at: '2026-05-22T00:00:00Z',
      risk_score: 55,
      file_name: null,
      file_size: null,
    },
    analysis: null,
    messages: [],
  },
}))

class ServiceQuery {
  private filters: Record<string, unknown> = {}
  constructor(private table: string) {}

  select() {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value
    return this
  }

  async single() {
    if (this.table === 'profiles') return { data: mocks.state.profile }
    if (this.table === 'contracts') {
      if (this.filters.id !== mocks.state.contract.id) return { data: null }
      return { data: mocks.state.contract }
    }
    if (this.table === 'contract_analyses') return { data: mocks.state.analysis }
    return { data: null }
  }

  async order() {
    if (this.table === 'chat_messages') return { data: mocks.state.messages }
    return { data: [] }
  }
}

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}))

vi.mock('@/lib/plan/access', () => ({
  hasTeamAccess: mocks.hasTeamAccess,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createServiceClient,
}))

vi.mock('@/components/contracts/contract-analysis-view', () => ({
  default: function ContractAnalysisView() {
    return null
  },
}))

vi.mock('@/components/contracts/contract-processing', () => ({
  default: function ContractProcessing() {
    return null
  },
}))

describe('Contract read entitlement checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.userId = 'user_1'
    mocks.state.profile = { plan: 'team', team_id: 'team_1' }
    mocks.state.contract = {
      id: 'contract_1',
      user_id: 'user_1',
      shared_with_team: true,
      team_id: 'team_1',
      status: 'complete',
      title: 'NDA',
      created_at: '2026-05-22T00:00:00Z',
      risk_score: 55,
      file_name: null,
      file_size: null,
    }
    mocks.state.analysis = null
    mocks.state.messages = []

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: mocks.state.userId } },
        }),
      },
    })

    mocks.createServiceClient.mockReturnValue({
      from: (table: string) => new ServiceQuery(table),
    })
  })

  it('allows owner access even when team entitlement is stale', async () => {
    mocks.hasTeamAccess.mockResolvedValue({ ok: false, via: null, teamId: null })
    const element = (await ContractPage({
      params: Promise.resolve({ id: 'contract_1' }),
    })) as unknown as { props: Record<string, unknown> }

    expect(mocks.notFound).not.toHaveBeenCalled()
    expect(element.props.isTeamViewer).toBe(false)
  })

  it('allows active member access only when entitlement team matches contract team', async () => {
    mocks.state.contract.user_id = 'owner_1'
    mocks.hasTeamAccess.mockResolvedValue({ ok: true, via: 'membership', teamId: 'team_1' })
    const element = (await ContractPage({
      params: Promise.resolve({ id: 'contract_1' }),
    })) as unknown as { props: Record<string, unknown> }

    expect(mocks.notFound).not.toHaveBeenCalled()
    expect(element.props.isTeamViewer).toBe(true)
    expect(element.props.userTeamId).toBe('team_1')
  })

  it('denies shared contract reads when owner team entitlement is expired', async () => {
    mocks.state.contract.user_id = 'owner_1'
    mocks.hasTeamAccess.mockResolvedValue({ ok: false, via: null, teamId: 'team_1' })

    await expect(
      ContractPage({ params: Promise.resolve({ id: 'contract_1' }) }),
    ).rejects.toThrow('NOT_FOUND')
  })
})
