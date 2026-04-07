import { createHash } from 'node:crypto';
import { isMissingRowError } from '../authz-shared.js';
import { supabase } from '../supabase.js';
import { embed } from './embeddings.js';
import { chunkText, extractTextFromDocx, extractTextFromPdf } from './chunker.js';

const EMBED_BATCH_SIZE = 32;
const CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE || '800');
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || '200');

function contentBuffer(content: string | Buffer): Buffer {
  return typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
}

async function extractText(fileType: string, content: string | Buffer): Promise<string> {
  if (fileType === 'docx') {
    if (typeof content === 'string') throw new Error('DOCX content must be a Buffer');
    return extractTextFromDocx(content);
  }
  if (fileType === 'pdf') {
    if (typeof content === 'string') throw new Error('PDF content must be a Buffer');
    return extractTextFromPdf(content);
  }
  return typeof content === 'string' ? content : content.toString('utf-8');
}

async function insertChunks(docId: string, projectId: string, textContent: string, fileType: string): Promise<number> {
  const chunks = chunkText(textContent, fileType, CHUNK_SIZE, CHUNK_OVERLAP);
  if (chunks.length === 0) throw new Error('Document produced no text chunks');

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embed(batch.map(c => c.content));
    allEmbeddings.push(...embeddings);
  }

  for (let i = 0; i < chunks.length; i++) {
    const embedding = allEmbeddings[i];
    if (!embedding) throw new Error(`Missing embedding for chunk ${i}`);
    const { error: chunkErr } = await supabase.rpc('insert_rag_chunk', {
      p_document_id: docId,
      p_project_id: projectId,
      p_content: chunks[i].content,
      p_chunk_index: chunks[i].index,
      p_embedding: `[${embedding.join(',')}]`,
    });
    if (chunkErr) throw new Error(`Failed to insert chunk ${i}: ${chunkErr.message}`);
  }

  return chunks.length;
}

export async function ingestDocument(
  projectId: string,
  fileName: string,
  fileType: string,
  content: string | Buffer,
): Promise<{ id: string; status: string; chunkCount: number }> {
  const hashInput = contentBuffer(content);
  const contentHash = createHash('sha256').update(hashInput).digest('hex');

  const { data: existing, error: existingError } = await supabase
    .from('rag_documents')
    .select('id, status, chunk_count')
    .eq('project_id', projectId)
    .eq('content_hash', contentHash)
    .eq('status', 'ready')
    .single();
  if (existingError && !isMissingRowError(existingError)) throw new Error(`Failed to inspect existing document: ${existingError.message}`);
  if (existing) return { id: existing.id, status: 'ready', chunkCount: existing.chunk_count };

  const { data: doc, error: createErr } = await supabase
    .from('rag_documents')
    .insert({ project_id: projectId, file_name: fileName, file_type: fileType, file_size: hashInput.length, status: 'processing', content_hash: contentHash })
    .select()
    .single();
  if (createErr || !doc) throw new Error(`Failed to create document: ${createErr?.message}`);

  try {
    const textContent = await extractText(fileType, content);
    const chunkCount = await insertChunks(doc.id, projectId, textContent, fileType);
    const { error: updateErr } = await supabase
      .from('rag_documents')
      .update({ status: 'ready', chunk_count: chunkCount, content: textContent })
      .eq('id', doc.id);
    if (updateErr) throw new Error(`Failed to mark document ready: ${updateErr.message}`);
    return { id: doc.id, status: 'ready', chunkCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { error: errorUpdateErr } = await supabase.from('rag_documents').update({ status: 'error', error: msg }).eq('id', doc.id);
    if (errorUpdateErr) throw new Error(`Document ingestion failed and status update failed: ${msg}; ${errorUpdateErr.message}`);
    return { id: doc.id, status: 'error', chunkCount: 0 };
  }
}
