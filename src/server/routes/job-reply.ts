import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireJobAccess, routeParam, stringField } from '../authz.js';
import { supabase } from '../supabase.js';

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

  const { error: jobUpdateErr } = await supabase.from('jobs').update({ status: 'queued', answer }).eq('id', jobId);
  if (jobUpdateErr) return res.status(400).json({ error: jobUpdateErr.message });
  const { error: taskUpdateErr } = await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', taskId);
  if (taskUpdateErr) {
    const { error: rollbackErr } = await supabase
      .from('jobs')
      .update({ status: 'paused', answer: job.answer ?? null })
      .eq('id', jobId);
    if (rollbackErr) console.error(`[jobs] Failed to roll back reply for job ${jobId}:`, rollbackErr.message);
    return res.status(400).json({ error: taskUpdateErr.message });
  }

  res.json({ ok: true });
});
