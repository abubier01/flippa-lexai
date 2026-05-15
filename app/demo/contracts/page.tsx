import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText, Upload, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import RiskBadge from '@/components/contracts/risk-badge'
import { DEMO_CONTRACTS } from '@/lib/demo-data'

export default function DemoContractsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">All Contracts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {DEMO_CONTRACTS.length} contracts in your demo library
          </p>
        </div>
        <Button asChild>
          <Link href="/demo/upload">
            <Upload className="w-4 h-4 mr-1.5" />
            Upload New
          </Link>
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-secondary/30 text-xs font-medium text-muted-foreground">
          <div className="col-span-5">Name</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Risk</div>
          <div className="col-span-2">Uploaded</div>
          <div className="col-span-1" />
        </div>

        <div className="divide-y divide-border">
          {DEMO_CONTRACTS.map(contract => (
            <div key={contract.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors items-center">
              <div className="sm:col-span-5 flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
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
                  'bg-muted text-muted-foreground'
                }`}>
                  {contract.status}
                </span>
              </div>

              <div className="sm:col-span-2">
                {contract.risk_score !== null
                  ? <RiskBadge score={contract.risk_score} />
                  : <span className="text-xs text-muted-foreground">Analysing...</span>
                }
              </div>

              <div className="sm:col-span-2 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
              </div>

              <div className="sm:col-span-1 flex justify-end">
                {contract.status === 'completed' ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/demo/contracts/${contract.id}`}>
                      <ArrowRight className="w-4 h-4" />
                      <span className="sr-only">View</span>
                    </Link>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground px-2">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
