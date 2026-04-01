-- 00006_custom_task_type.sql
-- Drop restrictive CHECK constraint on tasks.type to allow custom values.
-- The UI and runner already handle arbitrary type strings; the runner
-- falls back to the 'feature' pipeline for unknown types.

alter table tasks drop constraint tasks_type_check;
