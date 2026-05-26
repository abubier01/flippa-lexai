// POST /api/team/invite — send an invite to an email
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasTeamAccess } from '@/lib/plan/access'
import { getServiceClient } from '@/lib/supabase/service-role'
import { log } from '@/lib/log'
import { MAX_TEAM_MEMBERS } from '@/lib/plan-limits'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })

  const service = getServiceClient()

  const { data: profile } = await service
    .from('profiles')
    .select('plan, team_id')
    .eq('id', user.id)
    .single()

  const access = await hasTeamAccess(user.id)
  if (!access.ok || access.via !== 'own' || !profile?.team_id) {
    return NextResponse.json({ error: 'Team plan and active team required.' }, { status: 403 })
  }

  const { count } = await service
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', profile.team_id)

  if ((count ?? 0) >= MAX_TEAM_MEMBERS) {
    return NextResponse.json({ error: `Team is full (max ${MAX_TEAM_MEMBERS} members).` }, { status: 403 })
  }

  // Check for existing pending invite
  const { data: existing } = await service
    .from('team_invites')
    .select('id')
    .eq('team_id', profile.team_id)
    .eq('email', email.toLowerCase().trim())
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'An invite is already pending for this email.' }, { status: 409 })
  }

  const { data: invite, error } = await service
    .from('team_invites')
    .insert({
      team_id: profile.team_id,
      invited_by: user.id,
      email: email.toLowerCase().trim(),
    })
    .select()
    .single()

  if (error) {
    log.error('team invite failed', { err: error, subsystem: 'supabase', op: 'team.invite' })
    return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
  }

  return NextResponse.json({ invite, inviteLink: `/team/join?token=${invite.token}` })
}
