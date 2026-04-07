import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { asRecord, requireTaskAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { readArtifactError, requireStringField } from './artifact-utils.js';

export const artifactUpdateRouter = Router();

artifactUpdateRouter.patch('/api/artifacts/:id', requireAuth, async (req, res) => {
  const artifactId = routeParam(req.params.id);
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content (string) is required' });

  const { data: artifact, error: artifactError } = await supabase.from('task_artifacts').select('*').eq('id', artifactId).single();
  if (artifactError) return readArtifactError(artifactError, res);
  const artifactRecord = asRecord(artifact);
  if (!artifactRecord) return res.status(404).json({ error: 'Artifact not found' });
  const taskId = requireStringField(res, artifactRecord, 'task_id', 'Artifact task');
  const storagePath = requireStringField(res, artifactRecord, 'storage_path', 'Artifact storage path');
  const mimeType = requireStringField(res, artifactRecord, 'mime_type', 'Artifact MIME type');
  if (!taskId || !storagePath || !mimeType) return;
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;

  const buffer = Buffer.from(content, 'utf-8');
  const { error: uploadErr } = await supabase.storage
    .from('task-artifacts')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (uploadErr) return res.status(500).json({ error: `Storage upload failed: ${uploadErr.message}` });

  const { error: updateError } = await supabase.from('task_artifacts').update({ size_bytes: buffer.length }).eq('id', artifactId);
  if (updateError) return res.status(400).json({ error: updateError.message });
  res.json({ ok: true, size_bytes: buffer.length });
});
