import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/tickets — submit a new support ticket (public, no auth required)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, subject, category, message } = body

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }
  if (message.trim().length < 20) {
    return NextResponse.json({ error: 'Message must be at least 20 characters.' }, { status: 400 })
  }

  // Try to get auth user (optional — works even if unauthenticated)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Use service role to bypass RLS on insert so anon users can submit
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: ticket, error } = await service
    .from('support_tickets')
    .insert({
      user_id: user?.id ?? null,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      category: category || 'general',
      message: message.trim(),
      status: 'open',
      priority: 'normal',
    })
    .select('id, ticket_number')
    .single()

  if (error) {
    console.error('[tickets] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit ticket. Please try again.' }, { status: 500 })
  }

  // Auto-reply from support
  await service.from('ticket_replies').insert({
    ticket_id: ticket.id,
    author_type: 'support',
    author_name: 'LexAI Support',
    message: `Hi ${name.trim().split(' ')[0]}, thanks for reaching out! We've received your message and will get back to you within 24 hours. Your ticket number is #${ticket.ticket_number}. You can track this ticket anytime by visiting your tickets page.`,
  })

  return NextResponse.json({ id: ticket.id, ticketNumber: ticket.ticket_number })
}

// GET /api/tickets — fetch tickets for the logged-in user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select(`
      id, ticket_number, subject, category, status, priority, created_at, updated_at,
      ticket_replies(count)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets })
}
