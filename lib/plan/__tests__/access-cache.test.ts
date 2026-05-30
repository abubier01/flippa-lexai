// lib/plan/__tests__/access-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let fromMock: ReturnType<typeof vi.fn>

vi.mock('@/lib/supabase/service-role', () => ({
  getServiceClient: vi.fn().mockImplementation(() => ({ from: fromMock })),
}))

import {
  getActivePlan,
  invalidatePlanCache,
  __resetPlanCacheForTest,
} from '../access'

function makeFromMock(rows: unknown[]) {
  return vi.fn().mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  }))
}

describe('getActivePlan cache', () => {
  beforeEach(() => {
    __resetPlanCacheForTest()
    fromMock = makeFromMock([
      { status: 'active', plan: 'pro', current_period_end: new Date(Date.now() + 86_400_000).toISOString() },
    ])
  })

  it('second call within TTL hits cache (no DB)', async () => {
    await getActivePlan('u1')
    await getActivePlan('u1')
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('different userIds do not share a cache entry', async () => {
    await getActivePlan('u1')
    await getActivePlan('u2')
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('invalidatePlanCache forces refetch on the next call', async () => {
    await getActivePlan('u1')
    invalidatePlanCache('u1')
    await getActivePlan('u1')
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('invalidatePlanCache for a different user does not evict u1', async () => {
    await getActivePlan('u1')
    invalidatePlanCache('u2')
    await getActivePlan('u1')
    expect(fromMock).toHaveBeenCalledTimes(1)
  })
})
