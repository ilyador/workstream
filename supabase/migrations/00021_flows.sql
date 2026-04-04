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

-- 5. Seed 4 default flows for every existing project (3 steps each: execute, verify, review)
-- Uses the hybrid session model: plan+execute combined in step 1, minimal-context verify, diff-based review.
do $$
declare
  proj record;
  fid uuid;

  -- Shared verify/review instructions
  verify_instr text := E'RULES:\n- Run the test suite. Do nothing else.\n- Do NOT modify any files.\n- Do NOT attempt to fix failing tests.\n- Report what passed and what failed.\n\nRun the test suite and verify the changes work.\n\nIMPORTANT: You MUST end your response with a JSON verdict block:\n```json\n{"passed": true}\n```\nor if tests fail:\n```json\n{"passed": false, "reason": "Brief description of what failed"}\n```';
  review_instr text := E'RULES:\n- Review the git diff only. Do NOT modify files.\n- Check: code quality, architecture alignment, completeness.\n- Compare against review criteria and architecture docs if provided.\n- Focus on real issues, not style nitpicks.\n\nReview the changes made for correctness and quality.\n\nIMPORTANT: You MUST end your response with a JSON verdict block:\n```json\n{"passed": true}\n```\nor if issues found:\n```json\n{"passed": false, "reason": "Brief description of issues"}\n```';
  exec_ctx text[] := '{"opencode_md","agents_md","task_description","skills","task_images","followup_notes"}';
  verify_ctx text[] := '{"task_description"}';
  review_ctx text[] := '{"task_description","architecture_md","review_criteria","git_diff"}';
begin
  for proj in select id from projects loop

    -- AI Developer
    insert into flows (project_id, name, description, is_builtin)
    values (proj.id, 'AI Developer', 'Plan and implement features, verify with tests, review.', true)
    returning id into fid;
    insert into flow_steps (flow_id, name, position, instructions, model, tools, context_sources, is_gate, on_fail_jump_to, max_retries, on_max_retries, include_agents_md) values
    (fid, 'implement', 1, E'RULES:\n- You are implementing a task. Plan your approach first, then implement it.\n- Do NOT fix unrelated issues you discover.\n- Do NOT refactor code outside the scope of this task.\n- If requirements are ambiguous, ask -- do not guess.\n- Run tests after making changes if a test suite exists.\n\nRead the codebase to understand the relevant files and architecture. Create a plan, then implement the described feature. Follow existing code patterns.', 'opus', '{"Read","Edit","Write","Bash","Grep","Glob"}', exec_ctx, false, null, 0, 'pause', true),
    (fid, 'verify', 2, verify_instr, 'sonnet', '{"Bash","Read"}', verify_ctx, true, 1, 2, 'pause', false),
    (fid, 'review', 3, review_instr, 'sonnet', '{"Read","Grep"}', review_ctx, true, 1, 1, 'pause', false);

    -- AI Bug Hunter
    insert into flows (project_id, name, description, is_builtin)
    values (proj.id, 'AI Bug Hunter', 'Analyze bugs, fix them, verify and review.', true)
    returning id into fid;
    insert into flow_steps (flow_id, name, position, instructions, model, tools, context_sources, is_gate, on_fail_jump_to, max_retries, on_max_retries, include_agents_md) values
    (fid, 'fix', 1, E'RULES:\n- You are fixing a bug. Analyze the problem first, then fix it.\n- Do NOT fix unrelated issues you discover.\n- Do NOT refactor code outside the scope of this fix.\n- If the root cause is unclear, ask -- do not guess.\n- Run tests after making changes if a test suite exists.\n\nAnalyze the codebase to understand the bug. Identify the root cause and location. Then fix the issue with the minimal changes needed.', 'opus', '{"Read","Edit","Bash","Grep","Glob"}', exec_ctx, false, null, 0, 'pause', true),
    (fid, 'verify', 2, verify_instr, 'sonnet', '{"Bash","Read"}', verify_ctx, true, 1, 2, 'pause', false),
    (fid, 'review', 3, review_instr, 'sonnet', '{"Read","Grep"}', review_ctx, true, 1, 1, 'pause', false);

    -- AI Refactorer
    insert into flows (project_id, name, description, is_builtin)
    values (proj.id, 'AI Refactorer', 'Plan and execute refactors, verify nothing broke, review.', true)
    returning id into fid;
    insert into flow_steps (flow_id, name, position, instructions, model, tools, context_sources, is_gate, on_fail_jump_to, max_retries, on_max_retries, include_agents_md) values
    (fid, 'refactor', 1, E'RULES:\n- You are refactoring code. Plan the refactor first, then execute it.\n- Maintain all existing behavior. Do NOT change functionality.\n- Do NOT fix unrelated issues or add features.\n- Run tests after every significant change to catch regressions early.\n\nRead the codebase to understand the current structure. Plan the refactor, then execute it. Maintain all existing behavior.', 'opus', '{"Read","Edit","Bash","Grep","Glob"}', exec_ctx, false, null, 0, 'pause', true),
    (fid, 'verify', 2, verify_instr, 'sonnet', '{"Bash","Read"}', verify_ctx, true, 1, 2, 'pause', false),
    (fid, 'review', 3, review_instr, 'sonnet', '{"Read","Grep"}', review_ctx, true, 1, 1, 'pause', false);

    -- AI Tester
    insert into flows (project_id, name, description, is_builtin)
    values (proj.id, 'AI Tester', 'Plan and write tests, verify they pass, review.', true)
    returning id into fid;
    insert into flow_steps (flow_id, name, position, instructions, model, tools, context_sources, is_gate, on_fail_jump_to, max_retries, on_max_retries, include_agents_md) values
    (fid, 'write-tests', 1, E'RULES:\n- You are writing tests. Plan what to test first, then write the tests.\n- Follow existing test patterns in the project.\n- Do NOT modify production code -- only test files.\n- Run the tests after writing them to make sure they pass.\n\nRead the codebase to understand what needs testing. Follow existing test patterns. Write comprehensive tests for the described functionality.', 'opus', '{"Read","Write","Bash","Grep","Glob"}', exec_ctx, false, null, 0, 'pause', true),
    (fid, 'verify', 2, verify_instr, 'sonnet', '{"Bash","Read"}', verify_ctx, true, 1, 2, 'pause', false),
    (fid, 'review', 3, review_instr, 'sonnet', '{"Read","Grep"}', review_ctx, true, 1, 1, 'pause', false);

  end loop;
end $$;

-- 6. Map existing AI tasks to the appropriate flow by type
update tasks t set flow_id = f.id from flows f
where f.project_id = t.project_id and f.name = 'AI Bug Hunter' and t.mode = 'ai' and t.type = 'bug-fix' and t.flow_id is null;

update tasks t set flow_id = f.id from flows f
where f.project_id = t.project_id and f.name = 'AI Developer' and t.mode = 'ai' and t.type in ('feature', 'ui-fix', 'design', 'chore') and t.flow_id is null;

update tasks t set flow_id = f.id from flows f
where f.project_id = t.project_id and f.name = 'AI Refactorer' and t.mode = 'ai' and t.type = 'refactor' and t.flow_id is null;

update tasks t set flow_id = f.id from flows f
where f.project_id = t.project_id and f.name = 'AI Tester' and t.mode = 'ai' and t.type = 'test' and t.flow_id is null;
