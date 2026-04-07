import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember, routeParam } from '../authz.js';
import { ingestDocument } from '../rag/service.js';
import { documentType, errorMessage, safeDocumentName } from './document-utils.js';
import { documentUpload } from './document-upload.js';

export const documentUploadRouter = Router();

documentUploadRouter.post('/api/projects/:id/documents', requireAuth, documentUpload.single('file'), async (req, res) => {
  const projectId = routeParam(req.params.id);
  if (!await requireProjectMember(req, res, projectId)) return;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const name = safeDocumentName(file.originalname);
  if (!name) return res.status(400).json({ error: 'filename is invalid' });

  try {
    const result = await ingestDocument(projectId, name, documentType(name), file.buffer);
    if (result.status === 'error') return res.status(500).json({ error: 'Ingestion failed', id: result.id });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, 'Ingestion failed') });
  }
});
