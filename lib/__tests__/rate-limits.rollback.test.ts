import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { consumeRateLimitMock, peekRateLimitMock, releaseRateLimitMock } = vi.hoisted(() => ({
  consumeRateLimitMock: vi.fn(),
  peekRateLimitMock: vi.fn(),
  releaseRateLimitMock: vi.fn(),
}))

vi.mock('../security/rate-limit', () => ({
  consumeRateLimit: consumeRateLimitMock,
  peekRateLimit: peekRateLimitMock,
  releaseRateLimit: releaseRateLimitMock,
}))

import { checkRateLimit } from '../rate-limits'

describe('checkRateLimit rollback on partial consume failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    releaseRateLimitMock.mockResolvedValue(undefined)
    peekRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 10,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    })
  })

  it('rolls back per-user token when per-tenant consume fails', async () => {
    consumeRateLimitMock
      .mockResolvedValueOnce({ allowed: true, committed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, committed: false, retryAfterSeconds: 9 })

    const result = await checkRateLimit('u-1', 't-1', 'solo')

    expect(result).toEqual({ allowed: false, scope: 'tenant', retryAfterSeconds: 9 })
    expect(releaseRateLimitMock).toHaveBeenCalledTimes(1)
    expect(releaseRateLimitMock).toHaveBeenCalledWith({
      action: 'analyze:perUser',
      userId: 'u-1',
      tier: 'solo',
    })
  })

  it('rejects when a consume result is allowed but uncommitted (degraded timeout path)', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: true,
      committed: false,
      retryAfterSeconds: 3,
    })

    const result = await checkRateLimit('u-uncertain', 't-uncertain', 'solo')

    expect(result).toEqual({ allowed: false, scope: 'user', retryAfterSeconds: 3 })
    expect(releaseRateLimitMock).not.toHaveBeenCalled()
  })

  it('rolls back per-user and per-tenant tokens when per-tenant-daily consume fails', async () => {
    consumeRateLimitMock
      .mockResolvedValueOnce({ allowed: true, committed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, committed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, committed: false, retryAfterSeconds: 11 })

    const result = await checkRateLimit('u-2', 't-2', 'solo')

    expect(result).toEqual({ allowed: false, scope: 'tenant_daily', retryAfterSeconds: 11 })
    expect(releaseRateLimitMock).toHaveBeenCalledTimes(2)
    expect(releaseRateLimitMock).toHaveBeenCalledWith({
      action: 'analyze:perUser',
      userId: 'u-2',
      tier: 'solo',
    })
    expect(releaseRateLimitMock).toHaveBeenCalledWith({
      action: 'analyze:perTenant',
      userId: 'tenant:t-2',
      tier: 'solo',
    })
  })
})
