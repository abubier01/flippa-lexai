import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText, Upload } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import ContractRowActions from '@/components/contracts/contract-row-actions'

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

export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contracts } = await supabase
    .from('contracts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
  const getRiskDisplay = (status: string, stored: number | null) => {
    if (status === 'failed') return { score: null as number | null, text: 'Unavailable' }
    if (status !== 'completed') return { score: null as number | null, text: 'Analyzing' }
    if (stored === null) return { score: null as number | null, text: 'Unavailable' }
    return { score: stored, text: null as string | null }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">All Contracts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contracts?.length ?? 0} contract{(contracts?.length ?? 0) !== 1 ? 's' : ''} in your library
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="w-4 h-4 mr-1.5" />
            Upload New
          </Link>
        </Button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {!contracts || contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium text-foreground mb-1">No contracts yet</p>
            <p className="text-sm text-muted-foreground mb-6">
              Upload your first contract to start getting AI-powered analysis.
            </p>
            <Button asChild size="sm">
              <Link href="/upload">
                <Upload className="w-4 h-4 mr-1.5" />
                Upload a contract
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-secondary/30 text-xs font-medium text-muted-foreground">
              <div className="col-span-5">Name</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Risk</div>
              <div className="col-span-2">Uploaded</div>
              <div className="col-span-1" />
            </div>

            <div className="divide-y divide-border">
              {contracts.map(contract => {
                const riskDisplay = getRiskDisplay(contract.status, contract.risk_score)
                return (
                <div key={contract.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors items-center">
                  <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <FileText className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{contract.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{contract.file_name}</p>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPipelineStatusClass(contract.status)}`}>
                      {contract.status}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    {riskDisplay.score === null ? (
                      <span className="text-xs text-muted-foreground">{riskDisplay.text}</span>
                    ) : (
                      <div className={`risk-score-pill ${getRiskScoreClass(riskDisplay.score)}`}>
                        {riskDisplay.score}
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    <ContractRowActions contractId={contract.id} />
                  </div>
                </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
