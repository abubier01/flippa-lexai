import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import JoinTeamClient from './join-client'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function JoinTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/dashboard')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/team/join?token=${token}`)

  // Service role is required: invite lookup must work before membership exists, and invite rows are not user-owned.
  const serviceSupabase = createAdminClient()
  const { data: invite } = await serviceSupabase
    .from('team_invites')
    .select('*, teams:team_id(name)')
    .eq('token', token)
    .single()

  return <JoinTeamClient invite={invite} token={token} userEmail={user.email ?? ''} />
}
