'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, FileText, Upload, BarChart3, Settings,
  Scale, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEMO_USER } from '@/lib/demo-data'

const navItems = [
  { href: '/demo', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/demo/contracts', label: 'Contracts', icon: FileText },
  { href: '/demo/upload', label: 'Upload', icon: Upload },
  { href: '/demo/reports', label: 'Reports', icon: BarChart3 },
  { href: '/demo/settings', label: 'Settings', icon: Settings },
]

export default function DemoSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const initials = DEMO_USER.full_name.split(' ').map(n => n[0]).join('').toUpperCase()

  return (
    <>
      {/* Desktop */}
      <aside className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className={`flex items-center h-16 border-b border-border px-4 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-semibold text-foreground">LexAI</span>}
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
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

        {!collapsed && (
          <div className="mx-2 mb-2 p-3 rounded-lg bg-accent/60 border border-primary/20">
            <p className="text-xs font-semibold text-foreground mb-0.5">Demo Mode</p>
            <p className="text-xs text-muted-foreground mb-2.5">Sign up to save your contracts and analysis.</p>
            <Button asChild size="sm" className="w-full h-7 text-xs">
              <Link href="/auth/sign-up">
                <Zap className="w-3 h-3 mr-1" />
                Get started free
              </Link>
            </Button>
          </div>
        )}

        <div className="border-t border-border p-3 flex flex-col gap-2">
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{DEMO_USER.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{DEMO_USER.email}</p>
              </div>
            </div>
          )}
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
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}
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
