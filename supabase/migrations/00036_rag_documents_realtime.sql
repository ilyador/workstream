-- Enable realtime for rag_documents so document uploads/deletes sync to other
-- tabs and users without requiring a page refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rag_documents'
  ) then
    alter publication supabase_realtime add table rag_documents;
  end if;
end $$;
