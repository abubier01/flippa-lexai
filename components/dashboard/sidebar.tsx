'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  Upload,
  BarChart3,
  Settings,
  Scale,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
  Users,
  TicketIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'

const baseNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/my-tickets', label: 'Support', icon: TicketIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface Props {
  user: User
  profile: Profile | null
}

export default function DashboardSidebar({ user, profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const navItems = [
    ...baseNavItems,
    ...(profile?.plan === 'team'
      ? [{ href: '/team', label: 'Team', icon: Users }]
      : []),
  ]

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/')
    router.refresh()
  }

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-border px-4 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-semibold text-foreground">LexAI</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Upgrade CTA for free users */}
        {!collapsed && profile?.plan === 'free' && (
          <div className="mx-2 mb-2 p-3 rounded-lg bg-accent/60 border border-primary/20">
            <p className="text-xs font-semibold text-foreground mb-0.5">Free Plan</p>
            <p className="text-xs text-muted-foreground mb-2.5">Upgrade for unlimited analyses.</p>
            <Button asChild size="sm" className="w-full h-7 text-xs">
              <Link href="/upgrade?plan=pro">
                <Zap className="w-3 h-3 mr-1" />
                Upgrade to Pro
              </Link>
            </Button>
          </div>
        )}

        {/* User + collapse */}
        <div className="border-t border-border p-3 flex flex-col gap-2">
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-border flex">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="sr-only sm:not-sr-only">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
