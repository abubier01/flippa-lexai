'use client'

// components/contracts/contract-analysis-view.tsx
//
// Spec § Part 4 — single scrollable page:
//   header strip → score card + band → user-context echo → summary →
//   Risk Areas panel → Key Clauses panel → Suggestions → Analyze trigger.
// Plus existing team-share UI (preserved from pre-Tier-1) and AI Chat section.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { Calendar, FileText, Users } from 'lucide-react'
import RiskAreasPanel from './risk-areas-panel'
import KeyClausesPanel from './key-clauses-panel'
import AnalyzeButton from './analyze-button'
import UserContextEcho from './user-context-echo'
import ContractChatTab from './contract-chat-tab'
import ContractDeleteButton from './contract-delete-button'
import { bandForScore, BAND_COLOR_CLASSES } from '@/lib/risk/severity'
import type { AnalysisRunRow } from '@/lib/contracts/read'
import type { Persona } from '@/lib/prompt/persona-types'
import type { Contract, ChatMessage } from '@/lib/types'

interface Props {
  contract: Contract
  run: AnalysisRunRow | null
  persona: Persona | null
  latestFailedRun: Pick<AnalysisRunRow, 'id' | 'status' | 'created_at' | 'diagnostics'> | null
  initialMessages: ChatMessage[]
  userPlan?: string
  userTeamId?: string | null
  isTeamViewer?: boolean
  analysisEnabled: boolean
}

export default function ContractAnalysisView({
  contract,
  run,
  persona,
  latestFailedRun,
  initialMessages,
  userPlan,
  userTeamId,
  isTeamViewer = false,
  analysisEnabled,
}: Props) {
  const router = useRouter()
  const [shared, setShared] = useState(
    !!(contract as unknown as Record<string, unknown>).shared_with_team,
  )
  const [sharingLoading, setSharingLoading] = useState(false)

  async function toggleShare() {
    setSharingLoading(true)
    const res = await fetch('/api/team/share-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: contract.id, share: !shared }),
    })
    const data = await res.json()
    setSharingLoading(false)
    if (!res.ok) {
      toast.error(data.error)
      return
    }
    setShared(!shared)
    toast.success(shared ? 'Removed from team library.' : 'Shared with team!')
  }

  const output = run?.output ?? null
  const score = output?.risk_score ?? null
  const band = score !== null ? bandForScore(score) : null
  const bandClasses = band ? BAND_COLOR_CLASSES[band.color] : null
  const shortRunId = run ? run.id.slice(0, 8) : null
  const analyzedAtIso = run?.completed_at ?? run?.created_at ?? null

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* ─── Header strip ─────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">{contract.title}</h2>
                <p className="text-xs text-muted-foreground">Procurement Analysis</p>
              </div>
              {persona && (
                <Link
                  href={`/admin/personas/${persona.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  title={persona.description.slice(0, 200)}
                >
                  persona: {persona.id}
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
              </span>
              {contract.file_name && (
                <span className="text-xs text-muted-foreground">{contract.file_name}</span>
              )}
              {shortRunId && analyzedAtIso && (
                <span className="text-xs text-muted-foreground" title={run!.id}>
                  Run {shortRunId} ·{' '}
                  <time dateTime={analyzedAtIso}>
                    analyzed {new Date(analyzedAtIso).toISOString().replace('T', ' ').slice(0, 19)} UTC
                  </time>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTeamViewer && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">
                <Users className="w-3 h-3" />
                Team shared
              </span>
            )}
            {!isTeamViewer && userPlan === 'team' && userTeamId && (
              <button
                onClick={toggleShare}
                disabled={sharingLoading}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  shared
                    ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                <Users className="w-3 h-3" />
                {sharingLoading ? '...' : shared ? 'Shared with team' : 'Share with team'}
              </button>
            )}
            {!isTeamViewer && (
              <ContractDeleteButton
                contractId={contract.id}
                variant="outline"
                onDeleted={() => router.push('/contracts')}
              />
            )}
          </div>
        </div>
      </div>

      {/* ─── Latest-failed banner (Empty-state matrix row 2) ─────── */}
      {latestFailedRun &&
        latestFailedRun.status === 'failed' &&
        run &&
        new Date(latestFailedRun.created_at).getTime() > new Date(run.created_at).getTime() && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-5 py-3 text-sm">
          Latest analysis failed.{' '}
          <span className="font-medium">
            Previous result from {new Date(run.completed_at ?? run.created_at).toLocaleString()} shown below.
          </span>
        </div>
      )}

      {/* ─── No-current-run state ─────────────────────────────────── */}
      {!run && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Analysis pending</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {analysisEnabled
                ? 'Run an analysis to see structured risks, key clauses, and suggestions.'
                : 'Analysis is temporarily unavailable.'}
            </p>
          </div>
          {!isTeamViewer && (
            <AnalyzeButton
              contractId={contract.id}
              analysisEnabled={analysisEnabled}
              hasCurrentRun={false}
            />
          )}
        </div>
      )}

      {/* ─── Score card + band ────────────────────────────────────── */}
      {run && output && score !== null && band && bandClasses && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-stretch">
            <div className="flex-1 w-full">
              <div className="text-xs text-muted-foreground mb-1">Risk Score</div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground">{score}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <div
                className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Risk score ${score} out of 100`}
              >
                <div
                  className={`h-full ${bandClasses.fill}`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
            <div
              className={`rounded-lg border px-4 py-3 sm:min-w-48 ${bandClasses.bg} ${bandClasses.border}`}
            >
              <div className={`text-sm font-semibold ${bandClasses.text}`}>{band.label}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Score {band.min}–{band.max}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── User context echo ────────────────────────────────────── */}
      {run?.user_context && <UserContextEcho userContext={run.user_context} />}

      {/* ─── Summary ──────────────────────────────────────────────── */}
      {output && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-2">Summary</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {output.summary}
          </p>
        </div>
      )}

      {/* ─── Risk Areas panel (load-bearing visualization) ────────── */}
      {output && persona && <RiskAreasPanel persona={persona} risks={output.risks} />}

      {/* ─── Key Clauses panel ────────────────────────────────────── */}
      {output && persona && <KeyClausesPanel persona={persona} clauses={output.clauses} />}

      {/* ─── Suggestions ──────────────────────────────────────────── */}
      {output && output.suggestions.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-3">Suggestions</h3>
          <ul className="space-y-2">
            {output.suggestions.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  aria-label={`Suggestion: ${s}`}
                />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Re-analyze controls ─────────────────────────────────── */}
      {run && !isTeamViewer && (
        <div className="bg-card rounded-xl border border-border p-6">
          <AnalyzeButton
            contractId={contract.id}
            analysisEnabled={analysisEnabled}
            hasCurrentRun={true}
          />
        </div>
      )}

      {/* ─── AI Chat (preserved from pre-Tier-1) ─────────────────── */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-3">AI Chat</h3>
        <ContractChatTab
          contractId={contract.id}
          initialMessages={initialMessages}
          readOnly={isTeamViewer}
        />
      </div>
    </div>
  )
}
