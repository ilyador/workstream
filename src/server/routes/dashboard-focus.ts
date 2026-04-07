import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';

export const dashboardFocusRouter = Router();

dashboardFocusRouter.get('/api/focus', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['backlog', 'todo'])
    .order('position', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });

  if (!tasks || tasks.length === 0) return res.json({ task: null });

  const focus = tasks[0];
  const next = tasks[1] || null;
  const then = tasks[2] || null;

  res.json({
    task: focus,
    reason: 'First task by position',
    next: next ? { id: next.id, title: next.title } : null,
    then: then ? { id: then.id, title: then.title } : null,
  });
});
