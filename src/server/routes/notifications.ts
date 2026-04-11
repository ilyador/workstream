import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const notificationsRouter = Router();

notificationsRouter.get('/api/notifications', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, task_id, workstream_id, message, read, created_at, tasks ( project_id, workstreams ( status ) )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: error.message });
  const enriched = (data || []).map((n: Record<string, unknown>) => {
    const tasks = n.tasks as { project_id?: string; workstreams?: { status?: string } } | null;
    return {
      id: n.id,
      type: n.type,
      task_id: n.task_id,
      workstream_id: n.workstream_id,
      message: n.message,
      read: n.read,
      created_at: n.created_at,
      project_id: tasks?.project_id ?? null,
      workstream_archived: tasks?.workstreams?.status === 'archived',
    };
  });
  res.json(enriched);
});

notificationsRouter.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const notificationId = routeParam(req.params.id);
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId).eq('user_id', userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

notificationsRouter.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
