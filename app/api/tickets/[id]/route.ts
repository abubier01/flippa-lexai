import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'

// GET /api/tickets/[id] — fetch single ticket with replies
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .select('*, ticket_replies(*)')
    .eq('id', id)
    .order('created_at', { referencedTable: 'ticket_replies', ascending: true })
    .single()

  if (error || !ticket) {
    // PGRST116 is the expected "single row not found" path — RLS denial or
    // genuine missing ticket. Anything else is an unexpected DB failure that
    // would otherwise be masked as a 404 to the user with no operator signal.
    if (error && error.code !== 'PGRST116') {
      log.error('ticket fetch failed', { err: error, subsystem: 'supabase', op: 'tickets.fetch' })
    }
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }
  return NextResponse.json({ ticket })
}

// POST /api/tickets/[id] — add a reply as the authenticated user
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  // Get ticket to verify it exists
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, name, status')
    .eq('id', id)
    .single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
  if (ticket.status === 'closed') return NextResponse.json({ error: 'This ticket is closed.' }, { status: 403 })

  const authorName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'

  const { data: reply, error } = await supabase
    .from('ticket_replies')
    .insert({
      ticket_id: id,
      author_type: 'user',
      author_name: authorName,
      message: message.trim(),
    })
    .select()
    .single()

  if (error) {
    log.error('ticket reply insert failed', { err: error, subsystem: 'supabase', op: 'tickets.reply.insert' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ reply })
}
