import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireJobAccess, routeParam, stringField } from '../authz.js';
import { supabase } from '../supabase.js';

export const jobBacklogRouter = Router();

jobBacklogRouter.post('/api/jobs/:id/backlog', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId, 'id, project_id, task_id, status');
  if (!access) return;
  const job = access.record;
  if (job.status !== 'done') return res.status(400).json({ error: 'Job is not done' });

  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });
  const { error: taskUpdateErr } = await supabase.from('tasks').update({ status: 'backlog', completed_at: null }).eq('id', taskId);
  if (taskUpdateErr) return res.status(400).json({ error: taskUpdateErr.message });
  const { error: jobDeleteErr } = await supabase.from('jobs').delete().eq('id', jobId);
  if (jobDeleteErr) return res.status(400).json({ error: jobDeleteErr.message });

  res.json({ ok: true });
});
