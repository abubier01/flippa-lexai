// Shared shell for /admin/personas/** — minimal header, breadcrumb container,
// max-width wrapper. Per-page breadcrumb content is rendered by the page itself.

import Link from 'next/link'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function PersonasAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/admin/personas" className="text-sm font-semibold tracking-tight">
            LexAI Admin <span className="text-muted-foreground">· Personas</span>
          </Link>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            Exit admin
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
