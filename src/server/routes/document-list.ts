import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { listDocuments } from '../rag/service.js';
import { errorMessage } from './document-utils.js';

export const documentListRouter = Router();

documentListRouter.get('/api/documents', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;
  try {
    const docs = await listDocuments(projectId);
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, 'Failed to list documents') });
  }
});
