import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, PlanGateError } from '@/lib/plan/access'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token is required.' }, { status: 400 })

  // Service role is required: accepting invites mutates invite/member/profile rows that are not all writable under invitee RLS.
  const service = createAdminClient()

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
  try {
    await assertHasFeature(ownerId, 'sharedLibrary')
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json(
        { error: `Team subscription is not active: ${err.message}`, feature: err.feature },
        { status: 403 },
      )
    }
    console.error('[team-join] owner feature gate error:', err)
    return NextResponse.json({ error: 'Failed to validate team subscription.' }, { status: 500 })
  }

  const { count } = await service
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', invite.team_id)
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Team is full (max 10 members).' }, { status: 403 })
  }

  await service.from('team_members').upsert({
    team_id: invite.team_id,
    user_id: user.id,
    role: 'member',
  })

  // C3: do NOT touch profiles.plan. Team features are gated by team_members
  // membership (already enforced in the UI gates) plus an active owner plan.
  await service.from('profiles').update({ team_id: invite.team_id }).eq('id', user.id)

  await service.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id)

  return NextResponse.json({ success: true, teamName: (invite.teams as { name: string })?.name })
}
