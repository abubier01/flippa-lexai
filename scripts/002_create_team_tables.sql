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

-- Teams RLS
CREATE POLICY "teams_select_member" ON public.teams FOR SELECT USING (
  auth.uid() = owner_id OR 
  EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
);
CREATE POLICY "teams_insert_owner" ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "teams_update_owner" ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "teams_delete_owner" ON public.teams FOR DELETE USING (auth.uid() = owner_id);

-- Team members RLS
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.team_members tm2 WHERE tm2.team_id = team_members.team_id AND tm2.user_id = auth.uid())
);
CREATE POLICY "team_members_insert_owner" ON public.team_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
  OR user_id = auth.uid()
);
CREATE POLICY "team_members_delete" ON public.team_members FOR DELETE USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
);

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

CREATE POLICY "invites_select_team_member" ON public.team_invites FOR SELECT USING (
  invited_by = auth.uid() OR
  EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
);
CREATE POLICY "invites_insert_member" ON public.team_invites FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
);
CREATE POLICY "invites_update" ON public.team_invites FOR UPDATE USING (
  invited_by = auth.uid() OR
  EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
);

-- Extend contracts with team sharing columns
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN DEFAULT FALSE;

-- Allow team members to read team-shared contracts
CREATE POLICY "contracts_select_team" ON public.contracts FOR SELECT USING (
  shared_with_team = TRUE AND
  EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = contracts.team_id AND user_id = auth.uid()
  )
);

-- Allow team members to update shared_with_team flag on own contracts
CREATE POLICY "contracts_update_share" ON public.contracts FOR UPDATE USING (
  auth.uid() = user_id
);

-- Add team_id to profiles (which team they belong to)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
