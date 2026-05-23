import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContractAnalysisView from '@/components/contracts/contract-analysis-view'
import ContractProcessing from '@/components/contracts/contract-processing'
import { hasTeamAccess } from '@/lib/plan/access'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Service role is required: team-shared contract reads and related records may span rows not directly readable via caller-bound RLS.
  const service = createAdminClient()

  const [{ data: profile }, { data: contract }, access] = await Promise.all([
    // Fetch the viewer's profile to get their team_id.
    service
      .from('profiles')
      .select('plan, team_id')
      .eq('id', user.id)
      .single(),
    // Fetch the contract — owned by user OR shared with team the user belongs to.
    service
      .from('contracts')
      .select('*')
      .eq('id', id)
      .single(),
    hasTeamAccess(user.id),
  ])

  if (!contract) notFound()

  // Access check: user owns it, OR it's shared with a team that currently has entitlement.
  const isOwner = contract.user_id === user.id
  const isTeamMember =
    contract.shared_with_team === true &&
    access.ok &&
    access.teamId != null &&
    contract.team_id === access.teamId

  if (!isOwner && !isTeamMember) notFound()

  const [{ data: analysis }, { data: messages }] = await Promise.all([
    service
      .from('contract_analyses')
      .select('*')
      .eq('contract_id', id)
      .single(),
    service
      .from('chat_messages')
      .select('*')
      .eq('contract_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (contract.status === 'pending' || contract.status === 'processing') {
    return <ContractProcessing contractId={id} contractTitle={contract.title} status={contract.status} />
  }

  return (
    <ContractAnalysisView
      contract={contract}
      analysis={analysis}
      initialMessages={messages || []}
      userPlan={(profile?.plan ?? 'solo') as string}
      userTeamId={access.ok ? access.teamId : null}
      isTeamViewer={!isOwner && isTeamMember}
    />
  )
}
