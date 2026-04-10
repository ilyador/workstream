import { createHash } from 'node:crypto';
import { isMissingRowError } from '../authz-shared.js';
import { supabase } from '../supabase.js';
import { embed } from './embeddings.js';
import { chunkText, extractTextFromDocx, extractTextFromPdf } from './chunker.js';
import { loadProjectDataSettings } from '../project-data-settings.js';
import type { ProjectDataSettings } from '../../shared/project-data.js';

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

async function insertChunks(
  docId: string,
  projectId: string,
  textContent: string,
  fileType: string,
  settings: ProjectDataSettings,
): Promise<number> {
  const chunks = chunkText(textContent, fileType, CHUNK_SIZE, CHUNK_OVERLAP);
  if (chunks.length === 0) throw new Error('Document produced no text chunks');

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embed(batch.map(c => c.content), settings);
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

export async function reindexProjectDocuments(
  projectId: string,
  settings: ProjectDataSettings,
): Promise<{ total: number; ready: number; failed: number }> {
  const { data: docs, error } = await supabase
    .from('rag_documents')
    .select('id, file_type, content')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load documents for reindex: ${error.message}`);

  const documents = Array.isArray(docs) ? docs : [];
  if (documents.length === 0) return { total: 0, ready: 0, failed: 0 };

  const { error: markErr } = await supabase
    .from('rag_documents')
    .update({ status: 'processing', error: null, chunk_count: 0 })
    .eq('project_id', projectId);
  if (markErr) throw new Error(`Failed to mark documents for reindex: ${markErr.message}`);

  const { error: deleteErr } = await supabase
    .from('rag_chunks')
    .delete()
    .eq('project_id', projectId);
  if (deleteErr) throw new Error(`Failed to clear existing project data chunks: ${deleteErr.message}`);

  let ready = 0;
  let failed = 0;

  for (const document of documents) {
    const content = typeof document.content === 'string' ? document.content : '';
    const fileType = typeof document.file_type === 'string' && document.file_type ? document.file_type : 'txt';

    if (!content.trim()) {
      failed += 1;
      const { error: statusErr } = await supabase
        .from('rag_documents')
        .update({
          status: 'error',
          error: 'Document content is missing; re-upload or re-index the document.',
          chunk_count: 0,
        })
        .eq('id', document.id);
      if (statusErr) {
        console.error(`[rag] Failed to mark document ${document.id} as error: ${statusErr.message}`);
      }
      continue;
    }

    try {
      const chunkCount = await insertChunks(document.id, projectId, content, fileType, settings);
      const { error: updateErr } = await supabase
        .from('rag_documents')
        .update({ status: 'ready', error: null, chunk_count: chunkCount, content })
        .eq('id', document.id);
      if (updateErr) throw new Error(`Failed to mark document ready: ${updateErr.message}`);
      ready += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      const { error: statusErr } = await supabase
        .from('rag_documents')
        .update({ status: 'error', error: message, chunk_count: 0 })
        .eq('id', document.id);
      if (statusErr) {
        console.error(`[rag] Failed to mark document ${document.id} as error: ${statusErr.message}`);
      }
    }
  }

  return { total: documents.length, ready, failed };
}

export async function ingestDocument(
  projectId: string,
  fileName: string,
  fileType: string,
  content: string | Buffer,
): Promise<{ id: string; status: string; chunkCount: number }> {
  const settings = await loadProjectDataSettings(projectId);
  if (!settings.enabled) throw new Error('Enable Project Data in project settings before indexing documents');
  const hashInput = contentBuffer(content);
  const contentHash = createHash('md5').update(hashInput).digest('hex');

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
    const chunkCount = await insertChunks(doc.id, projectId, textContent, fileType, settings);
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
