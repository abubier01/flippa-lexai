'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEMO_USER } from '@/lib/demo-data'

const pageTitles: [string, string, boolean][] = [
  ['/demo', 'Dashboard', true],
  ['/demo/contracts', 'Contracts', false],
  ['/demo/upload', 'Upload Contract', false],
  ['/demo/reports', 'Reports', false],
  ['/demo/settings', 'Settings', false],
]

export default function DemoHeader() {
  const pathname = usePathname()
  const title = pageTitles.find(([key, , exact]) => exact ? pathname === key : pathname.startsWith(key))?.[1] ?? 'LexAI'
  const initials = DEMO_USER.full_name.split(' ').map(n => n[0]).join('').toUpperCase()

  return (
    <header className="h-16 border-b border-border bg-sidebar flex items-center px-4 md:px-6 gap-4 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" className="hidden sm:inline-flex" asChild>
          <Link href="/demo/upload">
            <Upload className="w-4 h-4 mr-1.5" />
            Upload
          </Link>
        </Button>
        <div
          className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-semibold"
          title={DEMO_USER.full_name}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}
