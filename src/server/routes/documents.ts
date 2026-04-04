import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth-middleware.js';
import { supabase } from '../supabase.js';
import { ingestDocument, search, listDocuments, deleteDocument } from '../rag/service.js';

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// List documents for a project
documentsRouter.get('/api/documents', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  const docs = await listDocuments(projectId);
  res.json(docs);
});

// Upload a file
documentsRouter.post('/api/projects/:id/documents', requireAuth, upload.single('file'), async (req, res) => {
  const projectId = req.params.id;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
  const fileType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'csv' ? 'csv' : ext === 'md' ? 'md' : 'txt';

  try {
    const result = await ingestDocument(projectId, file.originalname, fileType, file.buffer);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ingestion failed' });
  }
});

// Create document from pasted text
documentsRouter.post('/api/projects/:id/documents/text', requireAuth, async (req, res) => {
  const projectId = req.params.id;
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });

  try {
    const ext = name.split('.').pop()?.toLowerCase() || 'txt';
    const fileType = ext === 'md' ? 'md' : ext === 'csv' ? 'csv' : 'txt';
    const result = await ingestDocument(projectId, name, fileType, content);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ingestion failed' });
  }
});

// Search documents
documentsRouter.post('/api/documents/search', requireAuth, async (req, res) => {
  const { project_id, query, limit } = req.body;
  if (!project_id || !query) return res.status(400).json({ error: 'project_id and query required' });

  try {
    const results = await search(project_id, query, limit);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

// Delete a document
documentsRouter.delete('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    await deleteDocument(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
