import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectAdmin, routeParam } from '../authz.js';
import { ingestDocument } from '../rag/service.js';
import { documentType, errorMessage, safeDocumentName } from './document-utils.js';

export const documentTextRouter = Router();

documentTextRouter.post('/api/projects/:id/documents/text', requireAuth, async (req, res) => {
  const projectId = routeParam(req.params.id);
  if (!await requireProjectAdmin(req, res, projectId)) return;
  const { name, content } = req.body;
  if (typeof name !== 'string' || typeof content !== 'string' || !name.trim() || !content.trim()) {
    return res.status(400).json({ error: 'name and content required' });
  }
  const safeName = safeDocumentName(name);
  if (!safeName) return res.status(400).json({ error: 'name is invalid' });

  try {
    const fileType = documentType(safeName);
    const result = await ingestDocument(projectId, safeName, fileType === 'pdf' || fileType === 'docx' ? 'txt' : fileType, content);
    if (result.status === 'error') return res.status(500).json({ error: 'Ingestion failed', id: result.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, 'Ingestion failed') });
  }
});
