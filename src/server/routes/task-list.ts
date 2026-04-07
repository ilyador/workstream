import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';

export const taskListRouter = Router();

taskListRouter.get('/api/tasks', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return;

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});
