-- 012: chat_messages UPDATE RLS policy
-- Fix: P0-1 from docs/audits/AUDIT_REPORT.md
-- Without this, the chat route's UPDATE of the assistant placeholder
-- silently matches zero rows under RLS, dropping every assistant reply
-- from history.

CREATE POLICY "messages_update_own" ON public.chat_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
