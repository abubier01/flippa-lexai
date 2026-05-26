-- 010_fix_team_rls_recursion.sql
-- Fixes "infinite recursion detected in policy for relation team_members".
--
-- Root cause:
-- team policies used EXISTS subqueries against public.team_members inside
-- public.team_members RLS policies themselves. When other table policies
-- (contracts/analyses/messages/invites/teams) joined team_members, Postgres
-- could recurse while evaluating RLS and reject the query.
--
-- Strategy:
-- 1) Move membership check into a SECURITY DEFINER helper function.
-- 2) Recreate team-related SELECT/INSERT policies to call that helper rather
--    than querying team_members inline.
--
-- Safe to run multiple times.

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

-- Drop legacy and current policy-name variants, then recreate canonical forms.
DROP POLICY IF EXISTS "teams_select_member" ON public.teams;
DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
DROP POLICY IF EXISTS "invites_select_team_member" ON public.team_invites;
DROP POLICY IF EXISTS "invites_select" ON public.team_invites;
DROP POLICY IF EXISTS "invites_insert_member" ON public.team_invites;
DROP POLICY IF EXISTS "invites_insert" ON public.team_invites;
DROP POLICY IF EXISTS "contracts_select_team" ON public.contracts;
DROP POLICY IF EXISTS "analyses_select_team" ON public.contract_analyses;
DROP POLICY IF EXISTS "messages_select_team" ON public.chat_messages;

CREATE POLICY "teams_select_member"
  ON public.teams
  FOR SELECT
  USING (
    auth.uid() = owner_id
    OR (SELECT public.is_team_member(teams.id))
  );

CREATE POLICY "team_members_select"
  ON public.team_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (SELECT public.is_team_member(team_members.team_id))
  );

CREATE POLICY "invites_select_team_member"
  ON public.team_invites
  FOR SELECT
  USING (
    invited_by = auth.uid()
    OR (SELECT public.is_team_member(team_invites.team_id))
  );

CREATE POLICY "invites_insert_member"
  ON public.team_invites
  FOR INSERT
  WITH CHECK (
    (SELECT public.is_team_member(team_invites.team_id))
  );

CREATE POLICY "contracts_select_team"
  ON public.contracts
  FOR SELECT
  USING (
    shared_with_team = TRUE
    AND (SELECT public.is_team_member(contracts.team_id))
  );

CREATE POLICY "analyses_select_team"
  ON public.contract_analyses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.contracts c
       WHERE c.id = contract_analyses.contract_id
         AND c.shared_with_team = TRUE
         AND (SELECT public.is_team_member(c.team_id))
    )
  );

CREATE POLICY "messages_select_team"
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.contracts c
       WHERE c.id = chat_messages.contract_id
         AND c.shared_with_team = TRUE
         AND (SELECT public.is_team_member(c.team_id))
    )
  );
