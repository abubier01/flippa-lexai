import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyTicketsClient from './my-tickets-client'

export const metadata = {
  title: 'My Tickets — LexAI',
  description: 'Track and reply to your LexAI support tickets.',
}

export default async function MyTicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/my-tickets')

  const { data } = await supabase
    .from('support_tickets')
    .select('id, ticket_number, subject, category, status, priority, message, name, email, created_at, updated_at, ticket_replies(id)')
    .order('updated_at', { ascending: false })
  const initialTickets = data ?? []

  return (
    <MyTicketsClient
      initialTickets={initialTickets}
      userEmail={user.email?.toLowerCase() ?? null}
    />
  )
}
