import { afterEach, describe, expect, it, vi } from 'vitest'
import { withRetry } from '../with-retry'

function retryable503() {
  return {
    type: 'StripeAPIError',
    statusCode: 503,
    message: 'temporary failure',
  }
}

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns on first success without retries', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries retryable errors and eventually succeeds', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fn = vi.fn()
      .mockRejectedValueOnce(retryable503())
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, { attempts: 3, baseMs: 250 })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries up to attempts on 5xx and then throws', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const err = retryable503()
    const fn = vi.fn().mockRejectedValue(err)

    const promise = withRetry(fn, { attempts: 3, baseMs: 250 })
    const assertion = expect(promise).rejects.toBe(err)
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry on 4xx errors', async () => {
    const err = {
      type: 'StripeInvalidRequestError',
      statusCode: 400,
      message: 'bad request',
    }
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { attempts: 5, baseMs: 1 })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses exponential backoff 250/1000ms with jitter baseline', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const err = retryable503()
    const fn = vi.fn().mockRejectedValue(err)

    const promise = withRetry(fn, { attempts: 3, baseMs: 250 })
    const assertion = expect(promise).rejects.toBe(err)
    await vi.runAllTimersAsync()
    await assertion

    const delays = timeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((value): value is number => typeof value === 'number')

    expect(delays).toEqual([250, 1000])
  })
})
