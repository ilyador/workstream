import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const notificationsRouter = Router();

notificationsRouter.get('/api/notifications', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
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
