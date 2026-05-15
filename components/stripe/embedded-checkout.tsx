'use client'

import { useCallback, useRef, useState } from 'react'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { startCheckoutSession } from '@/app/actions/stripe'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function StripeEmbeddedCheckout({ productId }: { productId: string }) {
  const router = useRouter()
  const sessionIdRef = useRef<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const fetchClientSecret = useCallback(async () => {
    const { clientSecret, sessionId } = await startCheckoutSession(productId)
    // Store session ID in ref so onComplete can access it without re-render
    sessionIdRef.current = sessionId
    return clientSecret
  }, [productId])

  const handleComplete = useCallback(async () => {
    setVerifying(true)
    try {
      const sessionId = sessionIdRef.current
      if (!sessionId) throw new Error('No session ID')

      const res = await fetch('/api/stripe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()

      if (data.success) {
        router.push(`/upgrade/success?plan=${data.plan}`)
      } else {
        router.push('/upgrade/success?status=error')
      }
    } catch {
      router.push('/upgrade/success?status=error')
    }
  }, [router])

  return (
    <div>
      {verifying ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Confirming your payment…</p>
        </div>
      ) : (
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={{ fetchClientSecret, onComplete: handleComplete }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  )
}
