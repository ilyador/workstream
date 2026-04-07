import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, isMissingRowError, requireTaskAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const commentDeleteRouter = Router();

commentDeleteRouter.delete('/api/comments/:id', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const commentId = routeParam(req.params.id);
  const { data: comment, error: commentError } = await supabase.from('comments').select('user_id, task_id').eq('id', commentId).single();
  if (commentError) {
    return res.status(isMissingRowError(commentError) ? 404 : 400).json({
      error: isMissingRowError(commentError) ? 'Comment not found' : commentError.message,
    });
  }
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const taskId = typeof comment.task_id === 'string' ? comment.task_id : '';
  if (!taskId || !await requireTaskAccess(req, res, taskId, 'id, project_id')) return;
  if (comment.user_id !== userId) return res.status(403).json({ error: 'Can only delete your own comments' });

  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
