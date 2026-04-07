-- Atomic replacement for flow step edits from the server API.
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
    tools,
    context_sources,
    is_gate,
    on_fail_jump_to,
    max_retries,
    on_max_retries,
    include_agents_md
  )
  select
    p_flow_id,
    step->>'name',
    coalesce((step->>'position')::integer, ordinality::integer),
    coalesce(step->>'instructions', ''),
    coalesce(step->>'model', 'opus'),
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'tools', '[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'context_sources', '["task_description","previous_step"]'::jsonb))), '{"task_description","previous_step"}'::text[]),
    coalesce((step->>'is_gate')::boolean, false),
    nullif(step->>'on_fail_jump_to', '')::integer,
    coalesce((step->>'max_retries')::integer, 0),
    coalesce(step->>'on_max_retries', 'pause'),
    coalesce((step->>'include_agents_md')::boolean, true)
  from jsonb_array_elements(p_steps) with ordinality as input(step, ordinality);
end;
$$;

revoke all on function public.replace_flow_steps(uuid, jsonb) from public;
revoke all on function public.replace_flow_steps(uuid, jsonb) from anon;
revoke all on function public.replace_flow_steps(uuid, jsonb) from authenticated;
grant execute on function public.replace_flow_steps(uuid, jsonb) to service_role;
