-- Add the unique constraint that the orchestrator's upsert depends on.
-- Without this, upsert with onConflict: 'task_id,filename' silently
-- falls back to insert and creates duplicate rows.
create unique index if not exists idx_task_artifacts_task_filename
  on public.task_artifacts (task_id, filename);
