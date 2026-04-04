create extension if not exists vector with schema extensions;

create table public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  file_name text not null,
  file_type text not null,
  file_size integer not null default 0,
  chunk_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error text,
  content text,
  content_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_rag_documents_project on rag_documents(project_id);
create index idx_rag_documents_project_hash on rag_documents(project_id, content_hash);

create table public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.rag_documents(id) on delete cascade not null,
  project_id uuid not null,
  content text not null,
  chunk_index integer not null,
  embedding extensions.vector(768),
  created_at timestamptz default now()
);

create index idx_rag_chunks_document on rag_chunks(document_id);
create index idx_rag_chunks_project on rag_chunks(project_id);
create index idx_rag_chunks_embedding on rag_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table rag_documents enable row level security;
alter table rag_chunks enable row level security;

create policy "rag_documents_select" on rag_documents for select using (
  exists (select 1 from project_members where project_id = rag_documents.project_id and user_id = auth.uid())
);
create policy "rag_documents_insert" on rag_documents for insert with check (
  exists (select 1 from project_members where project_id = rag_documents.project_id and user_id = auth.uid())
);
create policy "rag_documents_delete" on rag_documents for delete using (
  exists (select 1 from project_members where project_id = rag_documents.project_id and user_id = auth.uid())
);
create policy "rag_chunks_select" on rag_chunks for select using (
  exists (select 1 from project_members where project_id = rag_chunks.project_id and user_id = auth.uid())
);
create policy "rag_chunks_insert" on rag_chunks for insert with check (
  exists (select 1 from project_members where project_id = rag_chunks.project_id and user_id = auth.uid())
);

-- Function to insert a chunk with embedding
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
$$ language plpgsql security definer;

-- Function to search chunks by vector similarity
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
$$ language plpgsql security definer;
