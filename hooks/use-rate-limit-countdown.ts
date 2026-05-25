'use client'

import { useEffect, useRef, useState } from 'react'

export type RateLimitCountdownState = {
  secondsRemaining: number
  isActive: boolean
  label: string
}

function formatLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function useRateLimitCountdown(
  retryAfterSeconds: number,
  onExpire?: () => void,
): RateLimitCountdownState {
  const initial = Math.max(0, Math.floor(retryAfterSeconds))
  const [secondsRemaining, setSecondsRemaining] = useState(initial)
  const expiredRef = useRef(initial === 0)
  const onExpireRef = useRef(onExpire)

  // Keep the ref in sync so the interval always reads the latest callback
  // without forcing the interval-effect to re-run when onExpire's identity
  // changes (which would clear+restart the timer on every parent render).
  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (initial === 0) return
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          if (!expiredRef.current) {
            expiredRef.current = true
            onExpireRef.current?.()
          }
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [initial])

  return {
    secondsRemaining,
    isActive: secondsRemaining > 0,
    label: formatLabel(secondsRemaining),
  }
}
