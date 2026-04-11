import { randomUUID } from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, requireTaskAccess } from '../authz.js';
import { supabase } from '../supabase.js';
import {
  decodeBase64Artifact,
  normalizeMimeType,
  normalizeRepoPath,
  safeArtifactFilename,
} from './artifact-utils.js';

export const artifactCreateRouter = Router();

artifactCreateRouter.post('/api/artifacts', requireAuth, async (req, res) => {
  const { task_id, filename, mime_type, data: fileData, repo_path } = req.body;
  if (typeof task_id !== 'string' || typeof filename !== 'string' || typeof mime_type !== 'string' || typeof fileData !== 'string') {
    return res.status(400).json({ error: 'task_id, filename, mime_type, and data are required' });
  }
  const safeFilename = safeArtifactFilename(filename);
  if (!safeFilename) return res.status(400).json({ error: 'filename is invalid' });
  const normalizedMimeType = normalizeMimeType(mime_type);
  if (!normalizedMimeType) return res.status(400).json({ error: 'mime_type is invalid' });
  const normalizedRepoPath = normalizeRepoPath(repo_path);
  if (normalizedRepoPath.error) return res.status(400).json({ error: normalizedRepoPath.error });
  const decoded = decodeBase64Artifact(fileData);
  if (decoded.error || !decoded.buffer) return res.status(400).json({ error: decoded.error || 'data is invalid' });
  const access = await requireTaskAccess(req, res, task_id, 'id, project_id');
  if (!access) return;

  const storagePath = `${access.projectId}/${task_id}/${randomUUID()}-${safeFilename}`;

  const { error: uploadErr } = await supabase.storage
    .from('task-artifacts')
    .upload(storagePath, decoded.buffer, { contentType: normalizedMimeType, upsert: false });
  if (uploadErr) return res.status(500).json({ error: `Storage upload failed: ${uploadErr.message}` });

  const { data: artifact, error } = await supabase.from('task_artifacts').insert({
    task_id,
    filename: safeFilename,
    mime_type: normalizedMimeType,
    size_bytes: decoded.buffer.length,
    storage_path: storagePath,
    repo_path: normalizedRepoPath.path,
    uploaded_by: getUserId(req),
  }).select().single();
  if (error) {
    const { error: cleanupError } = await supabase.storage.from('task-artifacts').remove([storagePath]);
    if (cleanupError) console.error(`[artifacts] Failed to clean up orphaned upload ${storagePath}:`, cleanupError.message);
    return res.status(400).json({ error: error.message });
  }
  res.json({ ...artifact, url: `/api/artifacts/${artifact.id}/download` });
});
