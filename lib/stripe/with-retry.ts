type RetryOptions = {
  attempts?: number
  baseMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStatusCode(err: unknown): number | null {
  if (!isObjectLike(err)) return null
  const statusCode = err.statusCode
  if (typeof statusCode === 'number') return statusCode
  const raw = err.raw
  if (!isObjectLike(raw)) return null
  return typeof raw.statusCode === 'number' ? raw.statusCode : null
}

function isRetryableStripeError(err: unknown): boolean {
  if (!isObjectLike(err)) return false
  const type = typeof err.type === 'string' ? err.type : ''
  if (type === 'StripeAPIError' || type === 'StripeConnectionError') return true

  const statusCode = readStatusCode(err)
  if (statusCode === null) return false
  return statusCode >= 500
}

function jitterDelay(ms: number): number {
  const factor = 0.75 + (Math.random() * 0.5)
  return Math.max(0, Math.round(ms * factor))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3)
  const baseMs = Math.max(1, opts.baseMs ?? 250)

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRetryableStripeError(err) || attempt >= attempts) {
        throw err
      }
      const backoff = baseMs * (4 ** (attempt - 1))
      await sleep(jitterDelay(backoff))
    }
  }

  throw lastErr ?? new Error('withRetry exhausted attempts')
}
