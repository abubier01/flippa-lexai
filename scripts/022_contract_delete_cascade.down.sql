-- scripts/022_contract_delete_cascade.down.sql
-- Revert FK ON DELETE actions to their 016-era NO ACTION defaults.

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.analysis_runs
  DROP CONSTRAINT analysis_runs_contract_id_fkey;

ALTER TABLE public.analysis_runs
  ADD CONSTRAINT analysis_runs_contract_id_fkey
  FOREIGN KEY (contract_id)
  REFERENCES public.contracts(id);

ALTER TABLE public.contracts
  DROP CONSTRAINT contracts_current_run_id_fkey;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_current_run_id_fkey
  FOREIGN KEY (current_run_id)
  REFERENCES public.analysis_runs(id);

COMMIT;
