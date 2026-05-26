'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { startCheckoutSession, startHostedCheckoutSession } from '@/app/actions/stripe'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? ''
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

export default function StripeEmbeddedCheckout({ productId }: { productId: string }) {
  const router = useRouter()
  const sessionIdRef = useRef<string | null>(null)
  const clientSecretRef = useRef<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Reset cache when switching products so a remount-in-place (e.g. an in-page
  // plan toggle) doesn't return the prior product's session.
  useEffect(() => {
    clientSecretRef.current = null
    sessionIdRef.current = null
  }, [productId])

  const fetchClientSecret = useCallback(async () => {
    if (clientSecretRef.current) return clientSecretRef.current
    setCheckoutError(null)
    try {
      const { clientSecret, sessionId } = await startCheckoutSession(productId)
      clientSecretRef.current = clientSecret
      sessionIdRef.current = sessionId
      return clientSecret
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start checkout right now.'
      setCheckoutError(message)
      throw err
    }
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

  const goToHostedCheckout = useCallback(async () => {
    setRedirecting(true)
    setCheckoutError(null)
    try {
      const { url } = await startHostedCheckoutSession(productId)
      window.location.assign(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start checkout right now.'
      setCheckoutError(message)
      setRedirecting(false)
    }
  }, [productId])

  const showFallback = !stripePromise || Boolean(checkoutError)

  if (showFallback) {
    return (
      <div className="p-6 sm:p-8">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="mb-2 flex items-center gap-2 font-medium text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Stripe embedded checkout is unavailable
          </div>
          <p className="text-amber-100/90">
            {checkoutError
              ? checkoutError
              : 'Your browser can still complete payment securely through Stripe checkout.'}
          </p>
        </div>

        <Button className="mt-4 w-full" onClick={goToHostedCheckout} disabled={redirecting}>
          {redirecting ? 'Redirecting to Stripe…' : 'Continue to secure checkout'}
        </Button>
      </div>
    )
  }

  return (
    <div>
      {verifying || redirecting ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">
            {redirecting ? 'Redirecting to Stripe…' : 'Confirming your payment…'}
          </p>
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
