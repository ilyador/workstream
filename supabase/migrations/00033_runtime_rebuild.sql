alter table public.projects
  add column if not exists project_data_enabled boolean not null default false,
  add column if not exists project_data_backend text not null default 'lmstudio'
    check (project_data_backend in ('lmstudio', 'ollama', 'openai_compatible')),
  add column if not exists project_data_base_url text not null default 'http://localhost:1234/v1',
  add column if not exists project_data_embedding_model text not null default 'text-embedding-nomic-embed-text-v1.5',
  add column if not exists project_data_top_k integer not null default 5
    check (project_data_top_k > 0 and project_data_top_k <= 50);

alter table public.tasks
  add column if not exists allow_project_data boolean not null default false;

alter table public.flow_steps
  rename column model to runtime_variant;

alter table public.flow_steps
  add column if not exists runtime_kind text not null default 'coding'
    check (runtime_kind in ('coding', 'image')),
  add column if not exists runtime_id text not null default 'claude_code',
  add column if not exists use_project_data boolean not null default false;

update public.flow_steps
set runtime_id = 'claude_code'
where runtime_id is null or runtime_id = '';

update public.flow_steps
set use_project_data = true
where context_sources @> array['rag']::text[];

update public.flow_steps
set context_sources = array_remove(
  array_remove(
    array_replace(context_sources, 'claude_md', 'agents'),
    'agents_md'
  ),
  'rag'
)
where context_sources is not null;

alter table public.flow_steps
  drop column if exists include_agents_md;

create or replace function public.replace_flow_steps(p_flow_id uuid, p_steps jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps must be a JSON array';
  end if;

  delete from public.flow_steps where flow_id = p_flow_id;

  insert into public.flow_steps (
    flow_id,
    name,
    position,
    instructions,
    runtime_kind,
    runtime_id,
    runtime_variant,
    tools,
    context_sources,
    use_project_data,
    is_gate,
    on_fail_jump_to,
    max_retries,
    on_max_retries
  )
  select
    p_flow_id,
    step->>'name',
    coalesce((step->>'position')::integer, ordinality::integer),
    coalesce(step->>'instructions', ''),
    coalesce(step->>'runtime_kind', 'coding'),
    coalesce(step->>'runtime_id', 'claude_code'),
    nullif(step->>'runtime_variant', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'tools', '[]'::jsonb))), '{}'::text[]),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(step->'context_sources', '["agents","task_description"]'::jsonb))),
      '{"agents","task_description"}'::text[]
    ),
    coalesce((step->>'use_project_data')::boolean, false),
    coalesce((step->>'is_gate')::boolean, false),
    nullif(step->>'on_fail_jump_to', '')::integer,
    coalesce((step->>'max_retries')::integer, 0),
    coalesce(step->>'on_max_retries', 'pause')
  from jsonb_array_elements(p_steps) with ordinality as input(step, ordinality);
end;
$$;

revoke all on function public.replace_flow_steps(uuid, jsonb) from public;
revoke all on function public.replace_flow_steps(uuid, jsonb) from anon;
revoke all on function public.replace_flow_steps(uuid, jsonb) from authenticated;
grant execute on function public.replace_flow_steps(uuid, jsonb) to service_role;
