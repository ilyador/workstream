import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireJobAccess, routeParam, stringField } from '../authz.js';
import { transitionJobAndTask } from '../job-task-transition.js';

export const jobReplyRouter = Router();

jobReplyRouter.post('/api/jobs/:id/reply', requireAuth, async (req, res) => {
  const { answer } = req.body;
  if (typeof answer !== 'string' || answer.trim().length === 0) return res.status(400).json({ error: 'answer is required' });

  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId);
  if (!access) return;
  const job = access.record;
  if (job.status !== 'paused') return res.status(400).json({ error: 'Job is not paused' });

  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });

  const { data, error } = await transitionJobAndTask({
    jobId,
    expectedStatus: 'paused',
    jobUpdates: { status: 'queued', answer },
    taskId,
    taskUpdates: { status: 'in_progress' },
  });
  if (error) return res.status(400).json({ error });
  if (!data) return res.status(409).json({ error: 'Job is no longer paused' });

  res.json({ ok: true });
});
