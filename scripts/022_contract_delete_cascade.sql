-- scripts/022_contract_delete_cascade.sql
--
-- Fix CRITICAL: deleting an analyzed contract throws a FK violation because
-- analysis_runs.contract_id was declared without an ON DELETE clause in 016.
-- The DELETE route (app/api/contracts/[id]/route.ts) assumes cascade cleanup.
--
-- Also fixes the reverse FK contracts.current_run_id → analysis_runs.id so
-- run cleanup doesn't fail on the orphan pointer. ON DELETE SET NULL is safe;
-- promote_analysis_run resets it explicitly on every promotion anyway.
--
-- Delete order in a single DELETE FROM contracts statement:
--   1. contracts.current_run_id → analysis_runs (SET NULL)
--   2. The FK cascade triggers DELETE on analysis_runs rows (their
--      contract_id → contracts)
-- Both must be safe; the reverse FK SET NULL prevents the would-be deleted
-- run from blocking its own deletion via the pointer back to contracts.

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.analysis_runs
  DROP CONSTRAINT analysis_runs_contract_id_fkey;

ALTER TABLE public.analysis_runs
  ADD CONSTRAINT analysis_runs_contract_id_fkey
  FOREIGN KEY (contract_id)
  REFERENCES public.contracts(id)
  ON DELETE CASCADE;

ALTER TABLE public.contracts
  DROP CONSTRAINT contracts_current_run_id_fkey;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_current_run_id_fkey
  FOREIGN KEY (current_run_id)
  REFERENCES public.analysis_runs(id)
  ON DELETE SET NULL;

COMMIT;
