import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { deleteCheckpoint } from '../checkpoint.js';
import {
  requireAuthorizedLocalPath,
  requireJobAccess,
  routeParam,
  stringField,
} from '../authz.js';
import { errorMessage } from './execution-helpers.js';
import { completeOriginalJobForRework, markTaskInProgressForRework, reworkTaskRollback } from './job-rework-finalize.js';
import { queueReworkJob } from './job-rework-queue.js';
import { loadReworkTask } from './job-rework-task.js';
import { cleanupQueuedReworkJob } from './job-rework-utils.js';

export const jobReworkStartRouter = Router();

jobReworkStartRouter.post('/api/jobs/:id/rework', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId);
  if (!access) return;
  const job = access.record;
  if (job.status !== 'review' && job.status !== 'done') return res.status(400).json({ error: 'Job is not in review or done' });

  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });
  const reworkLocalPath = requireAuthorizedLocalPath(res, access.member, stringField(job, 'local_path'), 'job local_path');
  if (!reworkLocalPath) return;

  const taskResult = await loadReworkTask(taskId);
  if ('error' in taskResult) return res.status(taskResult.status).json({ error: taskResult.error });
  const { task } = taskResult;
  const queued = await queueReworkJob({ task, taskId, projectId: access.projectId, localPath: reworkLocalPath });
  if ('error' in queued) return res.status(queued.status).json({ error: queued.error });
  const newJob = queued.job;

  try {
    deleteCheckpoint(reworkLocalPath, jobId);
  } catch (error) {
    console.warn(`[rework] Checkpoint cleanup failed for job ${jobId}:`, errorMessage(error, 'cleanup failed'));
  }

  const now = new Date().toISOString();
  const taskRollback = reworkTaskRollback(task);
  const taskUpdateError = await markTaskInProgressForRework({ taskId, note: req.body.note });
  if (taskUpdateError) {
    await cleanupQueuedReworkJob(newJob);
    return res.status(400).json({ error: taskUpdateError });
  }
  const finalizeError = await completeOriginalJobForRework({ jobId, taskId, newJob, taskRollback, now });
  if (finalizeError) return res.status(400).json({ error: finalizeError });

  res.json({ jobId: newJob.id });
});
