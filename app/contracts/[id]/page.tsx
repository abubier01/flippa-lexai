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
  //   - analyses_select_own / messages_select_own (auth.uid() = user_id):
  //     only rows where the row's user_id matches the caller. Since the
  //     analysis/messages rows carry the OWNER's user_id (not the viewer's),
  //     a team viewer reading a shared contract will get null/empty here
  //     until team-scoped policies are added (see "team-viewer gap" below).
  const [profileRes, contractRes, access, analysisRes, messagesRes] = await Promise.all([
    supabase.from('profiles').select('plan, team_id').eq('id', user.id).single(),
    supabase.from('contracts').select('*').eq('id', id).single(),
    hasTeamAccess(user.id),
    supabase.from('contract_analyses').select('*').eq('contract_id', id).maybeSingle(),
    supabase.from('chat_messages').select('*').eq('contract_id', id).order('created_at', { ascending: true }),
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

  // Team-viewer gap: analyses_select_own and messages_select_own only permit
  // auth.uid() = user_id, so a team viewer will receive null/[] here. This is
  // acceptable (Option A) — the analysis tabs render empty-state gracefully and
  // the chat tab is gated client-side by isTeamViewer. Follow-up PR should add
  // analyses_select_team and messages_select_team RLS policies.

  if (contract.status === 'pending' || contract.status === 'processing') {
    return <ContractProcessing contractId={id} contractTitle={contract.title} status={contract.status} />
  }

  return (
    <ContractAnalysisView
      contract={contract}
      analysis={analysisRes.data}
      initialMessages={messagesRes.data || []}
      userPlan={profileRes.data?.plan ?? 'solo'}
      // access.teamId can be non-null even when ok=false (lapsed team plan); guard is load-bearing.
      userTeamId={access.ok ? access.teamId : null}
      isTeamViewer={!isOwner && isTeamMember}
    />
  )
}
