import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';

export const customTypeListRouter = Router();

customTypeListRouter.get('/api/custom-types', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;

  const { data, error } = await supabase
    .from('custom_task_types')
    .select('*')
    .eq('project_id', projectId)
    .order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});
