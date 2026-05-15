'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Cpu } from 'lucide-react'

export default function ContractProcessing({ contractId, contractTitle, status }: {
  contractId: string
  contractTitle: string
  status?: string
}) {
  const router = useRouter()
  const [step, setStep] = useState('Connecting to AI…')

  useEffect(() => {
    let cancelled = false

    async function runAnalysis() {
      try {
        // If still pending (not yet processing), trigger the analysis now
        if (status === 'pending') {
          setStep('Reading contract…')
          const res = await fetch('/api/contracts/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractId }),
          })
          if (!cancelled) {
            if (res.ok) {
              setStep('Done! Loading results…')
            } else {
              setStep('Analysis encountered an error. Reloading…')
            }
            router.refresh()
          }
        } else {
          // Already processing — just poll
          setStep('AI is processing your contract…')
          const interval = setInterval(() => {
            if (!cancelled) router.refresh()
          }, 3000)
          return () => clearInterval(interval)
        }
      } catch {
        if (!cancelled) {
          setStep('Something went wrong. Retrying…')
          setTimeout(() => router.refresh(), 3000)
        }
      }
    }

    runAnalysis()
    return () => { cancelled = true }
  }, [contractId, status, router])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-accent border border-primary/20 flex items-center justify-center mb-6">
        <Cpu className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Analyzing your contract</h2>
      <p className="text-muted-foreground mb-2 max-w-sm">
        Our AI is reading and analyzing <strong className="text-foreground">{contractTitle}</strong>. This usually takes under 15 seconds.
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span>{step}</span>
      </div>
    </div>
  )
}
