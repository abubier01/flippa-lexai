import pg from 'pg'
import { readFileSync } from 'fs'

const { Client } = pg

// Load env manually
const envFile = new URL('../.env.development.local', import.meta.url)
let envContents = ''
try { envContents = readFileSync(envFile, 'utf8') } catch {}
for (const line of envContents.split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
}

const client = new Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('Connected to database.')

const SQL = `
-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'billing', 'technical', 'feature', 'bug', 'other')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ticket replies table
CREATE TABLE IF NOT EXISTS public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL DEFAULT 'user' CHECK (author_type IN ('user', 'support')),
  author_name TEXT NOT NULL DEFAULT 'Support Team',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can see their own tickets (by user_id or email)
CREATE POLICY IF NOT EXISTS "tickets_select_own" ON public.support_tickets
  FOR SELECT USING (
    user_id = auth.uid() OR
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Anyone can insert (unauthenticated contact form)
CREATE POLICY IF NOT EXISTS "tickets_insert_any" ON public.support_tickets
  FOR INSERT WITH CHECK (true);

-- Users can update their own tickets (to close them etc)
CREATE POLICY IF NOT EXISTS "tickets_update_own" ON public.support_tickets
  FOR UPDATE USING (user_id = auth.uid());

-- RLS for ticket_replies
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

-- Users can see replies to their own tickets
CREATE POLICY IF NOT EXISTS "replies_select_own" ON public.ticket_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND (
        t.user_id = auth.uid() OR
        t.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

-- Users can add replies to their own tickets
CREATE POLICY IF NOT EXISTS "replies_insert_own" ON public.ticket_replies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND (
        t.user_id = auth.uid() OR
        t.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_updated_at ON public.support_tickets;
CREATE TRIGGER ticket_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_ticket_updated_at();
`

try {
  await client.query(SQL)
  console.log('Support tickets tables created successfully.')
} catch (err) {
  console.error('Migration error:', err.message)
} finally {
  await client.end()
}
