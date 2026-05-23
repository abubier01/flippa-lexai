import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireActiveSubscriptionForApi } from '../api-entitlement'

const mocks = vi.hoisted(() => ({
  getActivePlan: vi.fn(),
}))

vi.mock('../access', () => ({
  getActivePlan: mocks.getActivePlan,
}))

describe('requireActiveSubscriptionForApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'false'
  })

  it('returns null when feature flag is off', async () => {
    const res = await requireActiveSubscriptionForApi('user_1')
    expect(res).toBeNull()
    expect(mocks.getActivePlan).not.toHaveBeenCalled()
  })

  it('returns null when user is actively subscribed', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'true'
    mocks.getActivePlan.mockResolvedValue({ tier: 'solo', status: 'active' })
    const res = await requireActiveSubscriptionForApi('user_1')
    expect(res).toBeNull()
  })

  it('returns 402 for unsubscribed users', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'true'
    mocks.getActivePlan.mockResolvedValue({ tier: 'solo', status: 'none' })
    const res = await requireActiveSubscriptionForApi('user_1')
    expect(res?.status).toBe(402)
    const body = await res?.json()
    expect(body.code).toBe('subscription_required')
    expect(body.subscriptionRequired).toBe(true)
  })

  it('returns 403 when entitlement lookup fails', async () => {
    process.env.NEXT_PUBLIC_REQUIRE_SUBSCRIPTION = 'true'
    mocks.getActivePlan.mockRejectedValue(new Error('db down'))
    const res = await requireActiveSubscriptionForApi('user_1')
    expect(res?.status).toBe(403)
    const body = await res?.json()
    expect(body.code).toBe('entitlement_check_failed')
  })
})
