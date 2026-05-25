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
  const [timerState, setTimerState] = useState(() => ({
    sourceSeconds: initial,
    secondsRemaining: initial,
  }))
  const onExpireRef = useRef(onExpire)

  // Keep the ref in sync so the interval always reads the latest callback
  // without forcing the interval-effect to re-run when onExpire's identity
  // changes (which would clear+restart the timer on every parent render).
  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (initial === 0) return
    let didExpire = false
    let remaining = initial
    const interval = setInterval(() => {
      remaining = Math.max(0, remaining - 1)
      setTimerState({ sourceSeconds: initial, secondsRemaining: remaining })
      if (remaining <= 0) {
        clearInterval(interval)
        if (!didExpire) {
          didExpire = true
          onExpireRef.current?.()
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [initial])

  const secondsRemaining =
    timerState.sourceSeconds === initial ? timerState.secondsRemaining : initial

  return {
    secondsRemaining,
    isActive: secondsRemaining > 0,
    label: formatLabel(secondsRemaining),
  }
}
