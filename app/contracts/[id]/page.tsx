import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'
import ContractAnalysisView from '@/components/contracts/contract-analysis-view'
import ContractProcessing from '@/components/contracts/contract-processing'
import { hasTeamAccess } from '@/lib/plan/access'
import { getCurrentRunWithPersona, getLatestRunIfDifferent } from '@/lib/contracts/read'

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Parallel fetches. RLS enforces access:
  //   - profiles_select_own: viewer's own profile only.
  //   - contracts_select_own + contracts_select_team: owned + team-shared.
  //   - analysis_runs SELECT mirrors contracts ownership (scripts/016).
  //   - chat messages: owners + team viewers per scripts/008.
  const [profileRes, contractRes, access, messagesRes] = await Promise.all([
    supabase.from('profiles').select('plan, team_id').eq('id', user.id).single(),
    supabase.from('contracts').select('*').eq('id', id).single(),
    hasTeamAccess(user.id),
    // Drop empty assistant placeholders (orphaned from failed/aborted streams).
    // Cap to the most recent 100 turns — long threads would otherwise balloon SSR payload.
    supabase
      .from('chat_messages')
      .select('*')
      .eq('contract_id', id)
      .or('role.eq.user,content.neq.')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (!contractRes.data) notFound()
  const contract = contractRes.data

  const isOwner = contract.user_id === user.id
  const isTeamMember =
    contract.shared_with_team === true &&
    access.ok &&
    access.teamId != null &&
    contract.team_id === access.teamId

  if (!isOwner && !isTeamMember) notFound()

  if (contract.status === 'pending' || contract.status === 'processing') {
    return <ContractProcessing contractId={id} contractTitle={contract.title} status={contract.status} />
  }

  // Consolidated read: analysis_runs joined with persona_versions. Historical
  // runs render against THEIR persona version (spec test #13), not the
  // currently-published one.
  let runWithPersona = null
  try {
    runWithPersona = await getCurrentRunWithPersona(id, supabase)
  } catch (err) {
    log.error('contract analysis load failed', {
      err,
      contractId: id,
      subsystem: 'supabase',
      op: 'analysis_runs.fetch',
    })
  }

  // Non-blocking banner: "Latest analysis failed, previous result shown".
  // Only meaningful when there IS a current run; if not, the empty state
  // handles the message instead.
  let latestFailedRun = null
  if (runWithPersona) {
    try {
      const latest = await getLatestRunIfDifferent(id, runWithPersona.run.id, supabase)
      if (latest && latest.status === 'failed') {
        latestFailedRun = latest
      }
    } catch (err) {
      // Banner is best-effort; failure to fetch is non-fatal.
      log.warn('latest run lookup failed', { err, contractId: id })
    }
  }

  return (
    <ContractAnalysisView
      contract={contract}
      run={runWithPersona?.run ?? null}
      persona={runWithPersona?.persona ?? null}
      latestFailedRun={latestFailedRun}
      initialMessages={(messagesRes.data || []).slice().reverse()}
      userPlan={profileRes.data?.plan ?? 'solo'}
      userTeamId={access.ok ? access.teamId : null}
      isTeamViewer={!isOwner && isTeamMember}
      analysisEnabled={process.env.ANALYSIS_ENABLED !== 'false'}
    />
  )
}
