import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/plan/access', () => ({
  getActivePlan: vi.fn(),
}))

import { requireUserContext, isAuthedContext } from '../auth-context'
import { createClient } from '@/lib/supabase/server'
import { getActivePlan } from '@/lib/plan/access'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/test', { method: 'POST' })
}

describe('requireUserContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 NextResponse when no user', async () => {
    ;(createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const res = await requireUserContext(makeReq(), { action: 'chat' })
    expect(isAuthedContext(res)).toBe(false)
    expect((res as NextResponse).status).toBe(401)
  })

  it('falls back to tier=solo on getActivePlan throw', async () => {
    ;(createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })
    ;(getActivePlan as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down'),
    )
    const res = await requireUserContext(makeReq(), { action: 'chat' })
    expect(isAuthedContext(res)).toBe(true)
    if (isAuthedContext(res)) {
      expect(res.tier).toBe('solo')
      expect(res.user.id).toBe('u1')
      expect(res.plan.status).toBe('fallback')
    }
  })

  it('returns context with resolved tier', async () => {
    ;(createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })
    ;(getActivePlan as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      tier: 'pro',
      status: 'active',
    })
    const res = await requireUserContext(makeReq(), { action: 'chat' })
    if (isAuthedContext(res)) {
      expect(res.tier).toBe('pro')
      expect(res.plan.status).toBe('active')
    }
  })

  it('defaults tier to solo when plan.tier is null', async () => {
    ;(createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })
    ;(getActivePlan as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      tier: null,
      status: 'none',
    })
    const res = await requireUserContext(makeReq(), { action: 'chat' })
    if (isAuthedContext(res)) {
      expect(res.tier).toBe('solo')
    }
  })
})
