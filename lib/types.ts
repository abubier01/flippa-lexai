export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  plan: string
  team_id: string | null
  contracts_this_month: number
  created_at: string
}

export interface Contract {
  id: string
  user_id: string
  title: string
  file_name: string
  file_size: number | null
  file_url: string | null
  raw_text: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  risk_score: number
  created_at: string
  updated_at: string
}

export interface ContractAnalysis {
  id: string
  contract_id: string
  user_id: string
  summary: string | null
  key_points: string[]
  risks: Risk[]
  clauses: Record<string, string>
  suggestions: string[]
  created_at: string
}

export interface Risk {
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
}

export interface ChatMessage {
  id: string
  contract_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
