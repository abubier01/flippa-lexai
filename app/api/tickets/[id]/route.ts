import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Resolve who is making the request: returns { userId, lookupEmail, authorized }
async function resolveAccess(req: NextRequest, ticketId: string) {
  // Try auth user first
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return { userId: user.id, userEmail: user.email, lookupEmail: null, authed: true }

  // Fall back to lookup email from header
  const lookupEmail = req.headers.get('x-lookup-email')?.trim().toLowerCase()
  if (!lookupEmail) return { userId: null, userEmail: null, lookupEmail: null, authed: false }

  // Verify the ticket actually belongs to this email
  const service = getService()
  const { data: ticket } = await service
    .from('support_tickets')
    .select('id, email')
    .eq('id', ticketId)
    .single()

  if (!ticket || ticket.email.toLowerCase() !== lookupEmail) {
    return { userId: null, userEmail: null, lookupEmail: null, authed: false }
  }

  return { userId: null, userEmail: null, lookupEmail, authed: true }
}

// GET /api/tickets/[id] — fetch single ticket with replies
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await resolveAccess(req, id)
  if (!access.authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getService()
  const { data: ticket, error } = await service
    .from('support_tickets')
    .select('*, ticket_replies(*)')
    .eq('id', id)
    .order('created_at', { referencedTable: 'ticket_replies', ascending: true })
    .single()

  if (error || !ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  return NextResponse.json({ ticket })
}

// POST /api/tickets/[id] — add a reply (auth user or email-verified guest)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await resolveAccess(req, id)
  if (!access.authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, guestName } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const service = getService()

  // Get ticket to verify it exists
  const { data: ticket } = await service
    .from('support_tickets')
    .select('id, name, status')
    .eq('id', id)
    .single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
  if (ticket.status === 'closed') return NextResponse.json({ error: 'This ticket is closed.' }, { status: 403 })

  // Resolve author name
  let authorName = 'User'
  if (access.userId) {
    // Logged in — fetch their profile name
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    authorName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  } else if (guestName?.trim()) {
    authorName = guestName.trim()
  } else {
    authorName = ticket.name
  }

  const { data: reply, error } = await service
    .from('ticket_replies')
    .insert({
      ticket_id: id,
      author_type: 'user',
      author_name: authorName,
      message: message.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ reply })
}
