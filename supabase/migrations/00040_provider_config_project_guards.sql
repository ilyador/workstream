create or replace function public.validate_project_embedding_provider_config_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_project_id uuid;
begin
  if new.embedding_provider_config_id is null then
    return new;
  end if;

  select project_id
  into provider_project_id
  from public.provider_configs
  where id = new.embedding_provider_config_id;

  if provider_project_id is not null and provider_project_id <> new.id then
    raise exception 'Embedding provider config must belong to the same project';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_embedding_provider_config_match on public.projects;
create trigger validate_project_embedding_provider_config_match
before insert or update of embedding_provider_config_id
on public.projects
for each row
execute function public.validate_project_embedding_provider_config_match();

create or replace function public.validate_task_provider_config_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_project_id uuid;
begin
  if new.provider_config_id is null then
    return new;
  end if;

  select project_id
  into provider_project_id
  from public.provider_configs
  where id = new.provider_config_id;

  if provider_project_id is not null and provider_project_id <> new.project_id then
    raise exception 'Task provider config must belong to the same project';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_task_provider_config_match on public.tasks;
create trigger validate_task_provider_config_match
before insert or update of project_id, provider_config_id
on public.tasks
for each row
execute function public.validate_task_provider_config_match();

create or replace function public.validate_flow_step_provider_config_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_project_id uuid;
  flow_project_id uuid;
begin
  if new.provider_config_id is null then
    return new;
  end if;

  select project_id
  into flow_project_id
  from public.flows
  where id = new.flow_id;

  select project_id
  into provider_project_id
  from public.provider_configs
  where id = new.provider_config_id;

  if flow_project_id is not null and provider_project_id is not null and provider_project_id <> flow_project_id then
    raise exception 'Flow step provider config must belong to the same project';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_flow_step_provider_config_match on public.flow_steps;
create trigger validate_flow_step_provider_config_match
before insert or update of flow_id, provider_config_id
on public.flow_steps
for each row
execute function public.validate_flow_step_provider_config_match();
