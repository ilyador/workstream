import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { revertToCheckpoint } from '../checkpoint.js';
import {
  requireAuthorizedLocalPath,
  requireJobAccess,
  routeParam,
  stringField,
} from '../authz.js';
import { supabase } from '../supabase.js';
import { errorMessage } from './execution-helpers.js';

export const jobRejectRouter = Router();

jobRejectRouter.post('/api/jobs/:id/reject', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId);
  if (!access) return;
  const job = access.record;
  if (job.status !== 'review') return res.status(400).json({ error: 'Job is not in review' });
  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });

  const localPath = stringField(job, 'local_path');
  if (localPath) {
    const authorizedLocalPath = requireAuthorizedLocalPath(res, access.member, localPath);
    if (!authorizedLocalPath) return;
    try {
      revertToCheckpoint(authorizedLocalPath, jobId);
    } catch (error) {
      console.warn(`[reject] Checkpoint revert failed for job ${jobId}:`, errorMessage(error, 'revert failed'));
    }
  }

  const { data: artifacts, error: artifactsError } = await supabase.from('task_artifacts').select('id, storage_path').eq('task_id', taskId);
  if (artifactsError) return res.status(400).json({ error: artifactsError.message });
  if (artifacts && artifacts.length > 0) {
    const storagePaths = artifacts.map(artifact => artifact.storage_path).filter((value): value is string => typeof value === 'string');
    const { error: artifactDeleteErr } = await supabase.from('task_artifacts').delete().eq('task_id', taskId);
    if (artifactDeleteErr) return res.status(400).json({ error: artifactDeleteErr.message });
    if (storagePaths.length > 0) {
      const { error: removeErr } = await supabase.storage.from('task-artifacts').remove(storagePaths);
      if (removeErr) console.error(`[reject] Failed to remove artifact storage for task ${taskId}:`, removeErr.message);
    }
  }

  const { error: taskUpdateErr } = await supabase.from('tasks').update({ status: 'todo', followup_notes: null, completed_at: null }).eq('id', taskId);
  if (taskUpdateErr) return res.status(400).json({ error: taskUpdateErr.message });
  const { error: jobDeleteErr } = await supabase.from('jobs').delete().eq('id', jobId);
  if (jobDeleteErr) {
    const { error: rollbackErr } = await supabase.from('tasks').update({ status: 'review' }).eq('id', taskId);
    if (rollbackErr) console.error(`[reject] Failed to roll back task ${taskId}:`, rollbackErr.message);
    return res.status(400).json({ error: jobDeleteErr.message });
  }

  res.json({ ok: true });
});
