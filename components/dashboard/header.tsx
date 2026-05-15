'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Upload, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/contracts': 'Contracts',
  '/upload': 'Upload Contract',
  '/reports': 'Reports',
  '/settings': 'Settings',
}

interface Props {
  user: User
  profile: Profile | null
}

export default function DashboardHeader({ user, profile }: Props) {
  const pathname = usePathname()
  const title = Object.entries(pageTitles).find(([key]) =>
    pathname === key || (key !== '/dashboard' && pathname.startsWith(key))
  )?.[1] ?? 'LexAI'

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'User'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <header className="h-16 border-b border-border bg-sidebar flex items-center px-4 md:px-6 gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" className="hidden sm:inline-flex" asChild>
          <Link href="/upload">
            <Upload className="w-4 h-4 mr-1.5" />
            Upload
          </Link>
        </Button>

        <button className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative" aria-label="Notifications">
          <Bell className="w-4.5 h-4.5" />
        </button>

        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-semibold cursor-pointer">
          {initials}
        </div>
      </div>
    </header>
  )
}
