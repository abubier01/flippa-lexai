import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Upload, FileText, AlertTriangle, CheckCircle, ArrowRight, TrendingUp, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import RiskBadge from '@/components/contracts/risk-badge'
import { DEMO_CONTRACTS, DEMO_STATS } from '@/lib/demo-data'

export default function DemoDashboardPage() {
  const stats = [
    { label: 'Total Contracts', value: DEMO_STATS.totalContracts, icon: FileText, color: 'text-primary', bg: 'bg-accent' },
    { label: 'Analyzed', value: DEMO_STATS.completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'High Risk', value: DEMO_STATS.highRisk, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Avg Risk Score', value: `${DEMO_STATS.avgRisk}/100`, icon: TrendingUp, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  ]

  const recent = DEMO_CONTRACTS.slice(0, 5)

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome + CTA */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Overview</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            You have {DEMO_STATS.totalContracts} contracts in your library. <span className="text-primary font-medium">This is demo data.</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground mb-1">{DEMO_STATS.contractsThisMonth}/10 analyses this month</p>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: '30%' }} />
            </div>
          </div>
          <Button asChild>
            <Link href="/demo/upload">
              <Upload className="w-4 h-4 mr-1.5" />
              Upload Contract
            </Link>
          </Button>
        </div>
      </div>

      {/* Upgrade banner */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-accent rounded-xl border border-primary/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Enjoying the demo?</p>
            <p className="text-xs text-muted-foreground">Sign up free and analyse your first real contract in under 30 seconds.</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/auth/sign-up">Create free account</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
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
          <Link href="/demo/contracts" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {recent.map(contract => (
            <Link
              key={contract.id}
              href={`/demo/contracts/${contract.id}`}
              className="flex items-center gap-4 px-6 py-4 hover:bg-secondary/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{contract.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                  {contract.file_name && ` · ${contract.file_name}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {contract.risk_score !== null && <RiskBadge score={contract.risk_score} />}
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  contract.status === 'completed' ? 'bg-green-100 text-green-700' :
                  contract.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {contract.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
