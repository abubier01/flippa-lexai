import { FileText } from 'lucide-react'
import type { ContractAnalysis } from '@/lib/types'

interface Props {
  analysis: ContractAnalysis | null
}

const clauseLabels: Record<string, string> = {
  payment_terms: 'Payment Terms',
  termination: 'Termination',
  liability: 'Liability & Indemnification',
  intellectual_property: 'Intellectual Property',
  governing_law: 'Governing Law',
  dispute_resolution: 'Dispute Resolution',
}

export default function ContractClausesTab({ analysis }: Props) {
  if (!analysis) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Analysis not available.</p>
      </div>
    )
  }

  const clauses = analysis.clauses as Record<string, string> || {}
  const entries = Object.entries(clauses)

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Key Clauses</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Extracted key provisions from the contract</p>
      </div>
      {entries.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-muted-foreground">No clauses extracted.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map(([key, value]) => (
            <div key={key} className="px-6 py-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {clauseLabels[key] || key.replace(/_/g, ' ')}
              </p>
              <p className="text-sm text-foreground leading-relaxed">{value || 'Not specified'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
