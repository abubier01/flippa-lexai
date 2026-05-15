import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import ContractAnalysisView from '@/components/contracts/contract-analysis-view'
import ContractProcessing from '@/components/contracts/contract-processing'

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch the viewer's profile to get their team_id
  const { data: profile } = await service
    .from('profiles')
    .select('plan, team_id')
    .eq('id', user.id)
    .single()

  // Fetch the contract — owned by user OR shared with team the user belongs to
  const { data: contract } = await service
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single()

  if (!contract) notFound()

  // Access check: user owns it, OR it's shared with a team the user is a member of
  const isOwner = contract.user_id === user.id
  const isTeamMember =
    contract.shared_with_team === true &&
    profile?.team_id != null &&
    contract.team_id === profile.team_id

  if (!isOwner && !isTeamMember) notFound()

  const { data: analysis } = await service
    .from('contract_analyses')
    .select('*')
    .eq('contract_id', id)
    .single()

  const { data: messages } = await service
    .from('chat_messages')
    .select('*')
    .eq('contract_id', id)
    .order('created_at', { ascending: true })

  if (contract.status === 'pending' || contract.status === 'processing') {
    return <ContractProcessing contractId={id} contractTitle={contract.title} status={contract.status} />
  }

  return (
    <ContractAnalysisView
      contract={contract}
      analysis={analysis}
      initialMessages={messages || []}
      userPlan={(profile?.plan ?? 'free') as string}
      userTeamId={profile?.team_id ?? null}
      isTeamViewer={!isOwner && isTeamMember}
    />
  )
}
