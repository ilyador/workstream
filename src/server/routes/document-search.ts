import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { search } from '../rag/service.js';
import { errorMessage, searchLimit } from './document-utils.js';

export const documentSearchRouter = Router();

documentSearchRouter.post('/api/documents/search', requireAuth, async (req, res) => {
  const { project_id, query, limit } = req.body;
  if (typeof project_id !== 'string' || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'project_id and query required' });
  }
  if (!await requireProjectMember(req, res, project_id)) return;

  try {
    const results = await search(project_id, query, searchLimit(limit));
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, 'Search failed') });
  }
});
