import { createClient } from '@/lib/supabase/server'
import dynamic from 'next/dynamic'

const ReportsCharts = dynamic(() => import('@/components/reports/reports-charts'), {
  loading: () => (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      <div className="bg-card rounded-xl border border-border p-6 text-sm text-muted-foreground">
        Loading charts...
      </div>
    </div>
  ),
})

interface RiskDistributionRow {
  severity: 'high' | 'medium' | 'low'
  count: number
}

interface MonthlyContractRow {
  month: string
  count: number
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

export default async function ReportsPage() {
  const supabase = await createClient()

  const [distRes, monthlyRes, summaryRes] = await Promise.all([
    supabase.rpc('get_user_risk_distribution'),
    supabase.rpc('get_user_monthly_contracts'),
    supabase.rpc('get_user_contract_score_summary'),
  ])

  const distRows: RiskDistributionRow[] = (distRes.data as RiskDistributionRow[] | null) ?? []
  const monthlyRows: MonthlyContractRow[] = (monthlyRes.data as MonthlyContractRow[] | null) ?? []
  // PostgREST returns RETURNS TABLE(...) results as an array even when the
  // function only ever yields one row — unwrap the first element.
  const [summary] = (summaryRes.data as ContractScoreSummary[] | null) ?? []

  // Risk severity distribution — RPC is sparse; default missing buckets to 0.
  const severityCounts: Record<'high' | 'medium' | 'low', number> = {
    high: 0,
    medium: 0,
    low: 0,
  }
  for (const row of distRows) {
    if (row.severity === 'high' || row.severity === 'medium' || row.severity === 'low') {
      severityCounts[row.severity] = Number(row.count) || 0
    }
  }

  const riskDistribution = [
    { name: 'High', value: severityCounts.high, fill: 'var(--color-chart-4)' },
    { name: 'Medium', value: severityCounts.medium, fill: 'var(--color-chart-3)' },
    { name: 'Low', value: severityCounts.low, fill: 'var(--color-chart-2)' },
  ]

  // Monthly data — trailing 12 months only (RPC-enforced window); sparse.
  // Older history is intentionally excluded for chart readability.
  const monthlyData = monthlyRows.map(row => ({
    month: new Date(row.month).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    }),
    count: Number(row.count) || 0,
  }))

  // Single-row roll-up RPC — defaults to zero when the user has no contracts
  // (function still returns one row from the empty aggregate).
  const total = summary?.total ?? 0
  const completedCount = summary?.completed_count ?? 0
  const highRiskCount = summary?.high_risk_count ?? 0
  const avgRisk = summary?.avg_risk_score ?? 0

  const riskBuckets = [
    { range: '0-20',   count: summary?.bucket_0_20 ?? 0 },
    { range: '21-40',  count: summary?.bucket_21_40 ?? 0 },
    { range: '41-60',  count: summary?.bucket_41_60 ?? 0 },
    { range: '61-80',  count: summary?.bucket_61_80 ?? 0 },
    { range: '81-100', count: summary?.bucket_81_100 ?? 0 },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      <ReportsCharts
        total={total}
        completed={completedCount}
        avgRisk={avgRisk}
        highRisk={highRiskCount}
        riskDistribution={riskDistribution}
        monthlyData={monthlyData}
        riskBuckets={riskBuckets}
      />
    </div>
  )
}
