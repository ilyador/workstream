import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const notificationsRouter = Router();

// `review_request` notifications carry workstream_id but no task_id, so we
// need both join paths (task → workstream AND notification → workstream)
// to resolve project_id and archive state.
type NotificationJoinRow = {
  id: string;
  type: string;
  task_id: string | null;
  workstream_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
  tasks: { project_id?: string; workstreams?: { status?: string } } | null;
  workstreams: { project_id?: string; status?: string } | null;
};

export interface EnrichedNotification {
  id: string;
  type: string;
  task_id: string | null;
  workstream_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
  project_id: string | null;
  workstream_archived: boolean;
}

export function enrichNotification(n: NotificationJoinRow): EnrichedNotification {
  const projectId = n.tasks?.project_id ?? n.workstreams?.project_id ?? null;
  const wsStatus = n.tasks?.workstreams?.status ?? n.workstreams?.status;
  return {
    id: n.id,
    type: n.type,
    task_id: n.task_id,
    workstream_id: n.workstream_id,
    message: n.message,
    read: n.read,
    created_at: n.created_at,
    project_id: projectId,
    workstream_archived: wsStatus === 'archived',
  };
}

notificationsRouter.get('/api/notifications', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, type, task_id, workstream_id, message, read, created_at, ' +
      'tasks ( project_id, workstreams ( status ) ), ' +
      'workstreams ( project_id, status )',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: error.message });
  res.json(((data || []) as unknown as NotificationJoinRow[]).map(enrichNotification));
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
