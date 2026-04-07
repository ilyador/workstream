import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { asRecord, requireTaskAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { readArtifactError, requireStringField } from './artifact-utils.js';

export const artifactDownloadRouter = Router();

artifactDownloadRouter.get('/api/artifacts/:id/download', requireAuth, async (req, res) => {
  const artifactId = routeParam(req.params.id);
  const { data: artifact, error: artifactError } = await supabase.from('task_artifacts').select('*').eq('id', artifactId).single();
  if (artifactError) return readArtifactError(artifactError, res);
  const artifactRecord = asRecord(artifact);
  if (!artifactRecord) return res.status(404).json({ error: 'Artifact not found' });
  const taskId = requireStringField(res, artifactRecord, 'task_id', 'Artifact task');
  const storagePath = requireStringField(res, artifactRecord, 'storage_path', 'Artifact storage path');
  const filename = requireStringField(res, artifactRecord, 'filename', 'Artifact filename');
  const mimeType = requireStringField(res, artifactRecord, 'mime_type', 'Artifact MIME type');
  if (!taskId || !storagePath || !filename || !mimeType) return;
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;
  const { data: fileData, error } = await supabase.storage.from('task-artifacts').download(storagePath);
  if (error || !fileData) return res.status(500).json({ error: 'Failed to download file' });
  const safeFilename = filename.replace(/["\r\n\\]/g, '_');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  const buffer = Buffer.from(await fileData.arrayBuffer());
  res.send(buffer);
});
