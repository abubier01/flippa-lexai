import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import type { PlanType } from '@/lib/plan-limits'
import { log } from '@/lib/log'

const TIER_ORDER: Record<PlanType, number> = { free: 0, pro: 1, team: 2 }

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'Session ID required' }, { status: 400 })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }
    if (session.client_reference_id !== user.id && session.metadata?.userId !== user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 })
    }

    const plan = session.metadata?.plan as PlanType
    if (!plan || !['pro', 'team'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan in session' }, { status: 400 })
    }

    // Defense-in-depth (S8): even though the webhook owns DB writes, surface
    // any tier-downgrade attempt as an error so the success page can show a
    // sensible message instead of celebrating a downgrade.
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    const currentTier = TIER_ORDER[(profile?.plan as PlanType) ?? 'free']
    if (TIER_ORDER[plan] < currentTier) {
      return NextResponse.json(
        { error: 'Cannot downgrade via checkout. Use the billing portal.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, plan })
  } catch (err) {
    log.error('stripe verify failed', { err, subsystem: 'stripe', op: 'verify' })
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 })
  }
}
