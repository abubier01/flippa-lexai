import { createClient } from '@/lib/supabase/server'
import ReportsCharts from '@/components/reports/reports-charts'

interface ContractRow {
  id: string
  risk_score: number | null
  status: string
  created_at: string
}

interface AnalysisRow {
  contract_id: string | null
  risks: unknown
}

interface RiskItem {
  severity: string
}

function computeScore(risks: RiskItem[]): number {
  if (risks.length === 0) return 0
  const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }
  let total = 0
  for (const r of risks) {
    total += weights[r.severity] ?? 20
  }
  return Math.min(100, Math.round(total / risks.length))
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch data in parallel
  const contractsPromise = supabase
    .from('contracts')
    .select('id, risk_score, status, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: true })

  const analysesPromise = supabase
    .from('contract_analyses')
    .select('contract_id, risks')
    .eq('user_id', user!.id)

  const [contractsResult, analysesResult] = await Promise.all([contractsPromise, analysesPromise])

  const allContracts: ContractRow[] = contractsResult.data ?? []
  const allAnalyses: AnalysisRow[] = analysesResult.data ?? []

  // Filter completed contracts first
  const doneContracts: ContractRow[] = []
  for (const c of allContracts) {
    if (c.status === 'completed') {
      doneContracts.push(c)
    }
  }

  // Build risk map from analyses
  const riskMap: Record<string, number> = {}
  let highCount = 0
  let medCount = 0
  let lowCount = 0

  for (const a of allAnalyses) {
    if (!a.contract_id) continue
    const risks = (a.risks as RiskItem[]) ?? []
    for (const r of risks) {
      if (r.severity === 'high') highCount++
      else if (r.severity === 'medium') medCount++
      else lowCount++
    }
    if (risks.length > 0) {
      riskMap[a.contract_id] = computeScore(risks)
    }
  }

  // Helper to get effective score
  function getScore(c: ContractRow): number {
    return riskMap[c.id] ?? c.risk_score ?? 0
  }

  // Compute stats
  const total = allContracts.length
  const completedCount = doneContracts.length

  let riskSum = 0
  for (const c of doneContracts) {
    riskSum += getScore(c)
  }
  const avgRisk = completedCount > 0 ? Math.round(riskSum / completedCount) : 0

  let highRiskCount = 0
  for (const c of doneContracts) {
    if (getScore(c) >= 70) highRiskCount++
  }

  // Monthly data
  const monthlyMap: Record<string, number> = {}
  for (const c of allContracts) {
    const month = new Date(c.created_at).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    })
    monthlyMap[month] = (monthlyMap[month] ?? 0) + 1
  }
  const monthlyData = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }))

  // Risk score buckets
  let bucket0 = 0
  let bucket1 = 0
  let bucket2 = 0
  let bucket3 = 0
  let bucket4 = 0

  for (const c of doneContracts) {
    const s = getScore(c)
    if (s <= 20) bucket0++
    else if (s <= 40) bucket1++
    else if (s <= 60) bucket2++
    else if (s <= 80) bucket3++
    else bucket4++
  }

  const riskBuckets = [
    { range: '0-20', count: bucket0 },
    { range: '21-40', count: bucket1 },
    { range: '41-60', count: bucket2 },
    { range: '61-80', count: bucket3 },
    { range: '81-100', count: bucket4 },
  ]

  const riskDistribution = [
    { name: 'High', value: highCount, fill: 'var(--color-chart-4)' },
    { name: 'Medium', value: medCount, fill: 'var(--color-chart-3)' },
    { name: 'Low', value: lowCount, fill: 'var(--color-chart-2)' },
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
