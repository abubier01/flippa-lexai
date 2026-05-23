import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, PlanGateError } from '@/lib/plan/access'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await assertHasFeature(user.id, 'clauseExtraction')
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message, feature: err.feature }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to validate feature access.' }, { status: 500 })
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!contract) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 })

  const { data: analysis, error } = await supabase
    .from('contract_analyses')
    .select('clauses')
    .eq('contract_id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to load clause extraction.' }, { status: 500 })
  }

  return NextResponse.json({
    contractId: id,
    clauses: (analysis?.clauses as Record<string, string> | null) ?? {},
  })
}
