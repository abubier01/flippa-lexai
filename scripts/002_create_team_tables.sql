-- Teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members table (needed before team policies that reference it)
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Membership helper used by team-scoped RLS policies.
-- SECURITY DEFINER avoids recursive policy evaluation on team_members.
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.team_members tm
     WHERE tm.team_id = p_team_id
       AND tm.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_team_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(UUID) TO authenticated;

-- Teams RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_select_member') THEN
    CREATE POLICY "teams_select_member" ON public.teams FOR SELECT USING (
      auth.uid() = owner_id OR
      (SELECT public.is_team_member(teams.id))
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_insert_owner') THEN
    CREATE POLICY "teams_insert_owner" ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_update_owner') THEN
    CREATE POLICY "teams_update_owner" ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_delete_owner') THEN
    CREATE POLICY "teams_delete_owner" ON public.teams FOR DELETE USING (auth.uid() = owner_id);
  END IF;
END $$;

-- Team members RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_select') THEN
    CREATE POLICY "team_members_select" ON public.team_members FOR SELECT USING (
      user_id = auth.uid() OR
      (SELECT public.is_team_member(team_members.team_id))
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_insert_owner') THEN
    CREATE POLICY "team_members_insert_owner" ON public.team_members FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
      OR user_id = auth.uid()
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_delete') THEN
    CREATE POLICY "team_members_delete" ON public.team_members FOR DELETE USING (
      user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
    );
  END IF;
END $$;

-- Team invites table
CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_select_team_member') THEN
    CREATE POLICY "invites_select_team_member" ON public.team_invites FOR SELECT USING (
      invited_by = auth.uid() OR
      (SELECT public.is_team_member(team_invites.team_id))
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_insert_member') THEN
    CREATE POLICY "invites_insert_member" ON public.team_invites FOR INSERT WITH CHECK (
      (SELECT public.is_team_member(team_invites.team_id))
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_update') THEN
    CREATE POLICY "invites_update" ON public.team_invites FOR UPDATE USING (
      invited_by = auth.uid() OR
      EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
    );
  END IF;
END $$;

-- Extend contracts with team sharing columns
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN DEFAULT FALSE;

-- Allow team members to read team-shared contracts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='contracts_select_team') THEN
    CREATE POLICY "contracts_select_team" ON public.contracts FOR SELECT USING (
      shared_with_team = TRUE AND
      (SELECT public.is_team_member(contracts.team_id))
    );
  END IF;
END $$;

-- Allow team members to read analyses for team-shared contracts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contract_analyses' AND policyname='analyses_select_team') THEN
    CREATE POLICY "analyses_select_team" ON public.contract_analyses FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.contracts c
        WHERE c.id = contract_analyses.contract_id
          AND c.shared_with_team = TRUE
          AND (SELECT public.is_team_member(c.team_id))
      )
    );
  END IF;
END $$;

-- Allow team members to read chat for team-shared contracts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='messages_select_team') THEN
    CREATE POLICY "messages_select_team" ON public.chat_messages FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.contracts c
        WHERE c.id = chat_messages.contract_id
          AND c.shared_with_team = TRUE
          AND (SELECT public.is_team_member(c.team_id))
      )
    );
  END IF;
END $$;

-- Allow team members to update shared_with_team flag on own contracts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='contracts_update_share') THEN
    CREATE POLICY "contracts_update_share" ON public.contracts FOR UPDATE USING (
      auth.uid() = user_id
    );
  END IF;
END $$;

-- Add team_id to profiles (which team they belong to)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
