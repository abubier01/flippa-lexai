-- 013: index FK / RLS predicate columns
-- Fix: P0-2 from docs/audits/AUDIT_REPORT.md
-- Postgres does not auto-index FK columns. Without these, every contract
-- detail page becomes a seq scan as chat_messages / contract_analyses grow.

CREATE INDEX IF NOT EXISTS idx_contract_analyses_contract_id
  ON public.contract_analyses(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_analyses_user_id
  ON public.contract_analyses(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_contract_id
  ON public.chat_messages(contract_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
  ON public.chat_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_contracts_team_id
  ON public.contracts(team_id);

CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.team_members(user_id);

CREATE INDEX IF NOT EXISTS idx_team_invites_team_id
  ON public.team_invites(team_id);

CREATE INDEX IF NOT EXISTS idx_team_invites_email
  ON public.team_invites(email);
