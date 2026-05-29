'use client'

// components/contracts/user-context-echo.tsx
//
// Spec § Part 4 — User context echo:
//   - Collapsible row below score card, only when user_context !== null.
//   - Collapsed: "▸ Context provided for this analysis (N chars)"
//   - Expanded: full text in monospaced preformatted block.

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface Props {
  userContext: string
}

export default function UserContextEcho({ userContext }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="bg-card rounded-xl border border-border">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full px-6 py-3 flex items-center gap-2 text-left text-sm text-foreground hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown aria-hidden="true" className="w-4 h-4" />
            ) : (
              <ChevronRight aria-hidden="true" className="w-4 h-4" />
            )}
            <span>
              Context provided for this analysis ({userContext.length.toLocaleString()} chars)
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="px-6 pb-4 pt-1 font-mono text-xs whitespace-pre-wrap text-foreground">
            {userContext}
          </pre>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
