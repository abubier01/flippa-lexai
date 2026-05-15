// POST /api/team/invite — send an invite to an email
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceRole() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })

  const service = serviceRole()

  const { data: profile } = await service
    .from('profiles')
    .select('plan, team_id')
    .eq('id', user.id)
    .single()

  if (profile?.plan !== 'team' || !profile?.team_id) {
    return NextResponse.json({ error: 'Team plan and active team required.' }, { status: 403 })
  }

  // Check member limit (max 10)
  const { count } = await service
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', profile.team_id)

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Team is full (max 10 members).' }, { status: 403 })
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
    console.error('[invite] error:', error.message)
    return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
  }

  return NextResponse.json({ invite, inviteLink: `/team/join?token=${invite.token}` })
}
