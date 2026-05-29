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

export interface ChatMessage {
  id: string
  contract_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
