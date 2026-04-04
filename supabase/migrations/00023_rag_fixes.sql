-- Missing UPDATE policy on rag_documents
create policy "rag_documents_update" on rag_documents for update using (
  exists (select 1 from project_members where project_id = rag_documents.project_id and user_id = auth.uid())
);

-- Missing DELETE policy on rag_chunks
create policy "rag_chunks_delete" on rag_chunks for delete using (
  exists (select 1 from project_members where project_id = rag_chunks.project_id and user_id = auth.uid())
);

-- Fix SECURITY DEFINER functions: add set search_path
create or replace function insert_rag_chunk(
  p_document_id uuid,
  p_project_id uuid,
  p_content text,
  p_chunk_index integer,
  p_embedding text
) returns void as $$
begin
  insert into rag_chunks (document_id, project_id, content, chunk_index, embedding)
  values (p_document_id, p_project_id, p_content, p_chunk_index, p_embedding::vector);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function search_rag_chunks(
  p_project_id uuid,
  p_query_embedding text,
  p_limit integer default 5
) returns table (
  content text,
  file_name text,
  document_id uuid,
  chunk_index integer,
  similarity float
) as $$
begin
  return query
  select c.content, d.file_name, c.document_id, c.chunk_index,
         1 - (c.embedding <=> p_query_embedding::vector) as similarity
  from rag_chunks c
  join rag_documents d on d.id = c.document_id
  where c.project_id = p_project_id and d.status = 'ready'
  order by c.embedding <=> p_query_embedding::vector
  limit p_limit;
end;
$$ language plpgsql security definer set search_path = public;
