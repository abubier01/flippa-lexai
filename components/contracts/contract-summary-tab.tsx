import { CheckCircle, Lightbulb, AlertTriangle } from 'lucide-react'
import type { Contract, ContractAnalysis } from '@/lib/types'

interface Props {
  contract: Contract
  analysis: ContractAnalysis | null
}

export default function ContractSummaryTab({ contract, analysis }: Props) {
  if (!analysis) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Analysis not available for this contract.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-3">AI Summary</h3>
        <p className="text-muted-foreground leading-relaxed">{analysis.summary}</p>
      </div>

      {/* Key points */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Key Points</h3>
        {analysis.key_points && analysis.key_points.length > 0 ? (
          <ul className="space-y-3">
            {(analysis.key_points as string[]).map((point, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span className="text-sm text-foreground">{point}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No key points extracted.</p>
        )}
      </div>

      {/* Suggestions */}
      {analysis.suggestions && (analysis.suggestions as string[]).length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            Recommendations
          </h3>
          <ul className="space-y-3">
            {(analysis.suggestions as string[]).map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-foreground">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
