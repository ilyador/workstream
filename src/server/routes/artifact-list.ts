import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireTaskAccess } from '../authz.js';
import { supabase } from '../supabase.js';

export const artifactListRouter = Router();

artifactListRouter.get('/api/artifacts', requireAuth, async (req, res) => {
  const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : '';
  if (!taskId) return res.status(400).json({ error: 'task_id required' });
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;
  const { data, error } = await supabase.from('task_artifacts').select('*').eq('task_id', taskId).order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  const artifacts = (data || []).map(a => ({
    ...a,
    url: `/api/artifacts/${a.id}/download`,
  }));
  res.json(artifacts);
});
