-- Task artifacts table
create table if not exists public.task_artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  phase text,
  filename text not null,
  mime_type text not null,
  size_bytes bigint,
  storage_path text not null,
  repo_path text,
  created_at timestamptz default now()
);

create index if not exists idx_task_artifacts_task_id on public.task_artifacts(task_id);

-- Add chaining column to tasks
alter table public.tasks add column if not exists chaining text not null default 'none'
  check (chaining in ('none', 'accept', 'produce', 'both'));
