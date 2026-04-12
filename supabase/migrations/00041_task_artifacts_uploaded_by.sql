-- Track which user uploaded each task artifact so that deletion can be
-- restricted to the uploader (or a project admin). Existing rows and
-- system/orchestrator-created rows leave this NULL.
alter table public.task_artifacts
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null;
