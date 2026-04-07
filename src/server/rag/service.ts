import { supabase } from '../supabase.js';
import { embed } from './embeddings.js';
export { ingestDocument } from './ingest.js';

const TOP_K = parseInt(process.env.RAG_TOP_K || '5');

export interface SearchResult {
  content: string;
  file_name: string;
  document_id: string;
  chunk_index: number;
  similarity: number;
}

function resultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

export async function search(projectId: string, query: string, limit?: number): Promise<SearchResult[]> {
  const k = limit ?? TOP_K;
  const [queryEmbedding] = await embed(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_rag_chunks', {
    p_project_id: projectId,
    p_query_embedding: embeddingStr,
    p_limit: k,
  });

  if (error) throw new Error(`RAG search failed: ${error.message}`);
  return (data || []).map((row: unknown) => {
    const record = resultRecord(row);
    return {
      content: stringValue(record, 'content'),
      file_name: stringValue(record, 'file_name'),
      document_id: stringValue(record, 'document_id'),
      chunk_index: Number(record.chunk_index),
      similarity: Number(record.similarity),
    };
  });
}

export async function listDocuments(projectId: string) {
  const { data, error } = await supabase
    .from('rag_documents')
    .select('id, file_name, file_type, file_size, chunk_count, status, error, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return data || [];
}

export async function deleteDocument(documentId: string) {
  const { error } = await supabase.from('rag_documents').delete().eq('id', documentId);
  if (error) throw new Error(`Failed to delete document: ${error.message}`);
}
