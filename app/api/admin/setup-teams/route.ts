import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/security/admin-guard'
import { executeAdminSql } from '@/lib/supabase/admin-db'

// This route creates the team tables using individual Supabase operations
// since we cannot run raw DDL through the JS client directly.
// It uses the management API to run SQL.
export async function POST(request: Request) {
  const denied = await requireAdminAccess(request)
  if (denied) return denied

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
    // child-table read RLS for team-shared contracts
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contract_analyses' AND policyname='analyses_select_team') THEN
        CREATE POLICY analyses_select_team ON public.contract_analyses FOR SELECT USING (
          EXISTS (
            SELECT 1
              FROM public.contracts c
              JOIN public.team_members tm ON tm.team_id = c.team_id
             WHERE c.id = contract_analyses.contract_id
               AND c.shared_with_team = TRUE
               AND tm.user_id = auth.uid()
          )
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='messages_select_team') THEN
        CREATE POLICY messages_select_team ON public.chat_messages FOR SELECT USING (
          EXISTS (
            SELECT 1
              FROM public.contracts c
              JOIN public.team_members tm ON tm.team_id = c.team_id
             WHERE c.id = chat_messages.contract_id
               AND c.shared_with_team = TRUE
               AND tm.user_id = auth.uid()
          )
        );
      END IF;
    END $$`,
  ]

  const results: { sql: string; ok: boolean; error?: string }[] = []

  for (const sql of statements) {
    const result = await executeAdminSql(sql)
    if (result.ok) {
      results.push({ sql: sql.slice(0, 60), ok: true })
    } else {
      results.push({ sql: sql.slice(0, 60), ok: false, error: result.error })
    }
  }

  return NextResponse.json({ results })
}
