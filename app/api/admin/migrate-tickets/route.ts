import { NextResponse } from 'next/server'

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?.replace('https://', '')
  .replace('.supabase.co', '')

const SQL = `
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGSERIAL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','billing','technical','feature','bug','other')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL DEFAULT 'user' CHECK (author_type IN ('user','support')),
  author_name TEXT NOT NULL DEFAULT 'Support Team',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='support_tickets' AND policyname='tickets_insert_any') THEN
    CREATE POLICY tickets_insert_any ON public.support_tickets FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='support_tickets' AND policyname='tickets_select_own') THEN
    CREATE POLICY tickets_select_own ON public.support_tickets FOR SELECT
      USING (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_replies' AND policyname='replies_select_own') THEN
    CREATE POLICY replies_select_own ON public.ticket_replies FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR t.email = (SELECT email FROM auth.users WHERE id = auth.uid()))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_replies' AND policyname='replies_insert_own') THEN
    CREATE POLICY replies_insert_own ON public.ticket_replies FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR t.email = (SELECT email FROM auth.users WHERE id = auth.uid()))));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_ticket_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS ticket_updated_at ON public.support_tickets;
CREATE TRIGGER ticket_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_ticket_updated_at();
`

export async function POST() {
  if (!PROJECT_REF) {
    return NextResponse.json({ error: 'Missing SUPABASE_URL' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: SQL }),
    }
  )

  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }

  if (!res.ok) {
    return NextResponse.json({ error: data, status: res.status }, { status: 500 })
  }

  return NextResponse.json({ success: true, result: data })
}
