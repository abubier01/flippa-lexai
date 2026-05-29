-- scripts/017_admin_rpcs.down.sql
-- Inverse of 017_admin_rpcs.sql. Drops both SECURITY DEFINER functions.

\set ON_ERROR_STOP on

BEGIN;

DROP FUNCTION IF EXISTS public.promote_analysis_run(uuid, jsonb);
DROP FUNCTION IF EXISTS public.publish_persona_draft(text, uuid);

COMMIT;
