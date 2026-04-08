import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import {
  requireExactRegisteredLocalPath,
  requireProjectMember,
  requireTaskAccess,
  stringField,
} from '../authz.js';
import { hasActiveTaskJob } from '../supabase.js';
import { activeWorkstreamJobId, createQueuedRunJob } from './run-queue.js';
import { runBody } from './run-validation.js';

export const runRouter = Router();

runRouter.post('/api/run', requireAuth, async (req, res) => {
  const body = runBody(req.body);
  if ('error' in body) return res.status(400).json({ error: body.error });
  const { taskId, projectId, localPath } = body;

  const membership = await requireProjectMember(req, res, projectId);
  if (!membership) return;
  if (membership.role === 'manager') return res.status(403).json({ error: 'Managers cannot run AI tasks' });
  const authorizedLocalPath = requireExactRegisteredLocalPath(res, membership, localPath);
  if (!authorizedLocalPath) return;

  const taskAccess = await requireTaskAccess(req, res, taskId);
  if (!taskAccess) return;
  const task = taskAccess.record;
  if (taskAccess.projectId !== projectId) return res.status(400).json({ error: 'Task does not belong to projectId' });
  if (stringField(task, 'mode') !== 'ai') return res.status(400).json({ error: 'Only AI tasks can be run' });

  try {
    const active = await hasActiveTaskJob(taskId);
    if (active) return res.status(409).json({ error: 'A job is already queued, running, or paused for this task', jobId: active.id });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check active jobs' });
  }

  const workstreamId = stringField(task, 'workstream_id');
  if (workstreamId) {
    const active = await activeWorkstreamJobId(workstreamId);
    if ('error' in active) return res.status(500).json({ error: active.error });
    const activeJobId = active.jobId;
    if (activeJobId) {
      return res.status(409).json({ error: 'Another task in this workstream is already running', jobId: activeJobId });
    }
  }

  const queued = await createQueuedRunJob({ task, taskId, projectId, localPath: authorizedLocalPath });
  if ('error' in queued) return res.status(500).json({ error: queued.error });
  res.json({ jobId: queued.jobId });
});
