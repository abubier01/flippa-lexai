'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'

type BillingStatus = {
  status: 'active' | 'past_due' | 'grace_period' | 'canceled'
  daysRemaining?: number
}

const DISMISS_KEY = 'billing-dunning-dismissed'
const CACHE_MS = 60_000

let cachedStatus: BillingStatus | null = null
let cachedAt = 0

async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await fetch('/api/billing/status', { method: 'GET', cache: 'no-store' })
  if (!res.ok) {
    return { status: 'active' }
  }
  return res.json() as Promise<BillingStatus>
}

export default function DunningBanner() {
  const [status, setStatus] = useState<BillingStatus | null>(() => {
    const now = Date.now()
    if (cachedStatus && now - cachedAt < CACHE_MS) {
      return cachedStatus
    }
    return null
  })
  const [dismissed, setDismissed] = useState(() => (
    typeof window !== 'undefined' && window.sessionStorage.getItem(DISMISS_KEY) === '1'
  ))
  const [openingPortal, setOpeningPortal] = useState(false)

  useEffect(() => {
    if (status) {
      return
    }

    let mounted = true
    fetchBillingStatus()
      .then((next) => {
        if (!mounted) return
        cachedStatus = next
        cachedAt = Date.now()
        setStatus(next)
      })
      .catch(() => {
        if (mounted) setStatus({ status: 'active' })
      })
    return () => {
      mounted = false
    }
  }, [status])

  const tone = useMemo(() => {
    if (status?.status === 'canceled') {
      return 'border-red-300 bg-red-50 text-red-900'
    }
    return 'border-amber-300 bg-amber-50 text-amber-900'
  }, [status?.status])

  if (!status || status.status === 'active' || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DISMISS_KEY, '1')
    }
  }

  const openPortal = async () => {
    try {
      setOpeningPortal(true)
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json() as { url?: string }
      if (res.ok && data.url) {
        window.location.href = data.url
      }
    } finally {
      setOpeningPortal(false)
    }
  }

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 ${tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {status.status === 'canceled' ? (
            <p className="text-sm font-medium">
              Your subscription is no longer active. Resubscribe to restore access.
            </p>
          ) : (
            <p className="text-sm font-medium">
              Your payment couldn&apos;t be processed. Update your card to keep access.
              {status.status === 'grace_period' && typeof status.daysRemaining === 'number' && (
                <> Grace time left: {status.daysRemaining} day{status.daysRemaining === 1 ? '' : 's'}.</>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status.status === 'canceled' ? (
            <Button asChild size="sm" variant="destructive">
              <Link href="/upgrade">Resubscribe</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={openPortal} disabled={openingPortal}>
              <CreditCard className="mr-1 h-4 w-4" />
              {openingPortal ? 'Opening...' : 'Update card'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
