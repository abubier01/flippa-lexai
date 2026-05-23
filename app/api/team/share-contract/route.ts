// POST /api/team/share-contract — toggle sharing a contract with the team
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, hasTeamAccess, PlanGateError } from '@/lib/plan/access'
import { createAdminClient } from '@/lib/supabase/admin'

function serviceRole() {
  // Service role is required: toggling team sharing updates contract visibility fields that can be blocked by current RLS update policies.
  return createAdminClient()
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contractId, share } = await req.json()
  if (!contractId) return NextResponse.json({ error: 'Contract ID required.' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single()

  const access = await hasTeamAccess(user.id)
  if (!access.ok || !profile?.team_id) {
    return NextResponse.json({ error: 'Team plan required.' }, { status: 403 })
  }

  try {
    if (access.via === 'own') {
      await assertHasFeature(user.id, 'sharedLibrary')
    } else {
      const service = serviceRole()
      const { data: team } = await service
        .from('teams')
        .select('owner_id')
        .eq('id', profile.team_id)
        .single()
      if (!team?.owner_id) {
        return NextResponse.json({ error: 'Team owner is missing.' }, { status: 500 })
      }
      await assertHasFeature(team.owner_id, 'sharedLibrary')
    }
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message, feature: err.feature }, { status: 403 })
    }
    console.error('[share-contract] feature gate error:', err)
    return NextResponse.json({ error: 'Failed to validate team access.' }, { status: 500 })
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
