import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireTaskAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const taskDetailsRouter = Router();

taskDetailsRouter.get('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = routeParam(req.params.id);
  const access = await requireTaskAccess(req, res, taskId);
  if (!access) return;
  const task = access.record;

  const [{ data: jobs, error: jobsError }, { data: comments, error: commentsError }] = await Promise.all([
    supabase.from('jobs').select('*').eq('task_id', taskId).order('started_at', { ascending: false }),
    supabase.from('comments').select('*, profiles(name, initials)').eq('task_id', taskId).order('created_at', { ascending: true }),
  ]);
  if (jobsError || commentsError) return res.status(400).json({ error: jobsError?.message || commentsError?.message });

  res.json({ task, jobs: jobs || [], comments: comments || [] });
});
