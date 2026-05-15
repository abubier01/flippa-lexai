'use client'

import Link from 'next/link'
import { Sparkles, X } from 'lucide-react'
import { useState } from 'react'

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="bg-primary text-primary-foreground flex items-center justify-between gap-4 px-4 py-2.5 text-sm shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span className="font-medium">You are in Demo Mode</span>
        <span className="hidden sm:inline text-primary-foreground/80">— all data is sample data. Nothing is saved.</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/auth/sign-up"
          className="bg-primary-foreground text-primary font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-primary-foreground/90 transition-colors whitespace-nowrap"
        >
          Sign up free
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
