-- 019 down: drop the invariants RPC.
\set ON_ERROR_STOP on
BEGIN;
DROP FUNCTION IF EXISTS public.check_current_run_invariants();
COMMIT;
