import Link from 'next/link'
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEMO_CONTRACTS } from '@/lib/demo-data'

export default function DemoReportsPage() {
  const completed = DEMO_CONTRACTS.filter(c => c.status === 'completed' && c.risk_score !== null)
  const highRisk = completed.filter(c => (c.risk_score ?? 0) >= 70)
  const medRisk = completed.filter(c => (c.risk_score ?? 0) >= 40 && (c.risk_score ?? 0) < 70)
  const lowRisk = completed.filter(c => (c.risk_score ?? 0) < 40)
  const avgScore = Math.round(completed.reduce((s, c) => s + (c.risk_score ?? 0), 0) / (completed.length || 1))

  const riskDist = [
    { label: 'High Risk (≥70)', count: highRisk.length, color: 'bg-red-500', pct: completed.length ? (highRisk.length / completed.length) * 100 : 0 },
    { label: 'Medium Risk (40–69)', count: medRisk.length, color: 'bg-yellow-500', pct: completed.length ? (medRisk.length / completed.length) * 100 : 0 },
    { label: 'Low Risk (<40)', count: lowRisk.length, color: 'bg-green-500', pct: completed.length ? (lowRisk.length / completed.length) * 100 : 0 },
  ]

  const contractScores = completed.map(c => ({ title: c.title, score: c.risk_score ?? 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Reports</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Risk overview across your demo contract library.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Contracts Analysed', value: completed.length, icon: BarChart3, color: 'text-primary', bg: 'bg-accent' },
          { label: 'Average Risk Score', value: `${avgScore}/100`, icon: TrendingUp, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'High Risk Contracts', value: highRisk.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Low Risk Contracts', value: lowRisk.length, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Risk distribution */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-5">
        <h3 className="font-semibold text-foreground">Risk Distribution</h3>
        <div className="space-y-3">
          {riskDist.map(({ label, count, color, pct }) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span>{count} contract{count !== 1 ? 's' : ''} ({Math.round(pct)}%)</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-contract bar chart */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-5">
        <h3 className="font-semibold text-foreground">Risk Score by Contract</h3>
        <div className="space-y-3">
          {contractScores.map(({ title, score }) => {
            const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-yellow-500' : 'bg-green-500'
            const textColor = score >= 70 ? 'text-red-600' : score >= 40 ? 'text-yellow-600' : 'text-green-600'
            return (
              <div key={title} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium truncate max-w-xs">{title}</span>
                  <span className={`font-bold ${textColor}`}>{score}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upsell */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground">Export reports & track trends over time</p>
          <p className="text-sm text-muted-foreground mt-0.5">Sign up to export PDF reports, track risk trends, and compare contracts side by side.</p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/auth/sign-up">Get started free</Link>
        </Button>
      </div>
    </div>
  )
}
