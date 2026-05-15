// POST /api/team/share-contract — toggle sharing a contract with the team
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

  const { contractId, share } = await req.json()
  if (!contractId) return NextResponse.json({ error: 'Contract ID required.' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, team_id')
    .eq('id', user.id)
    .single()

  if (profile?.plan !== 'team' || !profile?.team_id) {
    return NextResponse.json({ error: 'Team plan required.' }, { status: 403 })
  }

  // Verify contract belongs to user (use auth client — RLS protects this correctly)
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, user_id')
    .eq('id', contractId)
    .eq('user_id', user.id)
    .single()

  if (!contract) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 })

  // Use service role to update — RLS on contracts update may block this
  const service = serviceRole()
  const { error } = await service.from('contracts').update({
    shared_with_team: share,
    team_id: share ? profile.team_id : null,
  }).eq('id', contractId)

  if (error) {
    console.error('[share-contract] error:', error.message)
    return NextResponse.json({ error: 'Failed to update sharing.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, shared: share })
}
