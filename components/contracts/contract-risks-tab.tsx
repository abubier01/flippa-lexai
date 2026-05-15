import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ContractAnalysis, Risk } from '@/lib/types'

interface Props {
  analysis: ContractAnalysis | null
}

const severityConfig = {
  high: {
    label: 'High',
    classes: 'bg-red-50 border-red-200 text-red-700',
    badge: 'bg-red-100 text-red-700',
    icon: ShieldAlert,
    iconClass: 'text-red-500',
  },
  medium: {
    label: 'Medium',
    classes: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    badge: 'bg-yellow-100 text-yellow-700',
    icon: AlertTriangle,
    iconClass: 'text-yellow-500',
  },
  low: {
    label: 'Low',
    classes: 'bg-green-50 border-green-200 text-green-700',
    badge: 'bg-green-100 text-green-700',
    icon: ShieldCheck,
    iconClass: 'text-green-500',
  },
}

export default function ContractRisksTab({ analysis }: Props) {
  if (!analysis) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Analysis not available.</p>
      </div>
    )
  }

  const risks = (analysis.risks as Risk[]) || []
  const high = risks.filter(r => r.severity === 'high')
  const medium = risks.filter(r => r.severity === 'medium')
  const low = risks.filter(r => r.severity === 'low')

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'High Risk', count: high.length, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
          { label: 'Medium Risk', count: medium.length, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
          { label: 'Low Risk', count: low.length, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`rounded-xl border p-4 text-center ${bg}`}>
            <div className={`text-2xl font-bold ${color}`}>{count}</div>
            <div className={`text-xs font-medium ${color}`}>{label}</div>
          </div>
        ))}
      </div>

      {/* Risk list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Identified Risks</h3>
        </div>
        {risks.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck className="w-8 h-8 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">No significant risks identified.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...high, ...medium, ...low].map((risk, i) => {
              const config = severityConfig[risk.severity] || severityConfig.low
              const Icon = config.icon
              return (
                <div key={i} className="px-6 py-4 flex items-start gap-4">
                  <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground">{risk.title}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.badge}`}>
                        {config.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{risk.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
