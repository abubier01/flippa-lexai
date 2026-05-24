-- 008_team_analyses_messages_rls.sql
-- Team-scoped SELECT policies for contract_analyses and chat_messages.
--
-- Background: scripts/002_create_team_tables.sql added `contracts_select_team`
-- so team members can read contracts shared via `shared_with_team = TRUE`,
-- but no equivalent policies existed for the dependent analyses or chat
-- messages. Result: a team viewer opening a shared contract saw the contract
-- metadata but got null/empty analyses and an empty chat (the page-level
-- comment in app/contracts/[id]/page.tsx called this out as the
-- "team-viewer gap").
--
-- This migration closes that gap by mirroring `contracts_select_team` for the
-- two child tables: a team member can SELECT an analysis or message row when
-- the row's parent contract is shared with their team. Insert/update/delete
-- intentionally remain owner-only — team viewers are read-only.
--
-- Idempotent: safe to re-run via the Supabase SQL editor. Postgres does not
-- support `CREATE POLICY IF NOT EXISTS`, so we DROP-then-CREATE for both.

-- ---------------------------------------------------------------------------
-- contract_analyses: team viewers can SELECT analyses for shared contracts.
-- Mirrors `contracts_select_team` in scripts/002_create_team_tables.sql.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "analyses_select_team" ON public.contract_analyses;
CREATE POLICY "analyses_select_team" ON public.contract_analyses FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.contracts c
      JOIN public.team_members tm ON tm.team_id = c.team_id
     WHERE c.id = contract_analyses.contract_id
       AND c.shared_with_team = TRUE
       AND tm.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- chat_messages: team viewers can SELECT messages for shared contracts.
-- Same shape as analyses_select_team above.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "messages_select_team" ON public.chat_messages;
CREATE POLICY "messages_select_team" ON public.chat_messages FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.contracts c
      JOIN public.team_members tm ON tm.team_id = c.team_id
     WHERE c.id = chat_messages.contract_id
       AND c.shared_with_team = TRUE
       AND tm.user_id = auth.uid()
  )
);
