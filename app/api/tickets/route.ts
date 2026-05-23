import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consumeRateLimit, getClientIp, rateLimitHeaders } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/tickets — submit a new support ticket (public, no auth required)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 })
  }

  const hpCompany = typeof body.hp_company === 'string' ? body.hp_company.trim() : ''
  if (hpCompany.length > 0) {
    return NextResponse.json({ ok: true })
  }

  const { name, email, subject, category, message } = body
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const trimmedSubject = typeof subject === 'string' ? subject.trim() : ''
  const trimmedMessage = typeof message === 'string' ? message.trim() : ''

  const ip = getClientIp(req)
  const ipLimit = await consumeRateLimit({
    key: `tickets:create:ip:${ip}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again shortly.' },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    )
  }

  if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }
  if (trimmedName.length > 100) {
    return NextResponse.json({ error: 'Name must be 100 characters or fewer.' }, { status: 400 })
  }
  if (trimmedSubject.length > 200) {
    return NextResponse.json({ error: 'Subject must be 200 characters or fewer.' }, { status: 400 })
  }
  if (trimmedMessage.length < 20) {
    return NextResponse.json({ error: 'Message must be at least 20 characters.' }, { status: 400 })
  }
  if (trimmedMessage.length > 5000) {
    return NextResponse.json({ error: 'Message must be 5000 characters or fewer.' }, { status: 400 })
  }

  const emailLimit = await consumeRateLimit({
    key: `tickets:create:email:${trimmedEmail}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  })
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again shortly.' },
      { status: 429, headers: rateLimitHeaders(emailLimit) },
    )
  }

  // Try to get auth user (optional — works even if unauthenticated)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Service role is required: public/anonymous ticket intake must bypass RLS to insert support rows.
  const service = createAdminClient()

  const { data: ticket, error } = await service
    .from('support_tickets')
    .insert({
      user_id: user?.id ?? null,
      name: trimmedName,
      email: trimmedEmail,
      subject: trimmedSubject,
      category: category || 'general',
      message: trimmedMessage,
      status: 'open',
      priority: 'normal',
    })
    .select('id, ticket_number')
    .single()

  if (error) {
    console.error('[tickets] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit ticket. Please try again.' }, { status: 500 })
  }

  if (user) {
    // Authenticated users get the immediate support acknowledgement reply.
    await service.from('ticket_replies').insert({
      ticket_id: ticket.id,
      author_type: 'support',
      author_name: 'LexAI Support',
      message: `Hi ${trimmedName.split(' ')[0]}, thanks for reaching out! We've received your message and will get back to you within 24 hours. Your ticket number is #${ticket.ticket_number}. You can track this ticket anytime by visiting your tickets page.`,
    })
  }

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
