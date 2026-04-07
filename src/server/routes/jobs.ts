import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireJobAccess, requireProjectMember, routeParam, stringField } from '../authz.js';
import { supabase } from '../supabase.js';

export const jobsRouter = Router();

jobsRouter.get('/api/jobs', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return;

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

jobsRouter.delete('/api/jobs/:id', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId, 'id, project_id, task_id, status');
  if (!access) return;
  const job = access.record;

  const taskId = stringField(job, 'task_id');
  if (job.status === 'failed' && taskId) {
    const { error: taskUpdateError } = await supabase.from('tasks').update({ status: 'backlog', completed_at: null }).eq('id', taskId);
    if (taskUpdateError) return res.status(400).json({ error: taskUpdateError.message });
  }

  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) return res.status(400).json({ error: error.message });

  res.json({ ok: true });
});
