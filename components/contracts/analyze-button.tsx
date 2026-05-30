'use client'

// components/contracts/analyze-button.tsx
//
// Spec § Part 4 — Re-analyze controls:
//   - [Re-Analyze with new context] primary; POST /api/contracts/analyze
//   - [Add context] secondary; toggles inline 4,000-char textarea above button.
//   - Both buttons aria-busy/disabled between submit and response.
//   - On 429: surface Retry-After.
//   - On rejection codes: human-readable toast.
//   - On success: router.refresh() so the server component re-fetches.
//   - When ANALYSIS_ENABLED=false: button disabled with tooltip.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

const USER_CONTEXT_MAX = 4000

interface Props {
  contractId: string
  analysisEnabled: boolean
  hasCurrentRun: boolean
}

// Human-readable messages for each rejection / failure code per spec § API Contract.
const REJECTION_MESSAGES: Record<string, string> = {
  CONTRACT_TOO_LONG: 'Document too long (max ~100k tokens). Please split before analyzing.',
  CONTRACT_EMPTY: 'Contract has no readable text.',
  TOO_LONG: 'Context is too long (max 4,000 characters).',
  EMPTY_AFTER_SCRUB: 'Context was empty after sanitization.',
  SENTINEL_VIOLATION: 'Context contains disallowed control sequences.',
  PERSONA_INVALID: 'Analysis configuration is invalid. The team has been notified.',
  ANALYSIS_ALREADY_RUNNING: 'Analysis is already running for this contract. Please wait a moment.',
}

const FAILURE_MESSAGES: Record<string, string> = {
  OUTPUT_SCHEMA_FAIL: 'Analysis failed. The team has been notified.',
  GROUNDING_FAIL: 'Analysis failed. The team has been notified.',
  MODEL_ERROR: 'Analysis failed. The team has been notified.',
  PUBLISH_ERROR: 'Analysis failed. The team has been notified.',
}

export default function AnalyzeButton({ contractId, analysisEnabled, hasCurrentRun }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [userContext, setUserContext] = useState('')

  const primaryLabel = hasCurrentRun ? 'Re-Analyze with new context' : 'Analyze'
  const disabled = busy || !analysisEnabled

  async function submit() {
    if (disabled) return
    setBusy(true)
    try {
      const body: { contractId: string; userContext?: string } = { contractId }
      if (userContext.trim()) body.userContext = userContext
      const res = await fetch('/api/contracts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After')
        const seconds = retryAfter ? Number(retryAfter) : null
        toast.error(
          seconds
            ? `Too many requests, try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
            : 'Too many requests, please try again later.',
        )
        return
      }

      const data = (await res.json().catch(() => ({}))) as
        | { status?: string; code?: string; diagnostics?: { code: string }[] }
        | Record<string, unknown>

      if (!res.ok) {
        const code =
          (data as { code?: string }).code ??
          (data as { diagnostics?: { code: string }[] }).diagnostics?.[0]?.code
        if (code && REJECTION_MESSAGES[code]) {
          toast.error(REJECTION_MESSAGES[code])
        } else if (code && FAILURE_MESSAGES[code]) {
          toast.error(FAILURE_MESSAGES[code])
        } else if ((data as { status?: string }).status === 'unavailable') {
          toast.error('Analysis is temporarily unavailable.')
        } else {
          if (code) {
            Sentry.captureMessage('analyze_unmapped_error_code', {
              level: 'warning',
              tags: { event: 'analyze_unmapped_error_code' },
              extra: { code },
            })
          }
          toast.error('Analysis failed. Please try again.')
        }
        return
      }

      toast.success('Analysis complete.')
      setUserContext('')
      setShowContext(false)
      router.refresh()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {showContext && (
        <div className="space-y-1">
          <label htmlFor="user-context" className="text-sm font-medium text-foreground">
            Add context for this analysis
          </label>
          <textarea
            id="user-context"
            value={userContext}
            onChange={e => setUserContext(e.target.value.slice(0, USER_CONTEXT_MAX))}
            disabled={busy}
            rows={5}
            placeholder="e.g. Focus on auto-renewal terms; we previously had a 90-day notice trap."
            className="w-full rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby="user-context-counter"
          />
          <div
            id="user-context-counter"
            className="text-xs text-muted-foreground text-right"
            aria-live="polite"
          >
            {userContext.length.toLocaleString()} / {USER_CONTEXT_MAX.toLocaleString()}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={disabled}
          aria-busy={busy}
          title={!analysisEnabled ? 'Analysis temporarily unavailable.' : undefined}
        >
          {busy ? 'Analyzing…' : primaryLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowContext(s => !s)}
          disabled={busy}
          aria-expanded={showContext}
          aria-controls="user-context"
        >
          {showContext ? 'Hide context' : 'Add context'}
        </Button>
      </div>
    </div>
  )
}
