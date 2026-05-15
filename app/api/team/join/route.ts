// POST /api/team/join — accept an invite by token
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token is required.' }, { status: 400 })

  // Use service role to bypass RLS for invite lookup and profile updates
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: invite } = await service
    .from('team_invites')
    .select('*, teams:team_id(name)')
    .eq('token', token)
    .eq('status', 'pending')
    .single()

  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite.' }, { status: 404 })

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    await service.from('team_invites').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'This invite has expired.' }, { status: 410 })
  }

  // Check invite email matches (case-insensitive)
  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address.' }, { status: 403 })
  }

  // Check member limit
  const { count } = await service
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', invite.team_id)

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Team is full (max 10 members).' }, { status: 403 })
  }

  // Add to team
  await service.from('team_members').upsert({
    team_id: invite.team_id,
    user_id: user.id,
    role: 'member',
  })

  // Update profile with team_id and upgrade to team plan
  await service.from('profiles').update({
    team_id: invite.team_id,
    plan: 'team',
  }).eq('id', user.id)

  // Mark invite as accepted
  await service.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id)

  return NextResponse.json({ success: true, teamName: (invite.teams as { name: string })?.name })
}
