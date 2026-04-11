-- Supabase realtime silently strips DELETE payloads down to {id: ...} when
-- RLS is enabled, even with REPLICA IDENTITY FULL. Our broadcast handlers
-- need FK columns (project_id, task_id, ...) from the old row to scope the
-- event to the right project listeners, so `task_deleted` / `job_deleted` /
-- etc. silently no-op end-to-end.
--
-- Workaround: before each delete, a trigger copies the full old row into a
-- side table. The side table's INSERT events DO flow through realtime
-- unchanged, so the server subscribes to this one table and routes each
-- event to the matching handler via old_row -> RealtimePayload.

create table if not exists public.realtime_delete_events (
  id bigserial primary key,
  table_name text not null,
  old_row jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_realtime_delete_events_created_at
  on public.realtime_delete_events (created_at);

alter table public.realtime_delete_events replica identity full;

-- Publication membership — safe to re-add if already present
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'realtime_delete_events'
  ) then
    alter publication supabase_realtime add table realtime_delete_events;
  end if;
end $$;

-- RLS: no one except service_role reads this; keep RLS on but no policies.
alter table public.realtime_delete_events enable row level security;

create or replace function public.emit_realtime_delete_event()
returns trigger as $$
begin
  insert into public.realtime_delete_events (table_name, old_row)
  values (tg_table_name, to_jsonb(old));
  return old;
end;
$$ language plpgsql security definer;

-- Attach to every table whose deletes we broadcast.
-- Each trigger is dropped first in case we're re-running.
do $$
declare
  tbl text;
  tables text[] := array[
    'tasks','jobs','workstreams','flows','flow_steps',
    'custom_task_types','project_members','project_invites',
    'comments','task_artifacts','rag_documents','notifications'
  ];
begin
  foreach tbl in array tables loop
    execute format('drop trigger if exists %I_emit_realtime_delete on public.%I', tbl, tbl);
    execute format('create trigger %I_emit_realtime_delete before delete on public.%I for each row execute function public.emit_realtime_delete_event()', tbl, tbl);
  end loop;
end $$;

-- Periodic cleanup: drop events older than 5 minutes. Called opportunistically
-- by the server on each dispatch.
create or replace function public.purge_realtime_delete_events(p_max_age_seconds integer default 300)
returns integer as $$
declare
  deleted_count integer;
begin
  delete from public.realtime_delete_events
  where created_at < now() - make_interval(secs => p_max_age_seconds);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer;
