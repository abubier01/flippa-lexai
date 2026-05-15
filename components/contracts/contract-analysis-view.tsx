'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import RiskBadge from './risk-badge'
import ContractSummaryTab from './contract-summary-tab'
import ContractRisksTab from './contract-risks-tab'
import ContractClausesTab from './contract-clauses-tab'
import ContractChatTab from './contract-chat-tab'
import { FileText, Calendar, Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import type { Contract, ContractAnalysis, ChatMessage, Risk } from '@/lib/types'

interface Props {
  contract: Contract
  analysis: ContractAnalysis | null
  initialMessages: ChatMessage[]
  userPlan?: string
  userTeamId?: string | null
  isTeamViewer?: boolean
}

function computeRiskScoreFromRisks(risks: Risk[]): number {
  if (!risks.length) return 0
  const weights = { high: 100, medium: 55, low: 20 }
  const total = risks.reduce((sum, r) => sum + (weights[r.severity] ?? 20), 0)
  return Math.min(100, Math.round(total / risks.length))
}

export default function ContractAnalysisView({ contract, analysis, initialMessages, userPlan, userTeamId, isTeamViewer = false }: Props) {
  const [tab, setTab] = useState('summary')
  const [shared, setShared] = useState(!!(contract as unknown as Record<string, unknown>).shared_with_team)
  const [sharingLoading, setSharingLoading] = useState(false)

  async function toggleShare() {
    setSharingLoading(true)
    const res = await fetch('/api/team/share-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: contract.id, share: !shared }),
    })
    const data = await res.json()
    setSharingLoading(false)
    if (!res.ok) { toast.error(data.error); return }
    setShared(!shared)
    toast.success(shared ? 'Removed from team library.' : 'Shared with team!')
  }

  // Derive the displayed risk score from actual risk items when analysis is available,
  // so the header badge always matches what is shown in the Risks tab.
  const risks = (analysis?.risks as Risk[]) || []
  const displayedRiskScore = analysis
    ? (risks.length > 0 ? computeRiskScoreFromRisks(risks) : contract.risk_score)
    : contract.risk_score

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground">{contract.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
              </span>
              {contract.file_name && (
                <span className="text-xs text-muted-foreground">{contract.file_name}</span>
              )}
              {contract.file_size && (
                <span className="text-xs text-muted-foreground">{(contract.file_size / 1024).toFixed(1)} KB</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isTeamViewer && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">
                <Users className="w-3 h-3" />
                Team shared
              </span>
            )}
            {!isTeamViewer && userPlan === 'team' && userTeamId && (
              <button
                onClick={toggleShare}
                disabled={sharingLoading}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  shared
                    ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                <Users className="w-3 h-3" />
                {sharingLoading ? '...' : shared ? 'Shared with team' : 'Share with team'}
              </button>
            )}
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{displayedRiskScore}</div>
              <div className="text-xs text-muted-foreground">Risk Score</div>
            </div>
            <RiskBadge score={displayedRiskScore} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="risks">Risks</TabsTrigger>
          <TabsTrigger value="clauses">Clauses</TabsTrigger>
          <TabsTrigger value="chat">AI Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <ContractSummaryTab contract={contract} analysis={analysis} />
        </TabsContent>
        <TabsContent value="risks">
          <ContractRisksTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="clauses">
          <ContractClausesTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="chat">
          <ContractChatTab contractId={contract.id} initialMessages={initialMessages} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
