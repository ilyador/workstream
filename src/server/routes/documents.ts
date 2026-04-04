import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth-middleware.js';
import { supabase } from '../supabase.js';
import { ingestDocument, search, listDocuments, deleteDocument } from '../rag/service.js';

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function requireProjectMember(userId: string, projectId: string): Promise<boolean> {
  const { data } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

// List documents for a project
documentsRouter.get('/api/documents', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember((req as any).userId, projectId)) return res.status(403).json({ error: 'Not a project member' });
  const docs = await listDocuments(projectId);
  res.json(docs);
});

// Upload a file
documentsRouter.post('/api/projects/:id/documents', requireAuth, upload.single('file'), async (req, res) => {
  const projectId = req.params.id;
  if (!await requireProjectMember((req as any).userId, projectId)) return res.status(403).json({ error: 'Not a project member' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
  const fileType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'csv' ? 'csv' : ext === 'md' ? 'md' : 'txt';

  try {
    const result = await ingestDocument(projectId, file.originalname, fileType, file.buffer);
    if (result.status === 'error') return res.status(500).json({ error: 'Ingestion failed', id: result.id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ingestion failed' });
  }
});

// Create document from pasted text
documentsRouter.post('/api/projects/:id/documents/text', requireAuth, async (req, res) => {
  const projectId = req.params.id;
  if (!await requireProjectMember((req as any).userId, projectId)) return res.status(403).json({ error: 'Not a project member' });
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });

  try {
    const ext = name.split('.').pop()?.toLowerCase() || 'txt';
    const fileType = ext === 'md' ? 'md' : ext === 'csv' ? 'csv' : 'txt';
    const result = await ingestDocument(projectId, name, fileType, content);
    if (result.status === 'error') return res.status(500).json({ error: 'Ingestion failed', id: result.id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ingestion failed' });
  }
});

// Search documents
documentsRouter.post('/api/documents/search', requireAuth, async (req, res) => {
  const { project_id, query, limit } = req.body;
  if (!project_id || !query) return res.status(400).json({ error: 'project_id and query required' });
  if (!await requireProjectMember((req as any).userId, project_id)) return res.status(403).json({ error: 'Not a project member' });

  try {
    const results = await search(project_id, query, limit);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

// Delete a document
documentsRouter.delete('/api/documents/:id', requireAuth, async (req, res) => {
  const { data: doc } = await supabase.from('rag_documents').select('project_id').eq('id', req.params.id).single();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!await requireProjectMember((req as any).userId, doc.project_id)) return res.status(403).json({ error: 'Not a project member' });

  try {
    await deleteDocument(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
