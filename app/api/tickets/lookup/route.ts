import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'

// POST /api/tickets/lookup — authenticated lookup for the current user
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const requestedEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const userEmail = user.email?.trim().toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ error: 'Your account email is required to view tickets.' }, { status: 400 })
  }

  if (requestedEmail && requestedEmail !== userEmail) {
    return NextResponse.json({ error: 'You can only look up your own tickets.' }, { status: 403 })
  }

  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select(`
      id, ticket_number, subject, category, status, priority,
      message, name, email, created_at, updated_at,
      ticket_replies(id)
    `)
    .eq('email', userEmail)
    .order('updated_at', { ascending: false })

  if (error) {
    log.error('tickets lookup failed', { err: error, subsystem: 'supabase', op: 'tickets.lookup' })
    return NextResponse.json({ error: 'Failed to look up tickets.' }, { status: 500 })
  }

  return NextResponse.json({ tickets: tickets ?? [] })
}
