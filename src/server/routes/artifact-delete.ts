import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { asRecord, requireTaskAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { readArtifactError, requireStringField } from './artifact-utils.js';

export const artifactDeleteRouter = Router();

artifactDeleteRouter.delete('/api/artifacts/:id', requireAuth, async (req, res) => {
  const artifactId = routeParam(req.params.id);
  const { data: artifact, error: artifactError } = await supabase.from('task_artifacts').select('*, tasks!inner(project_id)').eq('id', artifactId).single();
  if (artifactError) return readArtifactError(artifactError, res);
  const artifactRecord = asRecord(artifact);
  if (!artifactRecord) return res.status(404).json({ error: 'Artifact not found' });
  const taskId = requireStringField(res, artifactRecord, 'task_id', 'Artifact task');
  const storagePath = requireStringField(res, artifactRecord, 'storage_path', 'Artifact storage path');
  if (!taskId || !storagePath) return;
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;
  const { error: removeError } = await supabase.storage.from('task-artifacts').remove([storagePath]);
  if (removeError) return res.status(400).json({ error: removeError.message });
  const { error } = await supabase.from('task_artifacts').delete().eq('id', artifactId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
