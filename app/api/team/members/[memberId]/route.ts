// DELETE /api/team/members/[memberId] — remove a member (owner only)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, PlanGateError } from '@/lib/plan/access'
import { createAdminClient } from '@/lib/supabase/admin'

function serviceRole() {
  // Service role is required: owner-driven member removal updates another user's profile and membership rows.
  return createAdminClient()
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await assertHasFeature(user.id, 'sharedLibrary')
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message, feature: err.feature }, { status: 403 })
    }
    console.error('[team-members] feature gate error:', err)
    return NextResponse.json({ error: 'Failed to validate team access.' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single()

  if (!profile?.team_id) return NextResponse.json({ error: 'Not in a team.' }, { status: 403 })

  const service = serviceRole()

  // Ensure requester is the team owner
  const { data: team } = await service
    .from('teams')
    .select('owner_id')
    .eq('id', profile.team_id)
    .single()

  if (team?.owner_id !== user.id) {
    return NextResponse.json({ error: 'Only the team owner can remove members.' }, { status: 403 })
  }

  if (memberId === user.id) {
    return NextResponse.json({ error: 'Owner cannot remove themselves.' }, { status: 400 })
  }

  await service.from('team_members')
    .delete()
    .eq('team_id', profile.team_id)
    .eq('user_id', memberId)

  // Clear team_id from removed member's profile
  await service.from('profiles').update({ team_id: null }).eq('id', memberId)

  return NextResponse.json({ success: true })
}
