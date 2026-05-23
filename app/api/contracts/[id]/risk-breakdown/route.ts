import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, PlanGateError } from '@/lib/plan/access'

type RiskItem = { severity?: string }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await assertHasFeature(user.id, 'advancedRiskBreakdown')
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
    .select('risks')
    .eq('contract_id', id)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: 'Failed to load risk breakdown.' }, { status: 500 })
  }

  const risks = (analysis?.risks as RiskItem[] | null) ?? []
  const counts = { high: 0, medium: 0, low: 0 }
  const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }

  let weightedSum = 0
  for (const risk of risks) {
    const severity = risk.severity === 'high' || risk.severity === 'medium' || risk.severity === 'low'
      ? risk.severity
      : 'low'
    counts[severity] += 1
    weightedSum += weights[severity]
  }
  const averageRiskScore = risks.length > 0 ? Math.min(100, Math.round(weightedSum / risks.length)) : 0

  return NextResponse.json({
    contractId: id,
    counts,
    totalRisks: risks.length,
    averageRiskScore,
  })
}
