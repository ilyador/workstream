import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';

export const commentCountsRouter = Router();

commentCountsRouter.get('/api/comment-counts', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;

  const { data, error: countsError } = await supabase.rpc('get_comment_counts', { p_project_id: projectId });
  if (countsError) console.warn('[comments] Falling back from get_comment_counts RPC:', countsError.message);
  if (data) return res.json(data);

  const { data: tasks, error: tasksError } = await supabase.from('tasks').select('id').eq('project_id', projectId);
  if (tasksError) return res.status(400).json({ error: tasksError.message });
  if (!tasks || tasks.length === 0) return res.json({});

  const ids = tasks.map(t => t.id);
  const { data: comments, error: commentsError } = await supabase.from('comments').select('task_id').in('task_id', ids);
  if (commentsError) return res.status(400).json({ error: commentsError.message });

  const counts: Record<string, number> = {};
  for (const comment of comments || []) {
    counts[comment.task_id] = (counts[comment.task_id] || 0) + 1;
  }
  res.json(counts);
});
