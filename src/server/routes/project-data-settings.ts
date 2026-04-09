import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectAdmin, requireProjectMember, routeParam } from '../authz.js';
import { projectDataSettingsFromRecord, PROJECT_DATA_SELECT } from '../project-data-settings.js';
import { reindexProjectDocuments } from '../rag/ingest.js';
import { supabase } from '../supabase.js';
import { DEFAULT_PROJECT_DATA_SETTINGS, normalizeProjectDataSettings, projectDataEmbeddingsChanged } from '../../shared/project-data.js';

export const projectDataSettingsRouter = Router();

projectDataSettingsRouter.get('/api/projects/:id/project-data', requireAuth, async (req, res) => {
  const projectId = routeParam(req.params.id);
  if (!await requireProjectMember(req, res, projectId)) return;

  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_DATA_SELECT)
    .eq('id', projectId)
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(projectDataSettingsFromRecord(data));
});

projectDataSettingsRouter.patch('/api/projects/:id/project-data', requireAuth, async (req, res) => {
  const projectId = routeParam(req.params.id);
  const admin = await requireProjectAdmin(req, res, projectId);
  if (!admin) return;

  const payload = normalizeProjectDataSettings({
    enabled: req.body.enabled,
    backend: req.body.backend,
    baseUrl: req.body.baseUrl,
    embeddingModel: req.body.embeddingModel,
    topK: req.body.topK,
  });

  const { data: currentProject, error: currentProjectError } = await supabase
    .from('projects')
    .select(PROJECT_DATA_SELECT)
    .eq('id', projectId)
    .single();
  if (currentProjectError) return res.status(400).json({ error: currentProjectError.message });
  const current = projectDataSettingsFromRecord(currentProject);

  const { count: documentCount, error: documentCountError } = await supabase
    .from('rag_documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (documentCountError) return res.status(400).json({ error: documentCountError.message });

  const shouldReindex = req.body.reindex === true;
  const hasDocuments = (documentCount ?? 0) > 0;
  const settingsChanged = projectDataEmbeddingsChanged(current, payload);
  if (hasDocuments && settingsChanged && !shouldReindex) {
    return res.status(409).json({
      error: 'Changing Project Data embedding settings requires reindexing existing documents.',
    });
  }

  const update = {
    project_data_enabled: payload.enabled,
    project_data_backend: payload.backend,
    project_data_base_url: payload.baseUrl || DEFAULT_PROJECT_DATA_SETTINGS.baseUrl,
    project_data_embedding_model: payload.embeddingModel || DEFAULT_PROJECT_DATA_SETTINGS.embeddingModel,
    project_data_top_k: payload.topK,
  };

  const { data, error } = await supabase
    .from('projects')
    .update(update)
    .eq('id', projectId)
    .select(PROJECT_DATA_SELECT)
    .single();
  if (error) return res.status(400).json({ error: error.message });

  let reindex: { total: number; ready: number; failed: number; error?: string } | null = null;
  if (hasDocuments && shouldReindex) {
    try {
      reindex = await reindexProjectDocuments(projectId, payload);
    } catch (err) {
      reindex = {
        total: documentCount ?? 0,
        ready: 0,
        failed: documentCount ?? 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  res.json({ ...projectDataSettingsFromRecord(data), reindex });
});
