import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContractAnalysisView from '@/components/contracts/contract-analysis-view'
import ContractProcessing from '@/components/contracts/contract-processing'
import { hasTeamAccess } from '@/lib/plan/access'

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Parallel fetches. RLS enforces access:
  //   - profiles_select_own (auth.uid() = id): the profile fetch only ever
  //     returns the VIEWER's own profile, never another user's — including
  //     the contract owner's. That's fine because we only need the viewer's
  //     own plan/team_id to render their UI shell.
  //   - contracts_select_own + contracts_select_team: caller sees their own
  //     contracts AND any contract shared with a team they belong to.
  //   - analyses_select_own + analyses_select_team / messages_select_own +
  //     messages_select_team: owners read by auth.uid() = user_id; team
  //     viewers read rows whose parent contract is shared_with_team = TRUE
  //     and whose team they belong to (added in scripts/008_team_analyses_messages_rls.sql).
  const [profileRes, contractRes, access, analysesRes, messagesRes] = await Promise.all([
    supabase.from('profiles').select('plan, team_id').eq('id', user.id).single(),
    supabase.from('contracts').select('*').eq('id', id).single(),
    hasTeamAccess(user.id),
    supabase
      .from('contract_analyses')
      .select('*')
      .eq('contract_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
    // Drop empty assistant placeholders (orphaned from failed/aborted streams).
    // The chat route inserts an empty assistant row before streaming and UPDATEs
    // it in onFinish; if the stream never completes, the empty row stays. The
    // .or() means: keep row IF role='user' (user rows always have content) OR
    // content!='' (filled assistant rows). Empty placeholders are dropped so
    // the chat UI does not render blank bot bubbles on reload.
    supabase
      .from('chat_messages')
      .select('*')
      .eq('contract_id', id)
      .or('role.eq.user,content.neq.')
      .order('created_at', { ascending: true }),
  ])

  if (!contractRes.data) notFound()
  const contract = contractRes.data
  if (analysesRes.error) {
    console.error('[contracts/[id]] failed to load analysis', {
      contractId: id,
      message: analysesRes.error.message,
    })
  }
  const analysis = analysesRes.data?.[0] ?? null

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

  return (
    <ContractAnalysisView
      contract={contract}
      analysis={analysis}
      initialMessages={messagesRes.data || []}
      userPlan={profileRes.data?.plan ?? 'solo'}
      // access.teamId can be non-null even when ok=false (lapsed team plan); guard is load-bearing.
      userTeamId={access.ok ? access.teamId : null}
      isTeamViewer={!isOwner && isTeamMember}
    />
  )
}
