-- ============================================================
-- Migration 00021: AI Flows — composable execution pipelines
-- ============================================================

-- 1. Flows table
create table public.flows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  icon text not null default 'bot',
  is_builtin boolean not null default false,
  agents_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, name)
);

create index idx_flows_project on flows(project_id);
alter table flows enable row level security;

create policy "flows_select" on flows for select using (
  exists (select 1 from project_members where project_id = flows.project_id and user_id = auth.uid())
);
create policy "flows_insert" on flows for insert with check (
  exists (select 1 from project_members where project_id = flows.project_id and user_id = auth.uid())
);
create policy "flows_update" on flows for update using (
  exists (select 1 from project_members where project_id = flows.project_id and user_id = auth.uid())
);
create policy "flows_delete" on flows for delete using (
  exists (select 1 from project_members where project_id = flows.project_id and user_id = auth.uid() and role = 'admin')
);

-- 2. Flow steps table
create table public.flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  name text not null,
  position integer not null,
  instructions text not null default '',
  model text not null default 'opus',
  tools text[] not null default '{}',
  context_sources text[] not null default '{"task_description","previous_step"}',
  is_gate boolean not null default false,
  on_fail_jump_to integer,
  max_retries integer not null default 0,
  on_max_retries text not null default 'pause' check (on_max_retries in ('pause', 'fail', 'skip')),
  include_agents_md boolean not null default true,
  unique(flow_id, position)
);

create index idx_flow_steps_flow on flow_steps(flow_id, position);
alter table flow_steps enable row level security;

create policy "flow_steps_select" on flow_steps for select using (
  exists (select 1 from flows f join project_members pm on pm.project_id = f.project_id where f.id = flow_steps.flow_id and pm.user_id = auth.uid())
);
create policy "flow_steps_insert" on flow_steps for insert with check (
  exists (select 1 from flows f join project_members pm on pm.project_id = f.project_id where f.id = flow_steps.flow_id and pm.user_id = auth.uid())
);
create policy "flow_steps_update" on flow_steps for update using (
  exists (select 1 from flows f join project_members pm on pm.project_id = f.project_id where f.id = flow_steps.flow_id and pm.user_id = auth.uid())
);
create policy "flow_steps_delete" on flow_steps for delete using (
  exists (select 1 from flows f join project_members pm on pm.project_id = f.project_id where f.id = flow_steps.flow_id and pm.user_id = auth.uid())
);

-- 3. Add flow_id to tasks
alter table tasks add column if not exists flow_id uuid references public.flows(id) on delete set null;

-- 4. Add flow_id and flow_snapshot to jobs
alter table jobs add column if not exists flow_id uuid references public.flows(id) on delete set null;
alter table jobs add column if not exists flow_snapshot jsonb;

-- 5. Seed default "AI Bug Fixer" flow for every existing project
do $$
declare
  proj record;
  flow_uuid uuid;
begin
  for proj in select id from projects loop
    -- Create the flow
    insert into flows (id, project_id, name, description, is_builtin)
    values (gen_random_uuid(), proj.id, 'AI Bug Fixer', 'Plan, analyze, fix, verify, review. Mirrors the bug-fix pipeline.', true)
    returning id into flow_uuid;

    -- Steps: plan + analyze + fix (session 1 candidates), verify (session 2), review (session 3)
    insert into flow_steps (flow_id, name, position, instructions, model, tools, context_sources, is_gate, on_fail_jump_to, max_retries, on_max_retries, include_agents_md) values
    (flow_uuid, 'plan', 1,
     'Read the codebase to understand the relevant files and architecture. Create a step-by-step implementation plan. List which files need to be created or modified and what changes are needed. Do NOT make any changes yet — only plan.',
     'opus', '{"Read","Grep","Glob"}',
     '{"claude_md","task_description","skills","task_images","followup_notes"}',
     false, null, 0, 'pause', true),

    (flow_uuid, 'analyze', 2,
     'Analyze the codebase to understand the problem. Identify the root cause and location. Output a structured summary of your findings.',
     'opus', '{"Read","Grep","Bash"}',
     '{"claude_md","task_description","skills","task_images","followup_notes"}',
     false, null, 0, 'pause', true),

    (flow_uuid, 'fix', 3,
     'Fix the issue based on the analysis. Make the minimal changes needed. Run tests if available.',
     'opus', '{"Read","Edit","Bash"}',
     '{"claude_md","task_description","skills","followup_notes"}',
     false, null, 0, 'pause', true),

    (flow_uuid, 'verify', 4,
     E'Run the test suite and verify the changes work. Report any issues found.\n\nIMPORTANT: You MUST end your response with a JSON verdict block:\n```json\n{"passed": true}\n```\nor if tests fail:\n```json\n{"passed": false, "reason": "Brief description of what failed"}\n```',
     'sonnet', '{"Bash","Read"}',
     '{"task_description"}',
     true, 3, 2, 'pause', false),

    (flow_uuid, 'review', 5,
     E'Review the changes made. Check code quality, architecture alignment, and completeness.\n\nIMPORTANT: You MUST end your response with a JSON verdict block:\n```json\n{"passed": true}\n```\nor if issues found:\n```json\n{"passed": false, "reason": "Brief description of issues"}\n```',
     'sonnet', '{"Read","Grep"}',
     '{"task_description","architecture_md","review_criteria","git_diff"}',
     true, 3, 1, 'pause', false);

  end loop;
end $$;

-- 6. Map existing AI tasks with type='bug-fix' to the new flow
update tasks t
set flow_id = f.id
from flows f
where f.project_id = t.project_id
  and f.name = 'AI Bug Fixer'
  and t.mode = 'ai'
  and t.flow_id is null;
