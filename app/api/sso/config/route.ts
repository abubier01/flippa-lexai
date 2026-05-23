import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, PlanGateError } from '@/lib/plan/access'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await assertHasFeature(user.id, 'sso')
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message, feature: err.feature }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to validate feature access.' }, { status: 500 })
  }

  return NextResponse.json(
    { error: 'SSO configuration endpoint is not implemented yet.' },
    { status: 501 },
  )
}
