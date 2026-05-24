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

export interface SharedContract {
  id: string
  title: string
  status: string
  risk_score: number
  created_at: string
  user_id: string
  contract_analyses: { risks: { severity: string }[]; summary?: string }[]
}

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
