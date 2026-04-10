import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { isMissingRowError, requireProjectAdmin, routeParam, stringField } from '../authz.js';
import { deleteDocument } from '../rag/service.js';
import { supabase } from '../supabase.js';
import { errorMessage } from './document-utils.js';

export const documentDeleteRouter = Router();

documentDeleteRouter.delete('/api/documents/:id', requireAuth, async (req, res) => {
  const documentId = routeParam(req.params.id);
  const { data: doc, error: docError } = await supabase.from('rag_documents').select('project_id').eq('id', documentId).single();
  if (docError) {
    return res.status(isMissingRowError(docError) ? 404 : 400).json({
      error: isMissingRowError(docError) ? 'Document not found' : docError.message,
    });
  }
  const projectId = doc ? stringField(doc, 'project_id') : null;
  if (!projectId) return res.status(404).json({ error: 'Document not found' });
  if (!await requireProjectAdmin(req, res, projectId)) return;

  try {
    await deleteDocument(documentId);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error, 'Delete failed') });
  }
});
