// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRateLimitCountdown } from '../use-rate-limit-countdown'

describe('useRateLimitCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts active and counts down each second', () => {
    const { result } = renderHook(() => useRateLimitCountdown(3))
    expect(result.current.isActive).toBe(true)
    expect(result.current.secondsRemaining).toBe(3)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.secondsRemaining).toBe(2)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.secondsRemaining).toBe(1)
  })

  it('deactivates at zero and calls onExpire once', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useRateLimitCountdown(2, onExpire))

    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.isActive).toBe(false)
    expect(result.current.secondsRemaining).toBe(0)
    expect(onExpire).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(5000) })
    expect(onExpire).toHaveBeenCalledTimes(1) // not called again
  })

  it('produces a human label', () => {
    const { result: short } = renderHook(() => useRateLimitCountdown(45))
    expect(short.current.label).toBe('45s')

    const { result: minutes } = renderHook(() => useRateLimitCountdown(392))
    expect(minutes.current.label).toBe('6m 32s')

    const { result: exactMin } = renderHook(() => useRateLimitCountdown(120))
    expect(exactMin.current.label).toBe('2m 0s')
  })

  it('handles zero / negative input by being inactive immediately', () => {
    const { result } = renderHook(() => useRateLimitCountdown(0))
    expect(result.current.isActive).toBe(false)
    expect(result.current.secondsRemaining).toBe(0)
  })

  it('cleans up the interval on unmount', () => {
    const { result, unmount } = renderHook(() => useRateLimitCountdown(10))
    expect(result.current.secondsRemaining).toBe(10)
    unmount()
    expect(() => {
      vi.advanceTimersByTime(5000)
    }).not.toThrow()
  })

  it('does not restart the interval when onExpire identity changes between renders', () => {
    // Caller passes a fresh arrow function each render — the hook must not
    // tear down and recreate the interval, or the countdown will stutter.
    const { result, rerender } = renderHook(
      ({ onExpire }: { onExpire: () => void }) =>
        useRateLimitCountdown(5, onExpire),
      { initialProps: { onExpire: () => {} } },
    )

    expect(result.current.secondsRemaining).toBe(5)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.secondsRemaining).toBe(4)

    // Re-render with a NEW function identity for onExpire
    rerender({ onExpire: () => {} })

    // If the effect re-ran (the trap), the interval was cleared and restarted
    // from the current secondsRemaining of 4 — we'd see 4 still after another
    // 1000ms because a fresh setInterval hasn't fired yet. The fix ensures
    // the interval keeps ticking.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.secondsRemaining).toBe(3)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.secondsRemaining).toBe(2)
  })

  it('uses the latest onExpire when the timer fires, even after re-renders', () => {
    const firstOnExpire = vi.fn()
    const secondOnExpire = vi.fn()
    const { rerender } = renderHook(
      ({ onExpire }: { onExpire: () => void }) =>
        useRateLimitCountdown(2, onExpire),
      { initialProps: { onExpire: firstOnExpire } },
    )

    act(() => { vi.advanceTimersByTime(500) })
    // Caller swaps the callback mid-countdown
    rerender({ onExpire: secondOnExpire })

    act(() => { vi.advanceTimersByTime(2000) })
    expect(firstOnExpire).not.toHaveBeenCalled()
    expect(secondOnExpire).toHaveBeenCalledTimes(1)
  })

  it('restarts countdown when retryAfterSeconds changes', () => {
    const { result, rerender } = renderHook(
      ({ seconds }: { seconds: number }) => useRateLimitCountdown(seconds),
      { initialProps: { seconds: 3 } },
    )

    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.secondsRemaining).toBe(1)

    // New 429 window arrives from a later request; timer must reset.
    rerender({ seconds: 5 })
    expect(result.current.secondsRemaining).toBe(5)
    expect(result.current.isActive).toBe(true)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.secondsRemaining).toBe(4)
  })
})
