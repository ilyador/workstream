import { createHash } from 'node:crypto';
import { supabase } from '../supabase.js';
import { embed } from './embeddings.js';
import { chunkText, extractTextFromDocx, extractTextFromPdf } from './chunker.js';

const EMBED_BATCH_SIZE = 32;
const CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE || '800');
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || '200');
const TOP_K = parseInt(process.env.RAG_TOP_K || '5');

export interface SearchResult {
  content: string;
  file_name: string;
  document_id: string;
  chunk_index: number;
  similarity: number;
}

export async function ingestDocument(
  projectId: string,
  fileName: string,
  fileType: string,
  content: string | Buffer,
): Promise<{ id: string; status: string; chunkCount: number }> {
  const contentSize = typeof content === 'string' ? Buffer.byteLength(content, 'utf-8') : content.length;
  const hashInput = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const contentHash = createHash('md5').update(hashInput).digest('hex');

  // Check for existing document with same content hash
  const { data: existing } = await supabase
    .from('rag_documents')
    .select('id, status, chunk_count')
    .eq('project_id', projectId)
    .eq('content_hash', contentHash)
    .eq('status', 'ready')
    .single();

  if (existing) return { id: existing.id, status: 'ready', chunkCount: existing.chunk_count };

  // Create document record
  const { data: doc, error: createErr } = await supabase
    .from('rag_documents')
    .insert({ project_id: projectId, file_name: fileName, file_type: fileType, file_size: contentSize, status: 'processing', content_hash: contentHash })
    .select()
    .single();

  if (createErr || !doc) throw new Error(`Failed to create document: ${createErr?.message}`);

  try {
    // Extract text
    let textContent: string;
    if (fileType === 'docx') {
      if (typeof content === 'string') throw new Error('DOCX content must be a Buffer');
      textContent = await extractTextFromDocx(content as Buffer);
    } else if (fileType === 'pdf') {
      if (typeof content === 'string') throw new Error('PDF content must be a Buffer');
      textContent = await extractTextFromPdf(content as Buffer);
    } else {
      textContent = typeof content === 'string' ? content : content.toString('utf-8');
    }

    // Chunk
    const chunks = chunkText(textContent, fileType, CHUNK_SIZE, CHUNK_OVERLAP);
    if (chunks.length === 0) throw new Error('Document produced no text chunks');

    // Embed in batches
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const embeddings = await embed(batch.map(c => c.content));
      allEmbeddings.push(...embeddings);
    }

    // Insert chunks with embeddings via RPC
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${allEmbeddings[i].join(',')}]`;
      await supabase.rpc('insert_rag_chunk', {
        p_document_id: doc.id,
        p_project_id: projectId,
        p_content: chunks[i].content,
        p_chunk_index: chunks[i].index,
        p_embedding: embeddingStr,
      });
    }

    // Update document status
    await supabase
      .from('rag_documents')
      .update({ status: 'ready', chunk_count: chunks.length, content: textContent })
      .eq('id', doc.id);

    return { id: doc.id, status: 'ready', chunkCount: chunks.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('rag_documents').update({ status: 'error', error: msg }).eq('id', doc.id);
    return { id: doc.id, status: 'error', chunkCount: 0 };
  }
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
  return (data || []).map((r: any) => ({
    content: r.content,
    file_name: r.file_name,
    document_id: r.document_id,
    chunk_index: r.chunk_index,
    similarity: Number(r.similarity),
  }));
}

export async function listDocuments(projectId: string) {
  const { data } = await supabase
    .from('rag_documents')
    .select('id, file_name, file_type, file_size, chunk_count, status, error, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function deleteDocument(documentId: string) {
  await supabase.from('rag_documents').delete().eq('id', documentId);
}
