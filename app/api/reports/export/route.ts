import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertHasFeature, PlanGateError } from '@/lib/plan/access'

function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await assertHasFeature(user.id, 'exportPdf')
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message, feature: err.feature }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to validate feature access.' }, { status: 500 })
  }

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, title, status, risk_score, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to load contracts for export.' }, { status: 500 })
  }

  const header = ['id', 'title', 'status', 'risk_score', 'created_at']
  const rows = (contracts ?? []).map((c) => [
    escapeCsv(c.id),
    escapeCsv(c.title),
    escapeCsv(c.status),
    escapeCsv(c.risk_score ?? ''),
    escapeCsv(c.created_at),
  ].join(','))

  const csv = [header.join(','), ...rows].join('\n')
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="lexai-report-${date}.csv"`,
    },
  })
}
