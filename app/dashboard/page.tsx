import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Upload, FileText, AlertTriangle, CheckCircle, ArrowRight, TrendingUp, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { PLAN_LIMITS, normalizePlanType, type PlanType } from '@/lib/plan-limits'
import { log } from '@/lib/log'

interface ContractRiskScoreRow {
  contract_id: string
  risk_score: number | null
  status: string
  computed_risk_score: number | null
}

interface ContractScoreSummary {
  total: number
  completed_count: number
  high_risk_count: number
  avg_risk_score: number
  bucket_0_20: number
  bucket_21_40: number
  bucket_41_60: number
  bucket_61_80: number
  bucket_81_100: number
}

const getRiskScoreClass = (score: number) => {
  if (score >= 61) return 'risk-score-high'
  if (score >= 31) return 'risk-score-med'
  return 'risk-score-low'
}

const getPipelineStatusClass = (status: string) => {
  if (status === 'completed') return 'bg-emerald-500/12 text-emerald-500 border border-emerald-500/25'
  if (status === 'processing') return 'bg-primary/12 text-primary border border-primary/30'
  if (status === 'failed') return 'bg-destructive/12 text-destructive border border-destructive/25'
  return 'bg-muted text-muted-foreground border border-border'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // The scores RPC is still needed to populate per-contract risk values in
  // the recent-contracts list below. The summary RPC supplies the stat values
  // (scalars + buckets) so we don't recompute them in JS.
  const [contractsRes, scoresRes, summaryRes, profileRes] = await Promise.all([
    supabase
      .from('contracts')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.rpc('get_user_contract_risk_scores'),
    supabase.rpc('get_user_contract_score_summary'),
    supabase
      .from('profiles')
      .select('plan, contracts_this_month, usage_reset_at')
      .eq('id', user!.id)
      .single(),
  ])

  const rpcErrors = [
    { name: 'get_user_contract_risk_scores', error: scoresRes.error },
    { name: 'get_user_contract_score_summary', error: summaryRes.error },
  ].filter((entry) => entry.error)

  if (rpcErrors.length > 0) {
    log.error('dashboard.rpc.failed', {
      userId: user?.id,
      rpcErrors: rpcErrors.map((entry) => ({
        name: entry.name,
        message: entry.error?.message,
      })),
    })
  }

  const contracts = contractsRes.data
  const scoreRows: ContractRiskScoreRow[] = (scoresRes.data as ContractRiskScoreRow[] | null) ?? []
  // PostgREST returns RETURNS TABLE(...) results as an array even for a
  // single-row function — unwrap the first element.
  const [summary] = (summaryRes.data as ContractScoreSummary[] | null) ?? []
  const profile = profileRes.data

  const plan: PlanType = normalizePlanType(profile?.plan)
  const limits = PLAN_LIMITS[plan]
  let contractsThisMonth = profile?.contracts_this_month || 0
  const usageResetAt = profile?.usage_reset_at ? new Date(profile.usage_reset_at) : new Date()

  // Check if we need to reset (for display purposes)
  const now = new Date()
  const monthsSinceReset = (now.getFullYear() - usageResetAt.getFullYear()) * 12 +
                           (now.getMonth() - usageResetAt.getMonth())
  if (monthsSinceReset >= 1) {
    contractsThisMonth = 0
  }

  // Build contract_id -> computed risk score from RPC result (badge lookup).
  const analysisRiskMap = new Map<string, number>()
  for (const row of scoreRows) {
    if (row.computed_risk_score !== null) {
      analysisRiskMap.set(row.contract_id, row.computed_risk_score)
    }
  }

  const effectiveScore = (id: string, storedScore: number | null) =>
    analysisRiskMap.get(id) ?? storedScore ?? 0

  // Stat scalars come straight from the summary RPC — no JS aggregation.
  const total = summary?.total ?? 0
  const completed = summary?.completed_count ?? 0
  const highRisk = summary?.high_risk_count ?? 0
  const avgRisk = summary?.avg_risk_score ?? 0

  const stats = [
    { label: 'Total Contracts', value: total, icon: FileText, color: 'text-primary', bg: 'bg-accent' },
    { label: 'Analyzed', value: completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'High Risk', value: highRisk, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Avg Risk Score', value: `${avgRisk}/100`, icon: TrendingUp, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  ]

  const usagePercent = limits.contractsPerMonth === -1 
    ? 0 
    : Math.min(100, (contractsThisMonth / limits.contractsPerMonth) * 100)

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 md:pb-0">
      {rpcErrors.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Some dashboard metrics are currently unavailable and may appear as zeros.
        </div>
      )}
      {/* Welcome + Usage */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Overview</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total === 0 ? 'Upload your first contract to get started.' : `You have ${total} contract${total !== 1 ? 's' : ''} in your library.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {plan === 'solo' && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">
                {contractsThisMonth}/{limits.contractsPerMonth} analyses this month
              </p>
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${usagePercent >= 80 ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${usagePercent}%` }} 
                />
              </div>
            </div>
          )}
          <Button asChild>
            <Link href="/upload">
              <Upload className="w-4 h-4 mr-1.5" />
              Upload Contract
            </Link>
          </Button>
        </div>
      </div>

      {/* Upgrade banner for solo users */}
      {plan === 'solo' && usagePercent >= 60 && (
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-accent rounded-xl border border-primary/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {usagePercent >= 100 ? "You've reached your monthly limit" : "Running low on analyses"}
              </p>
              <p className="text-xs text-muted-foreground">
                Upgrade to Pro for unlimited contract analyses and AI chat.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant={usagePercent >= 100 ? 'default' : 'outline'}>
            <Link href="/settings">Upgrade to Pro</Link>
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card rounded-xl p-5">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            <svg className="w-full h-8 mt-2" viewBox="0 0 100 30" preserveAspectRatio="none">
              <path
                d="M0,25 Q15,10 30,22 T60,5 T90,20 L100,20"
                fill="none"
                stroke="currentColor"
                className="text-primary"
                strokeWidth="2.5"
              />
            </svg>
          </div>
        ))}
      </div>

      {/* Recent contracts */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Recent Contracts</h3>
          <Link href="/contracts" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {!contracts || contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium text-foreground mb-1">No contracts yet</p>
            <p className="text-sm text-muted-foreground mb-6">Upload a contract to get your first AI analysis.</p>
            <Button asChild size="sm">
              <Link href="/upload">
                <Upload className="w-4 h-4 mr-1.5" />
                Upload your first contract
              </Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {contracts.map(contract => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-secondary/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <FileText className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{contract.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                    {contract.file_name && ` · ${contract.file_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className={`risk-score-pill ${getRiskScoreClass(effectiveScore(contract.id, contract.risk_score))}`}>
                    {effectiveScore(contract.id, contract.risk_score)}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPipelineStatusClass(contract.status)}`}>
                    {contract.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
