// DELETE /api/team/members/[memberId] — remove a member (owner only)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceRole() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
