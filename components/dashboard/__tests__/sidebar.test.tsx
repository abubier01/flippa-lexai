// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DashboardSidebar from '../sidebar'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

const push = vi.fn()
const refresh = vi.fn()
const signOut = vi.fn().mockResolvedValue({})

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push, refresh }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut,
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

const user: User = {
  id: 'user-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
  email: 'test@example.com',
}

function makeProfile(plan: string): Profile {
  return {
    id: 'user-1',
    full_name: 'Test User',
    avatar_url: null,
    plan,
    team_id: null,
    contracts_this_month: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('DashboardSidebar plan CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('shows Solo plan CTA for solo users', () => {
    render(<DashboardSidebar user={user} profile={makeProfile('solo')} />)
    expect(screen.getByText('Solo Plan')).toBeTruthy()
    expect(screen.getByRole('link', { name: /upgrade to pro/i })).toBeTruthy()
  })

  it('shows Solo plan CTA for legacy free users via normalization', () => {
    render(<DashboardSidebar user={user} profile={makeProfile('free')} />)
    expect(screen.getByText('Solo Plan')).toBeTruthy()
    expect(screen.getByRole('link', { name: /upgrade to pro/i })).toBeTruthy()
  })

  it('hides solo CTA for paid users', () => {
    render(<DashboardSidebar user={user} profile={makeProfile('pro')} />)
    expect(screen.queryByText('Solo Plan')).toBeNull()
    expect(screen.queryByRole('link', { name: /upgrade to pro/i })).toBeNull()
  })
})
