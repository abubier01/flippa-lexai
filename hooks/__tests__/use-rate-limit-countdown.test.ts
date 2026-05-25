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
})
