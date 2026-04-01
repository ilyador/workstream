-- 1. Enable RLS on custom_task_types and add policies
alter table custom_task_types enable row level security;

create policy "custom_types_select" on custom_task_types for select using (
  exists (select 1 from project_members where project_id = custom_task_types.project_id and user_id = auth.uid())
);
create policy "custom_types_insert" on custom_task_types for insert with check (
  exists (select 1 from project_members where project_id = custom_task_types.project_id and user_id = auth.uid())
);
create policy "custom_types_update" on custom_task_types for update using (
  exists (select 1 from project_members where project_id = custom_task_types.project_id and user_id = auth.uid())
);
create policy "custom_types_delete" on custom_task_types for delete using (
  exists (select 1 from project_members where project_id = custom_task_types.project_id and user_id = auth.uid() and role = 'admin')
);

-- 2. Add CHECK constraint on checkpoint_status
alter table jobs add constraint jobs_checkpoint_status_check
  check (checkpoint_status in ('active', 'reverted', 'cleaned'));

-- 3. Add DELETE policy on jobs table
create policy "jobs_delete" on jobs for delete using (
  exists (select 1 from project_members where project_id = jobs.project_id and user_id = auth.uid())
);

-- 4. Add index on custom_task_types.project_id
create index idx_custom_task_types_project on custom_task_types(project_id);

-- 5. Prevent task self-blocking
alter table task_blockers add constraint no_self_block check (task_id <> blocked_by);

-- 6. Add CHECK on projects.name (non-empty)
alter table projects add constraint projects_name_check check (length(trim(name)) > 0);
