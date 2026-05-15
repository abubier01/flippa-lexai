import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import MyTicketsClient from './my-tickets-client'

export const metadata = {
  title: 'My Tickets — LexAI',
  description: 'Track and reply to your LexAI support tickets.',
}

export default async function MyTicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Use service role to bypass RLS — filter by email so we get ALL tickets
  // submitted by this user whether they were logged in or not at submission time.
  let initialTickets: object[] = []
  if (user?.email) {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await service
      .from('support_tickets')
      .select('id, ticket_number, subject, category, status, priority, message, name, email, created_at, updated_at, ticket_replies(id)')
      .eq('email', user.email.toLowerCase())
      .order('updated_at', { ascending: false })
    initialTickets = data ?? []
  }

  return (
    <MyTicketsClient
      initialTickets={initialTickets}
      userId={user?.id ?? null}
      userEmail={user?.email?.toLowerCase() ?? null}
      userName={user?.user_metadata?.full_name ?? null}
    />
  )
}
