-- The realtime-channel subscribes to 12 tables but only 7 were in the
-- supabase_realtime publication. The other 5 silently emitted nothing
-- regardless of channel wiring. Adding them so INSERT/UPDATE events flow.
-- DELETE still goes through realtime_delete_events (migration 00039).
do $$
declare
  tbl text;
  missing text[] := array[
    'flows',
    'flow_steps',
    'custom_task_types',
    'project_members',
    'project_invites'
  ];
begin
  foreach tbl in array missing loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
