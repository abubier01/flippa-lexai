import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import JoinTeamClient from './join-client'

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
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: invite } = await serviceSupabase
    .from('team_invites')
    .select('*, teams:team_id(name)')
    .eq('token', token)
    .single()

  return <JoinTeamClient invite={invite} token={token} userEmail={user.email ?? ''} />
}
