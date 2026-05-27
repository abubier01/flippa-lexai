// GET /api/team — fetch current user's team + members + invites
// POST /api/team — create a new team (team plan only)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasTeamAccess } from '@/lib/plan/access'
import { getServiceClient } from '@/lib/supabase/service-role'
import { log } from '@/lib/log'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, team_id')
    .eq('id', user.id)
    .single()

  if (!profile?.team_id) {
    return NextResponse.json({ team: null, members: [], invites: [] })
  }

  const service = getServiceClient()
  const [teamRes, membersWithProfilesRes, invitesRes] = await Promise.all([
    service.from('teams').select('*').eq('id', profile.team_id).single(),
    service
      .from('team_members')
      .select('id, user_id, role, joined_at, profiles(id, full_name, plan)')
      .eq('team_id', profile.team_id),
    service.from('team_invites').select('*').eq('team_id', profile.team_id).eq('status', 'pending'),
  ])

  let members: Array<{
    id: string
    user_id: string
    role: string
    joined_at: string
    profiles: { id: string; full_name: string | null; plan: string }
  }> = []
  if (!membersWithProfilesRes.error && membersWithProfilesRes.data) {
    members = membersWithProfilesRes.data.map((m) => {
      const profileValue = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return {
        ...m,
        profiles: profileValue ?? { id: m.user_id, full_name: null, plan: 'solo' },
      }
    })
  } else {
    const { data: membersRes } = await service.from('team_members').select('*').eq('team_id', profile.team_id)
    const rawMembers: { id: string; user_id: string; role: string; joined_at: string }[] = membersRes || []
    const userIds = rawMembers.map(m => m.user_id).filter(Boolean)
    const { data: profileRows } = userIds.length > 0
      ? await service.from('profiles').select('id, full_name, plan').in('id', userIds)
      : { data: [] as { id: string; full_name: string | null; plan: string }[] }
    const profileMap = Object.fromEntries((profileRows || []).map((p) => [p.id, p]))
    members = rawMembers.map((m) => ({
      ...m,
      profiles: profileMap[m.user_id] ?? { id: m.user_id, full_name: null, plan: 'solo' },
    }))
  }

  return NextResponse.json({
    team: teamRes.data,
    members,
    invites: invitesRes.data || [],
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single()

  const access = await hasTeamAccess(user.id)
  if (!access.ok || access.via !== 'own') {
    return NextResponse.json({ error: 'Team plan required to create a team.' }, { status: 403 })
  }

  if (profile?.team_id) {
    return NextResponse.json({ error: 'You already belong to a team.' }, { status: 409 })
  }

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Team name is required.' }, { status: 400 })

  // Use service role to bypass RLS for all mutations
  const service = getServiceClient()

  const { data: team, error: teamErr } = await service
    .from('teams')
    .insert({ name: name.trim(), owner_id: user.id })
    .select()
    .single()

  if (teamErr || !team) {
    log.error('team create failed', { err: teamErr, subsystem: 'supabase', op: 'team.create' })
    return NextResponse.json({ error: teamErr?.message || 'Failed to create team.' }, { status: 500 })
  }

  // Add owner as member
  const { error: memberErr } = await service
    .from('team_members')
    .insert({ team_id: team.id, user_id: user.id, role: 'owner' })

  if (memberErr) {
    log.error('team add member failed', { err: memberErr, subsystem: 'supabase', op: 'team.addMember' })
  }

  // Update profile with team_id
  const { error: profileErr } = await service
    .from('profiles')
    .update({ team_id: team.id })
    .eq('id', user.id)

  if (profileErr) {
    log.error('profile update failed', { err: profileErr, subsystem: 'supabase', op: 'profile.update' })
  }

  // Fetch member + profile separately (FK join causes 400 with service role)
  const { data: memberRow } = await service
    .from('team_members').select('*').eq('team_id', team.id).eq('user_id', user.id).single()
  const { data: ownerProfile } = await service
    .from('profiles').select('id, full_name, plan').eq('id', user.id).single()

  const memberWithProfile = memberRow
    ? { ...memberRow, profiles: ownerProfile ?? { id: user.id, full_name: null } }
    : null

  return NextResponse.json({ team, members: memberWithProfile ? [memberWithProfile] : [] })
}
