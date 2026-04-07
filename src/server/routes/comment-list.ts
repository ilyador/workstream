import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireTaskAccess } from '../authz.js';
import { supabase } from '../supabase.js';

export const commentListRouter = Router();

commentListRouter.get('/api/comments', requireAuth, async (req, res) => {
  const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : '';
  if (!taskId) return res.status(400).json({ error: 'task_id required' });
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;

  const { data, error } = await supabase
    .from('comments')
    .select('*, profiles(name, initials)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});
