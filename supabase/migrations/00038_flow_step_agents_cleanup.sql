update public.flow_steps as step
set context_sources = coalesce(
  (
    select array_agg(normalized_source order by ordinality)
    from (
      select
        ordinality,
        case
          when source = 'claude_md' then 'agents'
          when source = 'agents_md' then null
          else source
        end as normalized_source
      from unnest(step.context_sources) with ordinality as input(source, ordinality)
    ) normalized
    where normalized_source is not null
  ),
  '{"task_description","previous_step"}'::text[]
);

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
    model,
    provider_config_id,
    tools,
    context_sources,
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
    coalesce(step->>'model', 'opus'),
    nullif(step->>'provider_config_id', '')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'tools', '[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'context_sources', '["task_description","previous_step"]'::jsonb))), '{"task_description","previous_step"}'::text[]),
    coalesce((step->>'is_gate')::boolean, false),
    nullif(step->>'on_fail_jump_to', '')::integer,
    coalesce((step->>'max_retries')::integer, 0),
    coalesce(step->>'on_max_retries', 'pause')
  from jsonb_array_elements(p_steps) with ordinality as input(step, ordinality);
end;
$$;
