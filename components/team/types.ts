import type { TeamContractRow } from '@/lib/contracts/read'

export interface Member {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  profiles: { id: string; full_name: string | null; plan?: string }
}

export interface Invite {
  id: string
  email: string
  token: string
  created_at: string
  expires_at: string
  status: string
}

/**
 * Shared contract row consumed by the team dashboard. Combines contract
 * metadata with the current analysis_runs row (via contracts.current_run_id).
 * `run.output` holds the structured AnalysisOutput — summary, risk_score,
 * risks[], clauses[], suggestions[]. `run` is null when the contract has not
 * been analyzed yet.
 */
export type SharedContract = TeamContractRow

export interface Analytics {
  totalContracts: number
  avgRisk: number
  highRisks: number
  mediumRisks: number
  lowRisks: number
  memberCount: number
}

export interface Team {
  id: string
  name: string
  owner_id: string
  created_at: string
}
