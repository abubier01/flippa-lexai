import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Upload, FileText, AlertTriangle, CheckCircle, ArrowRight, TrendingUp, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import RiskBadge from '@/components/contracts/risk-badge'
import { PLAN_LIMITS, type PlanType } from '@/lib/plan-limits'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contracts } = await supabase
    .from('contracts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: allContracts } = await supabase
    .from('contracts')
    .select('id, risk_score, status')
    .eq('user_id', user!.id)

  // Fetch user profile for plan and usage
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, contracts_this_month, usage_reset_at')
    .eq('id', user!.id)
    .single()

  const plan = (profile?.plan || 'free') as PlanType
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

  // Fetch analyses to derive accurate risk scores from actual risk items
  const { data: analyses } = await supabase
    .from('contract_analyses')
    .select('contract_id, risks')
    .eq('user_id', user!.id)

  // Build contract_id -> effective risk score from risk items
  const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }
  const analysisRiskMap: Record<string, number> = {}
  analyses?.forEach(a => {
    const risks = a.risks as { severity: string }[] || []
    if (a.contract_id && risks.length > 0) {
      const derived = Math.min(100, Math.round(
        risks.reduce((sum, r) => sum + (weights[r.severity] ?? 20), 0) / risks.length
      ))
      analysisRiskMap[a.contract_id] = derived
    }
  })

  const effectiveScore = (id: string, storedScore: number | null) =>
    analysisRiskMap[id] ?? storedScore ?? 0

  const total = allContracts?.length ?? 0
  const completedContracts = allContracts?.filter(c => c.status === 'completed') ?? []
  const completed = completedContracts.length
  const highRisk = completedContracts.filter(c => effectiveScore(c.id, c.risk_score) >= 70).length
  const avgRisk = completed > 0
    ? Math.round(completedContracts.reduce((sum, c) => sum + effectiveScore(c.id, c.risk_score), 0) / completed)
    : 0

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
      {/* Welcome + Usage */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Overview</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total === 0 ? 'Upload your first contract to get started.' : `You have ${total} contract${total !== 1 ? 's' : ''} in your library.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {plan === 'free' && (
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

      {/* Upgrade banner for free users */}
      {plan === 'free' && usagePercent >= 60 && (
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
          <div key={label} className="bg-card rounded-xl border border-border p-5">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent contracts */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
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
                  <RiskBadge score={effectiveScore(contract.id, contract.risk_score)} />
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    contract.status === 'completed' ? 'bg-green-100 text-green-700' :
                    contract.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    contract.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-muted text-muted-foreground'
                  }`}>
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
