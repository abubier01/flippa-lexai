import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// This route creates the team tables using individual Supabase operations
// since we cannot run raw DDL through the JS client directly.
// It uses the management API to run SQL.
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Extract project ref from URL: https://<ref>.supabase.co
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0]
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

  const statements = [
    // teams table
    `CREATE TABLE IF NOT EXISTS public.teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY`,
    // team_members
    `CREATE TABLE IF NOT EXISTS public.team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(team_id, user_id)
    )`,
    `ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY`,
    // team_invites
    `CREATE TABLE IF NOT EXISTS public.team_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
    )`,
    `ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY`,
    // Add columns to contracts + profiles
    `ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL`,
    `ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL`,
    // RLS policies for teams
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_select_member') THEN
        CREATE POLICY teams_select_member ON public.teams FOR SELECT USING (
          auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_insert_owner') THEN
        CREATE POLICY teams_insert_owner ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_update_owner') THEN
        CREATE POLICY teams_update_owner ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_delete_owner') THEN
        CREATE POLICY teams_delete_owner ON public.teams FOR DELETE USING (auth.uid() = owner_id);
      END IF;
    END $$`,
    // RLS for team_members
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_select') THEN
        CREATE POLICY team_members_select ON public.team_members FOR SELECT USING (
          user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members tm2 WHERE tm2.team_id = team_members.team_id AND tm2.user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_insert') THEN
        CREATE POLICY team_members_insert ON public.team_members FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid()
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_delete') THEN
        CREATE POLICY team_members_delete ON public.team_members FOR DELETE USING (
          user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
        );
      END IF;
    END $$`,
    // RLS for team_invites
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_select') THEN
        CREATE POLICY invites_select ON public.team_invites FOR SELECT USING (
          invited_by = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_insert') THEN
        CREATE POLICY invites_insert ON public.team_invites FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_update') THEN
        CREATE POLICY invites_update ON public.team_invites FOR UPDATE USING (
          invited_by = auth.uid() OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
        );
      END IF;
    END $$`,
    // contracts team RLS
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='contracts_select_team') THEN
        CREATE POLICY contracts_select_team ON public.contracts FOR SELECT USING (
          shared_with_team = TRUE AND EXISTS (
            SELECT 1 FROM public.team_members WHERE team_id = contracts.team_id AND user_id = auth.uid()
          )
        );
      END IF;
    END $$`,
  ]

  const results: { sql: string; ok: boolean; error?: string }[] = []

  // Run each statement individually via service role + pg workaround
  // Since we can't run DDL through supabase-js, use the REST API
  for (const sql of statements) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      })
      if (res.ok) {
        results.push({ sql: sql.slice(0, 60), ok: true })
      } else {
        const err = await res.text()
        results.push({ sql: sql.slice(0, 60), ok: false, error: err })
      }
    } catch (e) {
      results.push({ sql: sql.slice(0, 60), ok: false, error: String(e) })
    }
  }

  return NextResponse.json({ results })
}
