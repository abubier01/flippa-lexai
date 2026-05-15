// POST /api/stripe/sync-plan
// Re-verifies the most recent paid Stripe session for the current user and syncs plan to DB.
// Used when a user paid but their DB plan wasn't updated (e.g. session expired before redirect).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import type { PlanType } from '@/lib/plan-limits'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'Session ID required' }, { status: 400 })

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }
    if (session.metadata?.userId !== user.id) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 })
    }

    const plan = session.metadata?.plan as PlanType
    if (!plan || !['pro', 'team'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    await supabase.from('profiles').update({ plan }).eq('id', user.id)
    return NextResponse.json({ success: true, plan })
  } catch (err) {
    console.error('[v0] Sync plan error:', err)
    return NextResponse.json({ error: 'Failed to sync plan' }, { status: 500 })
  }
}
