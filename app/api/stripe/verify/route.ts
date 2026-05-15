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

    // Retrieve the session directly from Stripe — the source of truth
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Security checks:
    // 1. Payment must be paid
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    // 2. The userId in metadata must match the authenticated user
    if (session.metadata?.userId !== user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 })
    }

    // 3. The plan must be valid
    const plan = session.metadata?.plan as PlanType
    if (!plan || !['pro', 'team'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan in session' }, { status: 400 })
    }

    // Update the user's plan in Supabase
    const { error } = await supabase
      .from('profiles')
      .update({ plan })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true, plan })
  } catch (err) {
    console.error('[v0] Stripe verify error:', err)
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 })
  }
}
