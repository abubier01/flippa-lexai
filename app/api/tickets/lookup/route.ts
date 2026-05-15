import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/tickets/lookup — public, look up tickets by email (no auth required)
export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tickets, error } = await service
    .from('support_tickets')
    .select(`
      id, ticket_number, subject, category, status, priority,
      message, name, email, created_at, updated_at,
      ticket_replies(id)
    `)
    .eq('email', email.trim().toLowerCase())
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[tickets/lookup]', error.message)
    return NextResponse.json({ error: 'Failed to look up tickets.' }, { status: 500 })
  }

  return NextResponse.json({ tickets: tickets ?? [] })
}
