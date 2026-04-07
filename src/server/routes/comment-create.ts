import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, requireTaskAccess } from '../authz.js';
import { supabase } from '../supabase.js';
import { notifyMentionedUsers } from './comment-mentions.js';

export const commentCreateRouter = Router();

commentCreateRouter.post('/api/comments', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { task_id, body } = req.body;
  if (typeof task_id !== 'string' || task_id.length === 0) return res.status(400).json({ error: 'task_id required' });
  if (typeof body !== 'string' || body.trim().length === 0) return res.status(400).json({ error: 'body required' });

  const access = await requireTaskAccess(req, res, task_id, 'id, project_id');
  if (!access) return;

  const cleanBody = body.trim();
  const { data, error } = await supabase
    .from('comments')
    .insert({ task_id, user_id: userId, body: cleanBody })
    .select('*, profiles(name, initials)')
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await notifyMentionedUsers({
    body: cleanBody,
    projectId: access.projectId,
    taskId: task_id,
    currentUserId: userId,
  });

  res.json(data);
});
