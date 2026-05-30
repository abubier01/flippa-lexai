-- scripts/_checks/contract_analyses_deps.sql
--
-- Diagnostic query for the contract_analyses drop precondition (spec §
-- Drop-Table Precondition Checklist item #3). Used by:
--   * P8.1 CI gate (asserts zero rows before allowing 016 to deploy)
--   * Humans investigating a dep_count > 0 raised by 016 transaction 2
--
-- Expected result: ZERO ROWS on a healthy pre-cutover DB.

SELECT 'view' AS kind, table_name AS obj
  FROM information_schema.views
 WHERE view_definition ILIKE '%contract_analyses%'
UNION ALL
-- Only count FKs that TARGET contract_analyses (confrelid) — those would
-- block a DROP. FKs whose source IS contract_analyses (conrelid) vanish with
-- the table and are not a real dependency.
SELECT 'fk', conname
  FROM pg_constraint
 WHERE contype = 'f'
   AND confrelid::regclass::text = 'contract_analyses'
UNION ALL
SELECT 'function', proname
  FROM pg_proc
 WHERE prosrc ILIKE '%contract_analyses%'
UNION ALL
SELECT 'trigger', tgname
  FROM pg_trigger
 WHERE tgrelid::regclass::text = 'contract_analyses'
   AND NOT tgisinternal;
