import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-role'
import { getActivePlan } from '@/lib/plan/access'
import { log } from '@/lib/log'
import { MAX_TEAM_MEMBERS } from '@/lib/plan-limits'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token is required.' }, { status: 400 })

  const service = getServiceClient()

  const { data: invite } = await service
    .from('team_invites')
    .select('*, teams:team_id(name, owner_id)')
    .eq('token', token)
    .eq('status', 'pending')
    .single()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite.' }, { status: 404 })

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('team_invites').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'This invite has expired.' }, { status: 410 })
  }

  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address.' }, { status: 403 })
  }

  // C6: the inviter (team owner) must hold an active Team plan.
  const ownerId = (invite.teams as { owner_id: string })?.owner_id
  if (!ownerId) {
    return NextResponse.json({ error: 'Team owner is missing.' }, { status: 500 })
  }
  const ownerPlan = await getActivePlan(ownerId)
  if (ownerPlan.tier !== 'team') {
    return NextResponse.json(
      { error: 'Team subscription is not active. Ask the team owner to renew.' },
      { status: 402 },
    )
  }

  const { count } = await service
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', invite.team_id)
  if ((count ?? 0) >= MAX_TEAM_MEMBERS) {
    return NextResponse.json({ error: `Team is full (max ${MAX_TEAM_MEMBERS} members).` }, { status: 403 })
  }

  const { error: joinError } = await service.from('team_members').upsert({
    team_id: invite.team_id,
    user_id: user.id,
    role: 'member',
  })
  if (joinError) {
    // Silent failure here would let us return success while the user is not
    // actually a team member. Surface so we notice membership drift in Sentry.
    log.error('team join upsert failed', {
      err: joinError,
      subsystem: 'supabase',
      op: 'team.join.upsert',
    })
  }

  // C3: do NOT touch profiles.plan. Team features are gated by team_members
  // membership (already enforced in the UI gates) plus an active owner plan.
  const { error: profileTeamError } = await service.from('profiles').update({ team_id: invite.team_id }).eq('id', user.id)
  if (profileTeamError) {
    log.error('team join profile update failed', {
      err: profileTeamError,
      subsystem: 'supabase',
      op: 'team.join.profile.update',
    })
  }

  await service.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id)

  return NextResponse.json({ success: true, teamName: (invite.teams as { name: string })?.name })
}
