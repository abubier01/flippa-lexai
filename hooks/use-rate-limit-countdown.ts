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

  useEffect(() => {
    if (initial === 0) return
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          if (!expiredRef.current) {
            expiredRef.current = true
            onExpire?.()
          }
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [initial, onExpire])

  return {
    secondsRemaining,
    isActive: secondsRemaining > 0,
    label: formatLabel(secondsRemaining),
  }
}
