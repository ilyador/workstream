-- Enable realtime for comments and task_artifacts tables so live updates
-- reach other users regardless of mutation source (API, worker, MCP, bot).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'task_artifacts'
  ) then
    alter publication supabase_realtime add table task_artifacts;
  end if;
end $$;
