import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText, Upload, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import RiskBadge from '@/components/contracts/risk-badge'

export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contracts } = await supabase
    .from('contracts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  // Fetch analyses to derive accurate risk scores from actual risk items
  const { data: analyses } = await supabase
    .from('contract_analyses')
    .select('contract_id, risks')
    .eq('user_id', user!.id)

  const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }
  const analysisRiskMap: Record<string, number> = {}
  for (const a of analyses ?? []) {
    const risks = a.risks as { severity: string }[] || []
    if (a.contract_id && risks.length > 0) {
      analysisRiskMap[a.contract_id] = Math.min(100, Math.round(
        risks.reduce((sum, r) => sum + (weights[r.severity] ?? 20), 0) / risks.length
      ))
    }
  }

  const effectiveScore = (id: string, stored: number | null) =>
    analysisRiskMap[id] ?? stored ?? 0

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

      <div className="bg-card rounded-xl border border-border overflow-hidden">
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
              {contracts.map(contract => (
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
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      contract.status === 'completed' ? 'bg-green-100 text-green-700' :
                      contract.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      contract.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {contract.status}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <RiskBadge score={effectiveScore(contract.id, contract.risk_score)} />
                  </div>

                  <div className="sm:col-span-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/contracts/${contract.id}`}>
                        <ArrowRight className="w-4 h-4" />
                        <span className="sr-only">View</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
